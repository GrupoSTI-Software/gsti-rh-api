import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SignupDraft from '#models/signup_draft'
import AuthMailService from '#services/auth_mail_service'
import PersonService from '#services/person_service'
import UserService from '#services/user_service'
import BusinessUnitService from '#services/business_unit_service'
import AuthTokenService from '#services/auth_token_service'
import SystemSettingService from '#services/system_setting_service'
import BillingTenantService from '#services/billing_tenant_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { resolveSignupApiError } from '#helpers/signup_api_error'
import { resolveBillingSubscriptionApiError } from '#helpers/billing_subscription_api_error'
import { planNotSelectedError } from '#helpers/billing_tenant_error'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import RoleService from '#services/role_service'

export interface StartSignupData {
  firstName: string
  lastName: string
  secondLastName?: string
  businessUnitName: string
  email: string
  billingPlanId: number
  contractedEmployees: number
}

interface ServiceResult {
  status: number
  type: string
  title: string
  message: string
  data: Record<string, unknown>
  /**
   * Campos opcionales del estándar GSTI v2 (`{ title, detail, key, errorCode }`),
   * presentes únicamente en el error nuevo de provisión de `system_settings`
   * (USRH1783712837572). El resto de `SignupDraftService` sigue devolviendo el
   * contrato legado `{ status, type, title, message, data }` sin estos campos
   * (decisión consciente de convivencia, ver spec §5).
   */
  key?: string
  detail?: string
  errorCode?: string
  code?: string
}

export default class SignupDraftService {
  private i18n: I18n
  private t: (key: string) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  private validatePassword(password: string, confirm: string): string | null {
    if (password.length < 12) return this.t('signup_password_min_length')
    if (!/[A-Z]/.test(password)) return this.t('signup_password_requires_uppercase')
    if (!/[0-9]/.test(password)) return this.t('signup_password_requires_number')
    if (!/[^A-Za-z0-9]/.test(password)) return this.t('signup_password_requires_symbol')
    if (password !== confirm) return this.t('signup_passwords_do_not_match')
    return null
  }

  private toServiceResult(error: unknown): ServiceResult | null {
    if (error instanceof BillingSubscriptionServiceError) {
      const billing = resolveBillingSubscriptionApiError(error)
      return {
        status: billing.status,
        type: 'warning',
        title: billing.title,
        message: billing.detail,
        detail: billing.detail,
        key: billing.key,
        errorCode: billing.code,
        code: billing.code,
        data: {},
      }
    }

    return null
  }

  private async validateSignupBillingSelection(
    billingPlanId: number,
    contractedEmployees: number,
    surface: 'start' | 'complete'
  ): Promise<ServiceResult | null> {
    const billingTenantService = new BillingTenantService()

    try {
      billingTenantService.assertContractedEmployees(contractedEmployees)
      if (surface === 'start') {
        await billingTenantService.assertPublicSellablePlan(billingPlanId)
      } else {
        await billingTenantService.assertPlanReadyToSubscribe(billingPlanId)
      }
    } catch (error) {
      return this.toServiceResult(error)
    }

    return null
  }

  async emailAlreadyRegistered(email: string): Promise<boolean> {
    const user = await User.query()
      .where('user_email', email)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .first()
    return !!user
  }

  generatePin(): { pinCode: string; pinExpiresAt: DateTime } {
    const pinCode = String(Math.floor(100000 + Math.random() * 900000))
    const pinExpiresAt = DateTime.now().plus({ minutes: 10 })
    return { pinCode, pinExpiresAt }
  }

  async upsertByEmail(
    data: StartSignupData,
    pinCode: string,
    pinExpiresAt: DateTime
  ): Promise<SignupDraft> {
    let draft = await SignupDraft.query().where('signup_draft_email', data.email).first()

    if (draft) {
      draft.signupDraftFirstName = data.firstName
      draft.signupDraftLastName = data.lastName
      draft.signupDraftSecondLastName = data.secondLastName ?? null
      draft.signupDraftBusinessUnitName = data.businessUnitName
      draft.signupDraftBillingPlanId = data.billingPlanId
      draft.signupDraftContractedEmployees = data.contractedEmployees
      draft.signupDraftPinCode = pinCode
      draft.signupDraftPinExpiresAt = pinExpiresAt
      draft.signupDraftEmailVerifiedAt = null
      draft.signupDraftToken = null
      await draft.save()
    } else {
      draft = await SignupDraft.create({
        signupDraftEmail: data.email,
        signupDraftFirstName: data.firstName,
        signupDraftLastName: data.lastName,
        signupDraftSecondLastName: data.secondLastName ?? null,
        signupDraftBusinessUnitName: data.businessUnitName,
        signupDraftBillingPlanId: data.billingPlanId,
        signupDraftContractedEmployees: data.contractedEmployees,
        signupDraftPinCode: pinCode,
        signupDraftPinExpiresAt: pinExpiresAt,
        signupDraftEmailVerifiedAt: null,
        signupDraftToken: null,
      })
    }

    return draft
  }

  async verifyOtp(signupDraftId: number, pinCode: string): Promise<ServiceResult> {
    const draft = await SignupDraft.query()
      .where('signup_draft_id', signupDraftId)
      .first()

    if (!draft) {
      return {
        status: 404,
        type: 'warning',
        title: 'Verify OTP',
        message: this.t('signup_draft_not_found'),
        data: {},
      }
    }

    if (!draft.signupDraftPinExpiresAt || draft.signupDraftPinExpiresAt < DateTime.now()) {
      return {
        status: 410,
        type: 'warning',
        title: 'Verify OTP',
        message: this.t('signup_otp_expired'),
        data: {},
      }
    }

    if (draft.signupDraftPinCode !== pinCode) {
      return {
        status: 401,
        type: 'warning',
        title: 'Verify OTP',
        message: this.t('signup_otp_incorrect'),
        data: {},
      }
    }

    const signupToken = randomUUID()
    draft.signupDraftEmailVerifiedAt = DateTime.now()
    draft.signupDraftToken = signupToken
    await draft.save()

    return {
      status: 200,
      type: 'success',
      title: 'Verify OTP',
      message: this.t('signup_otp_verified'),
      data: {
        signupToken,
        email: draft.signupDraftEmail,
      },
    }
  }

  async complete(data: {
    signupDraftId: number
    signupToken: string
    password: string
    passwordConfirm: string
  }): Promise<ServiceResult> {
    const draft = await SignupDraft.query()
      .where('signup_draft_id', data.signupDraftId)
      .first()

    if (!draft) {
      return {
        status: 404,
        type: 'warning',
        title: 'Signup',
        message: this.t('signup_draft_not_found'),
        data: {},
      }
    }

    if (!draft.signupDraftEmailVerifiedAt) {
      return {
        status: 403,
        type: 'warning',
        title: 'Signup',
        message: this.t('signup_email_not_verified'),
        data: {},
      }
    }

    if (draft.signupDraftToken !== data.signupToken) {
      return {
        status: 401,
        type: 'warning',
        title: 'Signup',
        message: this.t('signup_token_invalid'),
        data: {},
      }
    }

    const passwordError = this.validatePassword(data.password, data.passwordConfirm)
    if (passwordError) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: passwordError,
        data: {},
      }
    }

    const taken = await this.emailAlreadyRegistered(draft.signupDraftEmail)
    if (taken) {
      return {
        status: 409,
        type: 'warning',
        title: 'Signup',
        message: this.t('signup_email_already_registered'),
        data: { email: draft.signupDraftEmail },
      }
    }

    const personService = new PersonService(this.i18n as any)
    const userService = new UserService(this.i18n as any)
    const businessUnitService = new BusinessUnitService(this.i18n as any)
    const systemSettingService = new SystemSettingService()
    const billingSubscriptionService = new BillingSubscriptionService()

    if (
      draft.signupDraftBillingPlanId === null ||
      draft.signupDraftContractedEmployees === null
    ) {
      const missingPlan = this.toServiceResult(planNotSelectedError())
      if (missingPlan) {
        return missingPlan
      }
    }

    const billingPlanId = draft.signupDraftBillingPlanId!
    const contractedEmployees = draft.signupDraftContractedEmployees!

    const billingValidation = await this.validateSignupBillingSelection(
      billingPlanId,
      contractedEmployees,
      'complete'
    )
    if (billingValidation) {
      return billingValidation
    }

    // Slug fuera de la transacción: solo lectura de unicidad, no persiste nada.
    const slug = await businessUnitService.resolveUniqueSlug(draft.signupDraftBusinessUnitName)

    let businessUnit: BusinessUnit
    let user: User
    // El registro self-service asigna el rol owner (dueño de la cuenta contratada),
    // resuelto por slug y nunca hardcodeado: distinto del rol interno usado antes (roleId 1).
    const roleService = new RoleService()
    const ownerRole = await roleService.findRoleBySlug('owner')
    if (!ownerRole) {
      logger.error(
        'SignupDraftService.complete: el rol "owner" no existe en el catálogo de roles.'
      )
      return {
        status: 500,
        type: 'error',
        title: this.t('signup_owner_role_missing_title'),
        message: this.t('signup_owner_role_missing_detail'),
        detail: this.t('signup_owner_role_missing_detail'),
        key: 'rol-owner-no-encontrado',
        code: 'SIGNUP.ROLE.OWNER_NOT_FOUND.001',
        data: {},
      }
    }

    // UserService.create ya ejecuta related('businessUnits').attach(businessUnitIds) internamente.
    // const userData = new User()
    // userData.userEmail = draft.signupDraftEmail
    // userData.userPassword = data.password
    // userData.userActive = 1
    // userData.roleId = ownerRole.roleId
    // userData.personId = person.personId
    // userData.userToken = ''
    // userData.pinCode = ''
    // userData.userEmailType = 'personal'
    // const user = await userService.create(userData, [businessUnit.businessUnitId])

    // Armado completo del alta (Person → BusinessUnit → User → attach →
    // system_settings) todo-o-nada: un fallo en cualquier paso revierte todo,
    // sin dejar datos huérfanos (USRH1783712837572).
    try {
      const result = await db.transaction(async (trx) => {
        const personData = new Person()
        personData.personFirstname = draft.signupDraftFirstName
        personData.personLastname = draft.signupDraftLastName
        personData.personSecondLastname = draft.signupDraftSecondLastName ?? ''
        personData.personEmail = draft.signupDraftEmail
        personData.personGender = ''
        personData.personPhone = ''
        personData.personPhoneSecondary = ''
        personData.personCurp = ''
        personData.personRfc = ''
        personData.personImssNss = ''
        personData.personMaritalStatus = ''
        personData.personPlaceOfBirthCountry = ''
        personData.personPlaceOfBirthState = ''
        personData.personPlaceOfBirthCity = ''
        const trxPerson = await personService.create(personData, trx)

        const businessUnitData = new BusinessUnit()
        businessUnitData.businessUnitName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitSlug = slug
        businessUnitData.businessUnitLegalName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitActive = 1
        businessUnitData.businessUnitOrigin = 'self_service'
        const trxBusinessUnit = await businessUnitService.create(businessUnitData, trx)

        // UserService.create ya ejecuta related('businessUnits').attach(businessUnitIds) internamente.
        const userData = new User()
        userData.userEmail = draft.signupDraftEmail
        userData.userPassword = data.password
        userData.userActive = 1
        userData.roleId = ownerRole.roleId
        userData.personId = trxPerson.personId
        userData.userToken = ''
        userData.pinCode = ''
        userData.userEmailType = 'personal'
        const trxUser = await userService.create(userData, [trxBusinessUnit.businessUnitId], trx)

        // userEmailVerifiedAt no lo copia UserService.create; se persiste en un update separado.
        trxUser.userEmailVerifiedAt = DateTime.now()
        await trxUser.save()

        // Configuración base del tenant nuevo, ligada por business_unit_id y
        // copiada del registro base — dentro de la misma transacción (fail-closed).
        await systemSettingService.createForTenant(trxBusinessUnit.businessUnitId, slug, trx)

        await billingSubscriptionService.createSubscription(
          {
            businessUnitPublicId: trxBusinessUnit.businessUnitPublicId,
            billingPlanId,
            contractedEmployees,
          },
          trx
        )

        return { businessUnit: trxBusinessUnit, user: trxUser }
      })

      businessUnit = result.businessUnit
      user = result.user
    } catch (error) {
      const billingResult = this.toServiceResult(error)
      if (billingResult) {
        logger.error({ err: error }, 'SignupDraftService.complete: fallo de billing en el alta.')
        return billingResult
      }

      const resolved = resolveSignupApiError(error, 500, this.i18n)
      logger.error({ err: error }, 'SignupDraftService.complete: rollback del alta self-service.')
      return {
        status: resolved.status,
        type: 'error',
        title: resolved.title,
        message: resolved.message,
        data: {},
        key: resolved.key,
        detail: resolved.detail,
        errorCode: String(resolved.errorCode),
      }
    }

    await draft.delete()

    const authMailService = new AuthMailService()
    authMailService
      .sendWelcome({
        to: draft.signupDraftEmail,
        firstName: draft.signupDraftFirstName,
        businessUnitName: draft.signupDraftBusinessUnitName,
        language: 'es',
      })
      .catch((err) =>
        logger.error(
          { err },
          'SignupDraftService.complete: fallo al enviar correo de bienvenida.'
        )
      )

    const authTokenService = new AuthTokenService()
    const { accessToken, refreshToken } = await authTokenService.issueTokenPair(user, 'web')

    return {
      status: 200,
      type: 'success',
      title: 'Signup',
      message: this.t('signup_account_created'),
      data: {
        token: accessToken,
        refreshToken,
        user,
        businessUnit,
      },
    }
  }

  async start(data: StartSignupData): Promise<ServiceResult> {
    const taken = await this.emailAlreadyRegistered(data.email)
    if (taken) {
      return {
        status: 409,
        type: 'warning',
        title: 'Signup',
        message: this.t('signup_email_already_registered'),
        data: { email: data.email },
      }
    }

    const billingValidation = await this.validateSignupBillingSelection(
      data.billingPlanId,
      data.contractedEmployees,
      'start'
    )
    if (billingValidation) {
      return billingValidation
    }

    const { pinCode, pinExpiresAt } = this.generatePin()
    const draft = await this.upsertByEmail(data, pinCode, pinExpiresAt)

    const authMailService = new AuthMailService()
    await authMailService.sendSignupOtp({
      to: data.email,
      firstName: data.firstName,
      pinCode,
      language: 'es',
    })

    return {
      status: 200,
      type: 'success',
      title: 'Signup',
      message: this.t('signup_otp_sent'),
      data: {
        signupDraftId: draft.signupDraftId,
        expiresAt: pinExpiresAt.toISO(),
      },
    }
  }
}

import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import { secureRandomInt } from '#helpers/csprng_string'
import { BUSINESS_UNIT_SLUG_MAX_ATTEMPTS } from '../constants/business_unit.js'
import { BUSINESS_UNIT_SIGNUP_ERROR_CODES } from '../constants/business_unit_signup_error_codes.js'
import logger from '@adonisjs/core/services/logger'
import { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingSubscription from '#models/billing_subscription'
import SignupDraft from '#models/signup_draft'
import AuthMailService from '#services/auth_mail_service'
import PersonService from '#services/person_service'
import UserService from '#services/user_service'
import BusinessUnitService from '#services/business_unit_service'
import AuthTokenService from '#services/auth_token_service'
import SystemSettingService from '#services/system_setting_service'
import BillingTenantService from '#services/billing_tenant_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import { resolveSignupApiError } from '#helpers/signup_api_error'
import { resolveBillingSubscriptionApiError } from '#helpers/billing_subscription_api_error'
import { resolveBillingProviderApiError } from '#helpers/billing_provider_api_error'
import { planNotSelectedError } from '#helpers/billing_tenant_error'
import { signupTokenMatches } from '#helpers/signup_token'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_SIGNUP_COMPLETION_IN_PROGRESS_DETAIL,
} from '#constants/billing_provider_error_codes'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCheckoutProviderPort,
  isBillingCheckoutProvider,
} from '#modules/billing-provider/billing_provider.port'
import { resolveBillingProvider } from '#modules/billing-provider/billing_provider.registry'
import {
  cardNotConfirmed,
  operationNotAvailable,
  providerRequestFailed,
} from '#modules/billing-provider/billing_provider.errors'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'
import { TenantContext } from '#utils/tenant_context'
import TenantRoleProvisioningService from '#services/tenant_role_provisioning_service'
import BranchOfficeProvisioningService from '#services/branch_office_provisioning_service'

export interface StartSignupData {
  firstName: string
  lastName: string
  secondLastName?: string
  businessUnitName: string
  email: string
  billingPlanId: number
  contractedEmployees: number
}

export type SignupCardSetupData =
  | { required: false }
  | {
      required: true
      clientSecret: string
      publishableKey: string
      cardConfirmed: boolean
    }

export type SignupCardSetupErrorBody = {
  title: string
  detail: string
  key: string
  code: string
}

export type PrepareCardSetupResult =
  | { status: 200; body: { type: 'success'; data: SignupCardSetupData } }
  | { status: number; body: SignupCardSetupErrorBody }

const SIGNUP_COMPLETION_CLAIM_LEASE_SECONDS = 600

export const SIGNUP_CARD_SETUP_UNAUTHORIZED_BODY: SignupCardSetupErrorBody = {
  title: 'No pudimos validar tu registro',
  detail: 'Vuelve a iniciar el registro para continuar.',
  key: 'no-pudimos-validar-tu-registro',
  code: BILLING_PROVIDER_ERROR_CODES.CARD_SETUP_UNAUTHORIZED,
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

export const SIGNUP_COMPLETION_IN_PROGRESS_RESULT: ServiceResult = {
  status: 409,
  type: 'warning',
  title: 'Alta de empresa',
  message: BILLING_PROVIDER_SIGNUP_COMPLETION_IN_PROGRESS_DETAIL,
  detail: BILLING_PROVIDER_SIGNUP_COMPLETION_IN_PROGRESS_DETAIL,
  key: 'tu-registro-ya-se-esta-completando',
  errorCode: BILLING_PROVIDER_ERROR_CODES.SIGNUP_COMPLETION_IN_PROGRESS,
  code: BILLING_PROVIDER_ERROR_CODES.SIGNUP_COMPLETION_IN_PROGRESS,
  data: {},
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
    if (
      error instanceof BillingSubscriptionServiceError ||
      error instanceof BillingProviderServiceError
    ) {
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

  /**
   * CSPRNG (USRH1786458240779): mismo rango 100000-999999 y misma vigencia
   * de 10 minutos de siempre; solo cambia la fuente de aleatoriedad (helper
   * compartido con USRH1783115930049 y con `generateRecoveryPin`).
   */
  generatePin(): { pinCode: string; pinExpiresAt: DateTime } {
    const pinCode = String(secureRandomInt(100000, 1000000))
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

    if (!signupTokenMatches(draft.signupDraftToken, data.signupToken)) {
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

    // Slug opaco generado fuera de la transacción (USRH1787932877000).
    // La unicidad la garantiza el índice UNIQUE; el reintento acotado abajo
    // regenera el token si la base rechaza el INSERT con ER_DUP_ENTRY.
    let slug = businessUnitService.generateOpaqueSlug()

    let businessUnit: BusinessUnit
    let user: User
    let subscription: BillingSubscription

    const billingPlan = await BillingPlan.find(billingPlanId)
    const billingPlanName = billingPlan?.billingPlanName ?? `Plan #${billingPlanId}`

    let providerSubscriptionSnapshot:
      | {
          customerRef: string
          subscriptionRef: string
          billingPlanPriceId: number
          trialEndsAt: DateTime
        }
      | undefined
    let stripeCheckoutProvider: BillingCheckoutProviderPort | null = null
    let stripeClaimAttempt = 0
    const stripeCustomerRef = draft.signupDraftStripeCustomerId

    try {
      const today = toBusinessDateString()
      const currentPrice = await billingSubscriptionService.getCurrentPrice(billingPlanId, today)

      if (currentPrice?.billingPlanPriceProvider === BILLING_PROVIDER_KEYS.STRIPE) {
        let provider
        try {
          provider = resolveBillingProvider(currentPrice.billingPlanPriceProvider)
        } catch (error) {
          const mapped = this.toServiceResult(error)
          if (mapped) {
            return mapped
          }
          throw error
        }

        if (!isBillingCheckoutProvider(provider)) {
          return (
            this.toServiceResult(operationNotAvailable('createProviderSubscription')) ?? {
              status: 500,
              type: 'error',
              title: 'Error',
              message: 'Error',
              data: {},
            }
          )
        }

        const priceRef = currentPrice.billingPlanPriceStripePriceId
        if (!priceRef) {
          return (
            this.toServiceResult(operationNotAvailable('createProviderSubscription')) ?? {
              status: 500,
              type: 'error',
              title: 'Error',
              message: 'Error',
              data: {},
            }
          )
        }

        const checkoutProvider: BillingCheckoutProviderPort = provider
        stripeCheckoutProvider = checkoutProvider

        if (
          !draft.signupDraftStripeCustomerId ||
          !draft.signupDraftStripeSetupIntentId
        ) {
          const mapped = this.toServiceResult(cardNotConfirmed())
          if (mapped) {
            return mapped
          }
        }

        const claimed = await this.claimSignupCompletion(draft.signupDraftId)
        if (!claimed) {
          return SIGNUP_COMPLETION_IN_PROGRESS_RESULT
        }

        await draft.refresh()
        stripeClaimAttempt = draft.signupDraftStripeSubscriptionAttempt

        const expectedTrialEndsAt = todayInBusinessZone().plus({
          days: currentPrice.billingPlanPriceTrialDays,
        })

        const opening = await checkoutProvider.createProviderSubscription({
          owner: { kind: 'signup_draft', signupDraftId: draft.signupDraftId },
          customerRef: draft.signupDraftStripeCustomerId!,
          setupIntentRef: draft.signupDraftStripeSetupIntentId!,
          priceRef,
          trialEndsAt: expectedTrialEndsAt.toSeconds(),
          attempt: stripeClaimAttempt,
        })

        providerSubscriptionSnapshot = {
          customerRef: opening.customerRef,
          subscriptionRef: opening.subscriptionRef,
          billingPlanPriceId: currentPrice.billingPlanPriceId,
          trialEndsAt: expectedTrialEndsAt,
        }
      }
    } catch (error) {
      if (stripeClaimAttempt > 0) {
        await this.releaseCompletionClaim(draft.signupDraftId, stripeClaimAttempt)
      }
      const billingResult = this.toServiceResult(error)
      if (billingResult) {
        return billingResult
      }
      throw error
    }

    // El dueño de la cuenta ya no se busca en un catálogo global: la empresa
    // estrena su propio juego de roles (dueño, administrador y colaborador)
    // dentro de la misma transacción del alta, y de ahí sale su `owner`.
    const tenantRoleProvisioningService = new TenantRoleProvisioningService()

    // Armado completo del alta (BusinessUnit → Person → User → attach →
    // system_settings) todo-o-nada: un fallo en cualquier paso revierte todo,
    // sin dejar datos huérfanos (USRH1783712837572).
    // El bucle acota el reintento ante colisión de slug: transacción nueva
    // por intento garantiza rollback limpio y cero datos huérfanos
    // (USRH1787932877000).
    let slugAttempt = 1
    for (;;) {
    try {
      const result = await db.transaction(async (trx) => {
        // La empresa nace ANTES que el expediente del dueño: la persona necesita
        // la empresa para llevar su marca (USRH1789698261609, regla 3). El
        // bucle de colisión de slug reintenta la transacción completa, así que
        // nunca queda una persona sin marca de un intento abortado.
        const businessUnitData = new BusinessUnit()
        businessUnitData.businessUnitName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitSlug = slug
        businessUnitData.businessUnitLegalName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitActive = 1
        businessUnitData.businessUnitOrigin = 'self_service'
        const trxBusinessUnit = await businessUnitService.create(businessUnitData, trx)

        return TenantContext.run([trxBusinessUnit.businessUnitId], async () => {
        const personData = new Person()
        personData.businessUnitId = trxBusinessUnit.businessUnitId
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

        // Roles propios de la empresa, antes que el usuario: el alta necesita
        // el `owner` de ESTA empresa para asignárselo a quien la contrata.
        const tenantRoles = await tenantRoleProvisioningService.provision(
          trxBusinessUnit.businessUnitId,
          trx
        )

        // UserService.create ya ejecuta related('businessUnits').attach(businessUnitIds) internamente.
        const userData = new User()
        userData.userEmail = draft.signupDraftEmail
        userData.userPassword = data.password
        userData.userActive = 1
        userData.roleId = tenantRoles.owner.roleId
        userData.personId = trxPerson.personId
        userData.userToken = ''
        userData.pinCode = ''
        userData.userEmailType = 'personal'
        const trxUser = await userService.create(userData, [trxBusinessUnit.businessUnitId], trx)

        // userEmailVerifiedAt no lo copia UserService.create; se persiste en un update separado.
        trxUser.userEmailVerifiedAt = DateTime.now()
        await trxUser.save()

        // Configuración del tenant nuevo, ligada por business_unit_id y sembrada
        // con los defaults de la empresa — dentro de la misma transacción (fail-closed).
        await systemSettingService.createForTenant(
          {
            businessUnitId: trxBusinessUnit.businessUnitId,
            businessUnitSlug: slug,
            businessUnitName: trxBusinessUnit.businessUnitName,
          },
          trx
        )

        // Sucursal default de la empresa nueva: destino garantizado de todo
        // empleado que no traiga sucursal propia. Va en la misma transacción
        // (fail-closed): un tenant sin default rompería la invariante desde
        // el primer empleado.
        await BranchOfficeProvisioningService.ensureDefault(trxBusinessUnit.businessUnitId, trx)

        const trxSubscription = await billingSubscriptionService.createSubscription(
          {
            businessUnitPublicId: trxBusinessUnit.businessUnitPublicId,
            billingPlanId,
            contractedEmployees,
            providerSubscription: providerSubscriptionSnapshot,
          },
          trx
        )

        return { businessUnit: trxBusinessUnit, user: trxUser, subscription: trxSubscription }
        })
      })

      businessUnit = result.businessUnit
      user = result.user
      subscription = result.subscription
      break
    } catch (error) {
      // Colisión de slug: regenerar token y reintentar la transacción completa.
      if (businessUnitService.isSlugDuplicateError(error)) {
        if (slugAttempt >= BUSINESS_UNIT_SLUG_MAX_ATTEMPTS) {
          logger.error(
            { err: error, intento: slugAttempt },
            'SignupDraftService.complete: agotados los intentos para asignar slug de empresa.'
          )
          await this.compensateProviderSubscription({
            provider: stripeCheckoutProvider,
            subscriptionRef: providerSubscriptionSnapshot?.subscriptionRef ?? null,
            signupDraftId: draft.signupDraftId,
            attempt: stripeClaimAttempt,
            stripeCustomerId: stripeCustomerRef,
          })
          if (stripeClaimAttempt > 0) {
            await this.releaseCompletionClaim(draft.signupDraftId, stripeClaimAttempt)
          }
          return {
            status: 500,
            type: 'error',
            title: 'Alta de empresa',
            message: 'No fue posible completar el registro.',
            detail: 'No fue posible asignar el identificador de la empresa.',
            key: 'no-fue-posible-asignar-el-identificador-de-la-empresa',
            code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.SLUG_CONFLICT,
            data: {},
          }
        }
        slugAttempt++
        slug = businessUnitService.generateOpaqueSlug()
        logger.warn(
          { intento: slugAttempt },
          'SignupDraftService.complete: colisión de slug, reintentando con nuevo token.'
        )
        continue
      }

      await this.compensateProviderSubscription({
        provider: stripeCheckoutProvider,
        subscriptionRef: providerSubscriptionSnapshot?.subscriptionRef ?? null,
        signupDraftId: draft.signupDraftId,
        attempt: stripeClaimAttempt,
        stripeCustomerId: stripeCustomerRef,
      })
      if (stripeClaimAttempt > 0) {
        await this.releaseCompletionClaim(draft.signupDraftId, stripeClaimAttempt)
      }

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
    } // fin del bucle de reintento de slug

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

    new BillingInternalNotificationService()
      .notifySelfServiceSubscriptionCreated({
        subscription,
        businessUnitName: businessUnit.businessUnitName,
        billingPlanName,
      })
      .catch((err) =>
        logger.error(
          { err },
          'SignupDraftService.complete: fallo al notificar la contratación self-service.'
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

  private billingErrorBody(error: unknown): SignupCardSetupErrorBody | null {
    if (error instanceof BillingSubscriptionServiceError) {
      const mapped = resolveBillingSubscriptionApiError(error)
      return {
        title: mapped.title,
        detail: mapped.detail,
        key: mapped.key,
        code: mapped.code,
      }
    }
    if (error instanceof BillingProviderServiceError) {
      const mapped = resolveBillingProviderApiError(error)
      return {
        title: mapped.title,
        detail: mapped.detail,
        key: mapped.key,
        code: mapped.code,
      }
    }
    return null
  }

  private async claimSignupCompletion(signupDraftId: number): Promise<boolean> {
    const affected = await db.rawQuery(
      `UPDATE signup_drafts
       SET signup_draft_stripe_subscription_attempt = signup_draft_stripe_subscription_attempt + 1,
           signup_draft_completion_claimed_at = NOW()
       WHERE signup_draft_id = ?
         AND signup_draft_deleted_at IS NULL
         AND (
           signup_draft_completion_claimed_at IS NULL
           OR signup_draft_completion_claimed_at < NOW() - INTERVAL ? SECOND
         )`,
      [signupDraftId, SIGNUP_COMPLETION_CLAIM_LEASE_SECONDS]
    )

    const header = affected as { affectedRows?: number; rowCount?: number } | unknown[]
    if (Array.isArray(header)) {
      const first = header[0] as { affectedRows?: number } | undefined
      return Number(first?.affectedRows ?? 0) > 0
    }
    return Number((header as { affectedRows?: number }).affectedRows ?? 0) > 0
  }

  private async releaseCompletionClaim(signupDraftId: number, attempt: number): Promise<void> {
    await db.rawQuery(
      `UPDATE signup_drafts
       SET signup_draft_completion_claimed_at = NULL
       WHERE signup_draft_id = ?
         AND signup_draft_stripe_subscription_attempt = ?`,
      [signupDraftId, attempt]
    )
  }

  private async compensateProviderSubscription(params: {
    provider: BillingCheckoutProviderPort | null
    subscriptionRef: string | null
    signupDraftId: number
    attempt: number
    stripeCustomerId: string | null
  }): Promise<void> {
    const { provider, subscriptionRef, signupDraftId, attempt, stripeCustomerId } = params
    if (provider === null || subscriptionRef === null) {
      return
    }

    const existing = await BillingSubscription.query()
      .withTrashed()
      .where('billing_subscription_stripe_subscription_id', subscriptionRef)
      .first()

    if (existing) {
      logger.warn(
        { signupDraftId, stripeSubscriptionId: subscriptionRef },
        'SignupDraftService.complete: suscripción Stripe ya ligada a una fila; no se compensa.'
      )
      return
    }

    try {
      await provider.cancelProviderSubscription(subscriptionRef)
    } catch (error) {
      const code =
        error instanceof BillingProviderServiceError
          ? error.errorCode
          : BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED
      logger.error(
        {
          signupDraftId,
          attempt,
          stripeCustomerId,
          stripeSubscriptionId: subscriptionRef,
          code,
        },
        'SignupDraftService.complete: fallo al compensar suscripción Stripe.'
      )
      await new BillingInternalNotificationService().notifyProviderCompensationFailed({
        signupDraftId,
        attempt,
        stripeCustomerId: stripeCustomerId ?? '',
        stripeSubscriptionId: subscriptionRef,
        errorCode: code,
      })
    }
  }

  private async persistStripeCardSetupRefs(
    signupDraftId: number,
    _previousCustomer: string | null,
    previousSetupIntent: string | null,
    customerRef: string,
    setupIntentRef: string
  ): Promise<boolean> {
    const updated = await db
      .from('signup_drafts')
      .where('signup_draft_id', signupDraftId)
      .whereNull('signup_draft_deleted_at')
      .where((query) => {
        query
          .whereNull('signup_draft_stripe_customer_id')
          .orWhere('signup_draft_stripe_customer_id', customerRef)
      })
      .where((query) => {
        if (previousSetupIntent === null) {
          query.whereNull('signup_draft_stripe_setup_intent_id')
        } else {
          query.where('signup_draft_stripe_setup_intent_id', previousSetupIntent)
        }
        query.orWhere('signup_draft_stripe_setup_intent_id', setupIntentRef)
      })
      .update({
        signup_draft_stripe_customer_id: customerRef,
        signup_draft_stripe_setup_intent_id: setupIntentRef,
      })

    return Number(updated) > 0
  }

  /**
   * Prepara cliente Stripe y SetupIntent para el paso de tarjeta del registro (USRH1790718243123).
   * La credencial se valida antes de precio, proveedor o escritura.
   */
  async prepareCardSetup(data: {
    signupDraftId: number
    signupToken: string
  }): Promise<PrepareCardSetupResult> {
    const draft = await SignupDraft.query().where('signup_draft_id', data.signupDraftId).first()

    if (
      !draft ||
      !draft.signupDraftEmailVerifiedAt ||
      !signupTokenMatches(draft.signupDraftToken, data.signupToken)
    ) {
      return { status: 401, body: SIGNUP_CARD_SETUP_UNAUTHORIZED_BODY }
    }

    if (!draft.signupDraftBillingPlanId) {
      const body = this.billingErrorBody(planNotSelectedError())
      if (body) {
        return { status: 422, body }
      }
    }

    const employees = draft.signupDraftContractedEmployees
    if (employees === null) {
      return { status: 422, body: this.billingErrorBody(planNotSelectedError())! }
    }

    const billingValidation = await this.validateSignupBillingSelection(
      draft.signupDraftBillingPlanId!,
      employees,
      'complete'
    )
    if (billingValidation) {
      return {
        status: billingValidation.status,
        body: {
          title: billingValidation.title,
          detail: billingValidation.detail ?? billingValidation.message,
          key: billingValidation.key ?? 'error',
          code: billingValidation.code ?? billingValidation.errorCode ?? 'PLT.SUB.SYS_UNHANDLED',
        },
      }
    }

    const subscriptionService = new BillingSubscriptionService()
    const currentPrice = await subscriptionService.getCurrentPrice(
      draft.signupDraftBillingPlanId!,
      toBusinessDateString()
    )

    if (!currentPrice) {
      return {
        status: 422,
        body: this.billingErrorBody(
          new BillingSubscriptionServiceError(
            'Sin precio vigente',
            BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
            422,
            'sin-precio-vigente',
            'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
          )
        )!,
      }
    }

    if (currentPrice.billingPlanPriceProvider === BILLING_PROVIDER_KEYS.MANUAL) {
      return {
        status: 200,
        body: { type: 'success', data: { required: false } },
      }
    }

    let provider
    try {
      provider = resolveBillingProvider(currentPrice.billingPlanPriceProvider)
    } catch (error) {
      const body = this.billingErrorBody(error)
      if (body) {
        return { status: body.code.startsWith('PLT.PRV.') ? 500 : 422, body }
      }
      throw error
    }

    if (!isBillingCheckoutProvider(provider) || !currentPrice.billingPlanPriceStripePriceId) {
      return {
        status: 500,
        body: this.billingErrorBody(operationNotAvailable('prepareCardSetup'))!,
      }
    }

    const checkoutProvider = provider

    const owner = { kind: 'signup_draft' as const, signupDraftId: draft.signupDraftId }
    let customerRef = draft.signupDraftStripeCustomerId
    let setupIntentRef = draft.signupDraftStripeSetupIntentId

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const setup = await checkoutProvider.prepareCardSetup({
          owner,
          email: draft.signupDraftEmail,
          customerRef,
          setupIntentRef,
        })

        const previousCustomer = customerRef
        const previousSetupIntent = setupIntentRef
        customerRef = setup.customerRef
        setupIntentRef = setup.setupIntentRef

        const persisted = await this.persistStripeCardSetupRefs(
          draft.signupDraftId,
          previousCustomer,
          previousSetupIntent,
          setup.customerRef,
          setup.setupIntentRef
        )

        if (!persisted) {
          const reloaded = await SignupDraft.findOrFail(draft.signupDraftId)
          customerRef = reloaded.signupDraftStripeCustomerId
          setupIntentRef = reloaded.signupDraftStripeSetupIntentId
          continue
        }

        return {
          status: 200,
          body: {
            type: 'success',
            data: {
              required: true,
              clientSecret: setup.clientSecret,
              publishableKey: setup.publishableKey,
              cardConfirmed: setup.confirmed,
            },
          },
        }
      } catch (error) {
        const body = this.billingErrorBody(error)
        if (body) {
          return { status: 500, body }
        }
        throw error
      }
    }

    const body = this.billingErrorBody(
      providerRequestFailed('prepareCardSetup', {
        stripeErrorType: null,
        stripeRequestId: null,
      })
    )
    return { status: 500, body: body! }
  }
}

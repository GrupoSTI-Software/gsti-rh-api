import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import ApiToken from '#models/api_token'
import SignupDraft from '#models/signup_draft'
import AuthMailService from '#services/auth_mail_service'
import PersonService from '#services/person_service'
import UserService from '#services/user_service'
import BusinessUnitService from '#services/business_unit_service'

export interface StartSignupData {
  firstName: string
  lastName: string
  secondLastName?: string
  businessUnitName: string
  email: string
  password: string
}

interface ServiceResult {
  status: number
  type: string
  title: string
  message: string
  data: Record<string, unknown>
}

export default class SignupDraftService {
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
        message: 'El borrador de signup no fue encontrado',
        data: {},
      }
    }

    if (!draft.signupDraftPinExpiresAt || draft.signupDraftPinExpiresAt < DateTime.now()) {
      return {
        status: 422,
        type: 'warning',
        title: 'Verify OTP',
        message: 'El código OTP ha expirado',
        data: {},
      }
    }

    if (draft.signupDraftPinCode !== pinCode) {
      return {
        status: 422,
        type: 'warning',
        title: 'Verify OTP',
        message: 'El código OTP es incorrecto',
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
      message: 'Correo verificado correctamente',
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
        message: 'El borrador de signup no fue encontrado',
        data: {},
      }
    }

    if (!draft.signupDraftEmailVerifiedAt) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: 'El correo electrónico aún no ha sido verificado',
        data: {},
      }
    }

    if (draft.signupDraftToken !== data.signupToken) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: 'El token de signup es inválido',
        data: {},
      }
    }

    if (data.password !== data.passwordConfirm) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: 'Las contraseñas no coinciden',
        data: {},
      }
    }

    const taken = await this.emailAlreadyRegistered(draft.signupDraftEmail)
    if (taken) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: 'El correo electrónico ya se encuentra registrado',
        data: { email: draft.signupDraftEmail },
      }
    }

    // PersonService y UserService no aceptan cliente de transacción,
    // igual que el patrón mayoritario del repositorio.
    // Los métodos create no invocan this.i18n / this.t en la ruta de signup.
    const personService = new PersonService(null as any)
    const userService = new UserService(null as any)
    const businessUnitService = new BusinessUnitService(null as any)

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
    const person = await personService.create(personData)

    const slug = await businessUnitService.resolveUniqueSlug(draft.signupDraftBusinessUnitName)
    const businessUnitData = new BusinessUnit()
    businessUnitData.businessUnitName = draft.signupDraftBusinessUnitName
    businessUnitData.businessUnitSlug = slug
    businessUnitData.businessUnitLegalName = draft.signupDraftBusinessUnitName
    businessUnitData.businessUnitActive = 1
    const businessUnit = await businessUnitService.create(businessUnitData)

    // UserService.create ya ejecuta related('businessUnits').attach(businessUnitIds) internamente.
    const userData = new User()
    userData.userEmail = draft.signupDraftEmail
    userData.userPassword = data.password
    userData.userActive = 1
    userData.roleId = 1
    userData.personId = person.personId
    userData.userToken = ''
    userData.pinCode = ''
    userData.userEmailType = ''
    const user = await userService.create(userData, [businessUnit.businessUnitId])

    // userEmailVerifiedAt no lo copia UserService.create; se persiste en un update separado.
    user.userEmailVerifiedAt = DateTime.now()
    await user.save()

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

    const token = await User.accessTokens.create(user)
    await ApiToken.query().where('id', String(token.identifier)).update({ origin: 'web' })

    return {
      status: 200,
      type: 'success',
      title: 'Signup',
      message: 'Cuenta creada exitosamente',
      data: {
        token: token.value!.release(),
        user,
        businessUnit,
      },
    }
  }

  async start(data: StartSignupData): Promise<ServiceResult> {
    const taken = await this.emailAlreadyRegistered(data.email)
    if (taken) {
      return {
        status: 422,
        type: 'warning',
        title: 'Signup',
        message: 'El correo electrónico ya se encuentra registrado',
        data: { email: data.email },
      }
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
      message: 'Se ha enviado un código de verificación al correo indicado',
      data: {
        signupDraftId: draft.signupDraftId,
        expiresAt: pinExpiresAt.toISO(),
      },
    }
  }
}

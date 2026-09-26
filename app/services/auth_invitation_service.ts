import { DateTime } from 'luxon'
import User from '#models/user'
import BusinessUnitUser from '#models/business_unit_user'
import { AUTH_INVITATION_ERRORS } from '#constants/user_invitation_error_codes'
import { AuthInvitationServiceError } from '#exceptions/auth_invitation_service_error'
import { maskUserEmail } from '#helpers/mask_user_email'

export interface InvitationVerifyResult {
  businessUnitName: string
  userEmailMasked: string
}

export interface InvitationSetPasswordResult {
  passwordSet: true
}

/**
 * Servicio del flujo público de aceptación de invitación (USRH1786736057525).
 * Consume el token emitido por USRH1786736057522; no emite invitaciones.
 */
export default class AuthInvitationService {
  /**
   * Enlace vivo: token presente, vigencia futura y contraseña aún no fijada por el usuario.
   */
  isLiveInvitation(user: User): boolean {
    if (!user.userToken?.trim()) {
      return false
    }

    if (user.userPasswordSetAt !== null) {
      return false
    }

    if (!user.userTokenExpiresAt) {
      return false
    }

    return user.userTokenExpiresAt > DateTime.utc()
  }

  async findUserByInvitationToken(token: string): Promise<User | null> {
    return User.query()
      .where('user_token', token)
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .first()
  }

  /**
   * Resuelve el nombre de la empresa por la pivote `business_unit_users`.
   * Si hay varios vínculos vigentes, toma el más antiguo.
   */
  async resolveBusinessUnitName(userId: number): Promise<string | null> {
    const pivot = await BusinessUnitUser.query()
      .where('user_id', userId)
      .whereNull('business_unit_user_deleted_at')
      .orderBy('business_unit_user_created_at', 'asc')
      .preload('businessUnit')
      .first()

    return pivot?.businessUnit?.businessUnitName ?? null
  }

  private assertLiveInvitation(user: User | null): asserts user is User {
    if (!user || !this.isLiveInvitation(user)) {
      throw new AuthInvitationServiceError(AUTH_INVITATION_ERRORS.INVALID_LINK)
    }
  }

  async verify(token: string): Promise<InvitationVerifyResult> {
    const user = await this.findUserByInvitationToken(token)
    this.assertLiveInvitation(user)

    const businessUnitName = await this.resolveBusinessUnitName(user.userId)
    if (!businessUnitName) {
      throw new AuthInvitationServiceError(AUTH_INVITATION_ERRORS.INVALID_LINK)
    }

    return {
      businessUnitName,
      userEmailMasked: maskUserEmail(user.userEmail),
    }
  }

  async setPassword(
    token: string,
    userPassword: string,
    userPasswordConfirm: string
  ): Promise<InvitationSetPasswordResult> {
    if (userPassword !== userPasswordConfirm) {
      throw new AuthInvitationServiceError(AUTH_INVITATION_ERRORS.PASSWORD_MISMATCH)
    }

    const user = await this.findUserByInvitationToken(token)
    this.assertLiveInvitation(user)

    user.userPassword = userPassword
    user.userPasswordSetAt = DateTime.utc()
    user.userToken = null as unknown as string
    user.userTokenExpiresAt = null
    await user.save()

    return { passwordSet: true }
  }
}

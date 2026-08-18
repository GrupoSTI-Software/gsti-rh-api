import type { AuthInvitationErrorDefinition } from '#constants/user_invitation_error_codes'

/**
 * Error de dominio del flujo público de aceptación de invitación (USRH1786736057525).
 */
export class AuthInvitationServiceError extends Error {
  readonly definition: AuthInvitationErrorDefinition

  constructor(definition: AuthInvitationErrorDefinition) {
    super(definition.detail)
    this.name = 'AuthInvitationServiceError'
    this.definition = definition
  }
}

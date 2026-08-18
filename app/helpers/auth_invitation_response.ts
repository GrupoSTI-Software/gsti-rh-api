import type { Response } from '@adonisjs/core/http'
import type { AuthInvitationErrorDefinition } from '#constants/user_invitation_error_codes'

/** Respuesta estándar `{ title, detail, key, code }` del flujo de invitación. */
export function respondAuthInvitationError(
  response: Response,
  definition: AuthInvitationErrorDefinition
) {
  return response.status(definition.status).json({
    title: definition.title,
    detail: definition.detail,
    key: definition.key,
    code: definition.code,
  })
}

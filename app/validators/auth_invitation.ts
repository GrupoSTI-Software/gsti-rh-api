import vine from '@vinejs/vine'
import { PASSWORD_COMPLEXITY_PATTERN, PASSWORD_MIN_LENGTH } from '#helpers/password_policy'

/** Política única del producto: ver `app/helpers/password_policy.ts`. */
export const invitationSetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1).maxLength(150),
    userPassword: vine
      .string()
      .minLength(PASSWORD_MIN_LENGTH)
      .regex(PASSWORD_COMPLEXITY_PATTERN),
    userPasswordConfirm: vine.string(),
  })
)

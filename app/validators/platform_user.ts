import User from '#models/user'
import vine from '@vinejs/vine'

/**
 * Cuerpo para `POST /api/platform/users`.
 * `isPlatformAdmin` y `roleId` NO forman parte del contrato: los fija el servidor.
 */
export const createPlatformUserValidator = vine.compile(
  vine.object({
    personFirstname: vine.string().trim().minLength(1).maxLength(100),
    personLastname: vine.string().trim().minLength(1).maxLength(100),
    personSecondLastname: vine.string().trim().maxLength(100).optional(),
    userEmail: vine
      .string()
      .trim()
      .email()
      .maxLength(200)
      .unique(async (_db, value) => {
        const existing = await User.query().whereNull('user_deleted_at').where('user_email', value).first()
        return !existing
      }),
    userPassword: vine.string().minLength(8).maxLength(255),
  })
)

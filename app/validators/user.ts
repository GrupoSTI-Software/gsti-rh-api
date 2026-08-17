import User from '#models/user'
import vine from '@vinejs/vine'

/**
 * Validadores del módulo de usuarios (tenant).
 *
 * `userPassword` no forma parte del contrato: si un cliente legacy lo envía en
 * POST/PUT, `allowUnknownProperties()` lo deja pasar la validación y el
 * controlador lo ignora (USRH1786736057522 E7).
 */
export const createUserValidator = vine.compile(
  vine
    .object({
      userEmail: vine
        .string()
        .trim()
        .minLength(0)
        .maxLength(200)
        .unique(async (_db, value) => {
          const existingEmail = await User.query()
            .whereNull('user_deleted_at')
            .where('user_email', value)
            .first()
          return !existingEmail
        }),
      userActive: vine.boolean(),
      roleId: vine.number().min(1),
      personId: vine
        .number()
        .min(1)
        .unique(async (_db, value) => {
          const existingPersonId = await User.query()
            .where('person_id', value)
            .whereNull('user_deleted_at')
            .first()
          return !existingPersonId
        }),
    })
    .allowUnknownProperties()
)

export const updateUserValidator = vine.compile(
  vine
    .object({
      userEmail: vine.string().trim().minLength(0).maxLength(200),
      userActive: vine.boolean(),
      roleId: vine.number().min(1),
    })
    .allowUnknownProperties()
)

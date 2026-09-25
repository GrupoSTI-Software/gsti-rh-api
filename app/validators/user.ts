import Person from '#models/person'
import User from '#models/user'
import vine from '@vinejs/vine'
import { USER_EMAIL_TYPES } from '#constants/user_email_type'
import { noMaskCharRule } from './no_mask_char_rule.js'

/**
 * Validadores del módulo de usuarios (tenant).
 *
 * `userPassword` no forma parte del contrato: si un cliente legacy lo envía en
 * POST/PUT, `allowUnknownProperties()` lo deja pasar la validación y el
 * controlador lo ignora (USRH1786736057522 E7).
 *
 * `userEmailType` es opcional en los dos y SIN default aquí (USRH1789698261612):
 * el default correcto no es el mismo en alta ('institutional') y en edición
 * (el tipo guardado). Lo resuelve el controlador.
 */
export const createUserValidator = vine.compile(
  vine
    .object({
      userEmail: vine
        .string()
        .trim()
        .minLength(0)
        .maxLength(200)
        .use(noMaskCharRule())
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
      userEmailType: vine.enum(USER_EMAIL_TYPES).optional(),
    })
    .allowUnknownProperties()
)

/**
 * `personId` se declara (USRH1789698261612): antes se leía del request sin
 * validar y permitía repuntar la cuenta a cualquier persona. Ningún otro
 * usuario vivo puede tenerla, y una persona nueva debe ser visible en la
 * empresa activa. La persona que la cuenta ya tiene siempre pasa: hay cuentas
 * ligadas a personas de plataforma que el scope no ve.
 */
export const updateUserValidator = vine
  .withMetaData<{ userId: number; currentPersonId: number }>()
  .compile(
    vine
      .object({
        userEmail: vine.string().trim().minLength(0).maxLength(200).use(noMaskCharRule()),
        userActive: vine.boolean(),
        roleId: vine.number().min(1),
        personId: vine
          .number()
          .min(1)
          .unique(async (_db, value, field) => {
            const clash = await User.query()
              .whereNull('user_deleted_at')
              .where('person_id', value)
              .whereNot('user_id', field.meta.userId)
              .first()
            return !clash
          })
          .exists(async (_db, value, field) => {
            if (value === field.meta.currentPersonId) return true
            const person = await Person.query()
              .whereNull('person_deleted_at')
              .where('person_id', value)
              .first()
            return person !== null
          }),
        userEmailType: vine.enum(USER_EMAIL_TYPES).optional(),
      })
      .allowUnknownProperties()
  )

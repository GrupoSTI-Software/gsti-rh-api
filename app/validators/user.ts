import User from '#models/user'
import vine from '@vinejs/vine'

/**
 *
 *
 * Se acepta como `any` opcional porque la API admite dos formatos:
 * - Formato nuevo: arreglo de IDs numéricos.
 * - Formato legado: CSV de slugs (deprecado).
 *
 * VineJS 2.x no permite encadenar `.optional()` sobre `vine.union(...)`, por lo que
 * la discriminación de forma y la resolución contra `business_units` se delegan al
 * helper `parseBusinessUnitAccessInput` + `resolveBusinessUnitIds` invocado desde el
 * controlador. Esto preserva el contrato dual sin sacrificar tipado.
 */

export const createUserValidator = vine.compile(
  vine.object({
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
)

export const updateUserValidator = vine.compile(
  vine.object({
    userEmail: vine.string().trim().minLength(0).maxLength(200),
    userActive: vine.boolean(),
    roleId: vine.number().min(1),
  })
)

import vine from '@vinejs/vine'

/** Valida el body de POST /api/consent/me. */
export const recordAcceptanceValidator = vine.compile(
  vine.object({
    documentVersion: vine.string().trim().minLength(1).maxLength(20),
  })
)

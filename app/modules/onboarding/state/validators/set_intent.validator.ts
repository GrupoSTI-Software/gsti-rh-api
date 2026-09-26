import vine from '@vinejs/vine'

/**
 * Validador del body de PUT /api/onboarding/me/intent.
 * Solo valida tipo y formato; la existencia del flujo la verifica el service.
 */
export const setIntentValidator = vine.compile(
  vine.object({
    intentSlug: vine.string().trim().minLength(1).maxLength(100),
  })
)

export type SetIntentPayload = Awaited<ReturnType<typeof setIntentValidator.validate>>

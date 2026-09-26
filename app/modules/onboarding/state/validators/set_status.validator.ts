import vine from '@vinejs/vine'

/**
 * Validador del body de PUT /api/onboarding/me/status.
 * Solo acepta los valores terminales/lógicos: dismissed y completed.
 */
export const setStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(['dismissed', 'completed'] as const),
  })
)

export type SetStatusPayload = Awaited<ReturnType<typeof setStatusValidator.validate>>

import vine from '@vinejs/vine'

/**
 * Valida el body de POST /api/onboarding/me/trial-access.
 * El admin pasa el userId del empleado para el que genera el acceso temporal.
 */
export const requestTrialAccessValidator = vine.compile(
  vine.object({
    userId: vine.number().min(1),
  })
)

export type RequestTrialAccessPayload = Awaited<
  ReturnType<typeof requestTrialAccessValidator.validate>
>

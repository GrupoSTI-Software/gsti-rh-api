import vine from '@vinejs/vine'

/**
 * Validador del body de POST /api/onboarding/me/demo-seed/wipe
 * (USRH1785438246903): completed = FIN, dismissed = OMITIR. Ambos borran
 * TODO; solo difiere el status terminal del recorrido.
 */
export const wipeDemoSeedValidator = vine.compile(
  vine.object({
    outcome: vine.enum(['completed', 'dismissed'] as const),
  })
)

export type WipeDemoSeedPayload = Awaited<ReturnType<typeof wipeDemoSeedValidator.validate>>

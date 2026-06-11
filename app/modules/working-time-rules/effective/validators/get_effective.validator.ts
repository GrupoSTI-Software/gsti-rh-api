import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador del query de jornada efectiva.
 *
 * Exige date en formato YYYY-MM-DD. El countryCode es opcional (default MX en el
 * service). La empresa se toma del header X-Business-Unit-Id (ctx.businessUnitScope),
 * no del query. Las fallas devuelven 400 en el controller.
 */
export const getEffectiveValidator = vine.compile(
  vine.object({
    date: vine.string().trim().regex(DATE_REGEX),
    countryCode: vine.string().trim().fixedLength(2).optional(),
  })
)

export type GetEffectivePayload = Awaited<ReturnType<typeof getEffectiveValidator.validate>>

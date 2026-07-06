import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador del sellado de un periodo (POST /seal). Recibe el rango
 * [from, to] (Opción A del spec: el cálculo del periodo vive en la HU hermana).
 * La empresa se toma del header X-Business-Unit-Id, no del body.
 */
export const sealPeriodValidator = vine.compile(
  vine.object({
    from: vine.string().trim().regex(DATE_REGEX),
    to: vine.string().trim().regex(DATE_REGEX),
    employeeIds: vine.array(vine.number().positive()).optional(),
  })
)

export type SealPeriodPayload = Awaited<ReturnType<typeof sealPeriodValidator.validate>>

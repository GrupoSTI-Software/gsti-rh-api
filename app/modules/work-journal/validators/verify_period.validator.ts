import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador de la verificación de integridad (GET /verify). Rango obligatorio
 * y un empleado opcional; la empresa se toma del header X-Business-Unit-Id.
 */
export const verifyPeriodValidator = vine.compile(
  vine.object({
    from: vine.string().trim().regex(DATE_REGEX),
    to: vine.string().trim().regex(DATE_REGEX),
    employeeId: vine.number().positive().optional(),
  })
)

export type VerifyPeriodPayload = Awaited<ReturnType<typeof verifyPeriodValidator.validate>>

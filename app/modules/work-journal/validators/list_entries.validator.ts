import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador de la consulta paginada de registros de jornada (GET /).
 * La empresa se toma del header X-Business-Unit-Id, no del query.
 */
export const listEntriesValidator = vine.compile(
  vine.object({
    from: vine.string().trim().regex(DATE_REGEX),
    to: vine.string().trim().regex(DATE_REGEX),
    employeeId: vine.number().positive().optional(),
    status: vine.enum(['open', 'closed']).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(200).optional(),
  })
)

export type ListEntriesPayload = Awaited<ReturnType<typeof listEntriesValidator.validate>>

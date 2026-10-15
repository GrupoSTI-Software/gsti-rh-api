import vine from '@vinejs/vine'

/**
 * Query del listado de salidas (USRH1786568279596, §6.1). Exactamente cuatro
 * filtros además del paginado: búsqueda, estado (`open`, `closed` y, desde
 * VLRH-H1791055795208, `cancelled`), "solo con atrasados" y "solo sin
 * constancia" (USRH1788579938608) — origen, baja ejecutada y rango de fechas
 * quedaron fuera de alcance (§4).
 */
export const listOffboardingsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    search: vine.string().trim().maxLength(100).optional(),
    status: vine.enum(['open', 'closed', 'cancelled']).optional(),
    overdueOnly: vine.boolean().optional(),
    withoutSeparationLetter: vine.boolean().optional(),
  })
)

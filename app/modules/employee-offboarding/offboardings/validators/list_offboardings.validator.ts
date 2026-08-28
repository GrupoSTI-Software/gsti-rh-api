import vine from '@vinejs/vine'

/**
 * Query del listado de salidas (USRH1786568279596, §6.1). Exactamente tres
 * filtros además del paginado: búsqueda, estado y "solo con atrasados" —
 * origen, baja ejecutada y rango de fechas quedaron fuera de alcance (§4).
 */
export const listOffboardingsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    search: vine.string().trim().maxLength(100).optional(),
    status: vine.enum(['open', 'closed']).optional(),
    overdueOnly: vine.boolean().optional(),
  })
)

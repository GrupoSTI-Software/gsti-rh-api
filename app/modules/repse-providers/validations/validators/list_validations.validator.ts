import vine from '@vinejs/vine'

/**
 * El listado de validaciones es append-only y no se pagina (bitácora legal
 * completa por proveedor); este validador existe para futuros filtros
 * (p.ej. rango de fechas) sin romper la firma del endpoint.
 */
export const listProveedorRepseValidacionesValidator = vine.compile(vine.object({}))

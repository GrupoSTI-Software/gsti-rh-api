/** Órdenes que acepta `GET /api/zones` en el parámetro `sort`. */
export const ZONE_SORT = {
  NAME_ASC: 'name_asc',
  NAME_DESC: 'name_desc',
} as const

export type ZoneSort = (typeof ZONE_SORT)[keyof typeof ZONE_SORT]

/**
 * Interpreta el `sort` de la petición. Un valor ausente o desconocido devuelve
 * `null` y el listado conserva su orden por fecha de alta, que es el que
 * espera el select de zonas de Empleados.
 */
export function parseZoneSort(raw: unknown): ZoneSort | null {
  return Object.values(ZONE_SORT).includes(raw as ZoneSort) ? (raw as ZoneSort) : null
}

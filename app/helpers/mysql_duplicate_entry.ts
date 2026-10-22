/**
 * El error es un choque de MySQL con un indice unico (`ER_DUP_ENTRY`, 1062).
 *
 * Es la carrera que pierde la segunda de dos escrituras concurrentes: quien la
 * atrapa la traduce a su error de dominio (409). Cualquier otro valor, incluido
 * `null` o algo que no es objeto, no lo es.
 */
export function isDuplicateEntry(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, errno } = error as { code?: unknown; errno?: unknown }
  return code === 'ER_DUP_ENTRY' || errno === 1062
}

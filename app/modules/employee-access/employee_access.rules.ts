/** Une las partes de un nombre, sin espacios de sobra. */
export function joinName(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/** Roles que no se ofrecen como candidatos: ya ven a toda la plantilla. */
export const ACCESS_CANDIDATE_EXCLUDED_ROLE_SLUGS: readonly string[] = ['root', 'admin']

/**
 * Ids que sí se pueden dar de alta: los pedidos que están entre los
 * candidatos, sin repetir. Lo demás se ignora en silencio: o ya tiene el
 * acceso o no se le puede dar.
 */
export function eligibleIds(requested: number[], candidates: number[]): number[] {
  const allowed = new Set(candidates)
  return [...new Set(requested)].filter((id) => allowed.has(id))
}

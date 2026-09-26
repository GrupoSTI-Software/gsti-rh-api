const OPEN_END_SENTINEL = '9999-12-31'

/**
 * Determina si dos rangos de fechas civiles (YYYY-MM-DD) se solapan.
 * `fechaFin` nula se interpreta como vigencia abierta (sin fin).
 */
export function rangesOverlap(
  aInicio: string,
  aFin: string | null,
  bInicio: string,
  bFin: string | null
): boolean {
  const aEnd = aFin ?? OPEN_END_SENTINEL
  const bEnd = bFin ?? OPEN_END_SENTINEL
  return aInicio <= bEnd && bInicio <= aEnd
}

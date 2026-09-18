import type { AllianceAttributionNotAccruingReason } from '../interfaces/alliance_attribution_interface.js'

/**
 * Periodos que le quedan al plazo pactado. `null` es plazo indeterminado
 * ("sin límite"): nunca se informa como 0.
 *
 * Única fórmula de restantes: el devengo al registrar un pago y la
 * lectura del avance llaman a esta función. No reimplementar
 * `Math.max(0, plazo - devengados)` en otro sitio: la tarjeta diría
 * "agotada" mientras el pago sigue comisionando.
 *
 * @param termPeriods - Plazo pactado, o `null` si es indeterminado.
 * @param accruedPeriods - Suma de periodos de las comisiones.
 * @returns Restantes ≥ 0, o `null` si no hay tope.
 */
export function resolveRemainingTermPeriods(
  termPeriods: number | null,
  accruedPeriods: number
): number | null {
  if (termPeriods === null) {
    return null
  }
  return Math.max(0, termPeriods - accruedPeriods)
}

/**
 * Avance de una atribución a partir de su plazo, su cierre y lo ya
 * sumado en comisiones. No consulta la base: quien llama trae los
 * periodos devengados (agregado sin N+1).
 *
 * Cerrada gana sobre plazo agotado. Una atribución de alianza
 * desactivada sigue generando: este cálculo no mira `alliance_active`.
 *
 * @param termPeriods - Plazo pactado, o `null` si es indeterminado.
 * @param isClosed - `true` si `closedAt` no es nulo.
 * @param accruedPeriods - Suma de periodos de las comisiones.
 */
export function resolveAttributionAccrualProgress(
  termPeriods: number | null,
  isClosed: boolean,
  accruedPeriods: number
): {
  remainingPeriods: number | null
  isAccruing: boolean
  notAccruingReason: AllianceAttributionNotAccruingReason | null
} {
  const remainingPeriods = resolveRemainingTermPeriods(termPeriods, accruedPeriods)

  if (isClosed) {
    return {
      remainingPeriods,
      isAccruing: false,
      notAccruingReason: 'closed',
    }
  }

  if (termPeriods !== null && remainingPeriods === 0) {
    return {
      remainingPeriods: 0,
      isAccruing: false,
      notAccruingReason: 'term_exhausted',
    }
  }

  return {
    remainingPeriods,
    isAccruing: true,
    notAccruingReason: null,
  }
}

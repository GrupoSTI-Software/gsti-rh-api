/** Cifras que el flujo normal acepta con un aumento `pending_payment` vivo. */
export interface CompositeIncreaseAmounts {
  debtCents: number
  periodCents: number
  debtPlusPeriodCents: number
}

/** Entrada plana: el prorrateo ya viene en centavos; el total del cambio, en pesos decimales. */
export interface PendingIncreaseFigures {
  proratedAmountCents: number
  changeTotal: unknown
}

/** Trato congelado (pesos, decimal) → centavos con redondeo único. Null si no es determinable (≤ 0 o no finito). */
export function toPeriodAmountCents(contractedTotal: unknown): number | null {
  const value = Number(contractedTotal)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value * 100)
}

/** Periodo al total NUEVO del cambio + adeudo prorrateado aparte. Null si el total del cambio no es determinable. */
export function resolveCompositeIncreaseCents(
  input: PendingIncreaseFigures
): CompositeIncreaseAmounts | null {
  const periodCents = toPeriodAmountCents(input.changeTotal)
  if (periodCents === null) {
    return null
  }
  const debtCents = input.proratedAmountCents
  return { debtCents, periodCents, debtPlusPeriodCents: debtCents + periodCents }
}

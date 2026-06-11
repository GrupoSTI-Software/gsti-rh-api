/**
 * Estados de cumplimiento calculados en runtime para un periodo de lactancia,
 * tal como los define la HU de reporte de cumplimiento.
 *
 * El valor se calcula a partir de las fechas del periodo respecto a `today`
 * (zona horaria del sistema). El set es CERRADO y debe permanecer estable
 * porque el frontend lo usa como `key` en su propio bloque i18n (chips,
 * filtros multiselección, etc.) y el PDF lo usa como label en español.
 *
 * - `activa`     → today está dentro del rango [start, end] y faltan >30 días
 *                  para vencer. También cubre periodos futuros (today < start),
 *                  porque legalmente ya están vigentes en cuanto se firma el
 *                  acuerdo aunque la reducción aún no se aplique.
 * - `por_vencer` → today está dentro del rango y faltan ≤30 días para `end`.
 * - `vencida`    → today > end (o el periodo está borrado lógicamente).
 */
export const LACTATION_COMPLIANCE_STATUS = {
  ACTIVE: 'activa',
  EXPIRING: 'por_vencer',
  EXPIRED: 'vencida',
} as const

export type LactationComplianceStatusValue =
  (typeof LACTATION_COMPLIANCE_STATUS)[keyof typeof LACTATION_COMPLIANCE_STATUS]

/** Set ordenado para validadores y para iterar en filtros del frontend. */
export const LACTATION_COMPLIANCE_STATUS_VALUES = [
  LACTATION_COMPLIANCE_STATUS.ACTIVE,
  LACTATION_COMPLIANCE_STATUS.EXPIRING,
  LACTATION_COMPLIANCE_STATUS.EXPIRED,
] as const

/**
 * Umbral en días para clasificar un periodo como `por_vencer`. Si el periodo
 * activo tiene un `end` a ≤ 30 días de today, se marca como por vencer.
 * Mantenerlo como constante facilita reutilizarlo en alertas (HU hermana
 * fuera de scope) y mantener un único valor de referencia normativa.
 */
export const LACTATION_EXPIRING_THRESHOLD_DAYS = 30

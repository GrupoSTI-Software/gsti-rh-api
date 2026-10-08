import type { TeleworkComplianceValues } from '../interfaces/telework_compliance_setting_interface.js'

/**
 * Ajustes de teletrabajo por empresa (VLRH-H1791306074375).
 *
 * Valores del sistema (default virtual, R2): sin fila, cada empresa vale 12
 * meses, 30 días y montos sin valor (`null` = "la empresa no propone monto",
 * nunca `0`). Consultar nunca crea la fila; solo guardar la crea.
 */

/** Periodicidad de revalidación mínima en meses (R4). */
export const MIN_REVALIDATION_MONTHS = 1

/** Periodicidad de revalidación máxima en meses (R4). */
export const MAX_REVALIDATION_MONTHS = 12

/** Días por mes con los que se acota la ventana de aviso (R5). */
export const DAYS_PER_MONTH = 30

/** Monto máximo permitido por campo, en MXN por mes (R3). */
export const MAX_ALLOWANCE = 99999999.99

/**
 * Valores del sistema cuando la empresa no tiene ajustes guardados.
 * Es la base del default virtual: `getEffective` lo devuelve tal cual con
 * `isDefault: true` sin escribir ninguna fila.
 */
export const TELEWORK_COMPLIANCE_DEFAULTS: TeleworkComplianceValues = {
  revalidationPeriodMonths: MAX_REVALIDATION_MONTHS,
  expirationNoticeDays: DAYS_PER_MONTH,
  electricityAllowanceDefault: null,
  internetAllowanceDefault: null,
  ownEquipmentFeeDefault: null,
}

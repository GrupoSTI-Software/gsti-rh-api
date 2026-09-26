/**
 * Constantes del cumplimiento de pendientes de salida (USRH1786568279590).
 */

/**
 * Desenlace del insumo al operar o leer un pendiente (regla 10, D-2):
 * - `retired`: el retiro se ejecutó en esta operación (o el insumo ya está
 *   retirado, en lecturas).
 * - `already_retired`: el insumo ya estaba retirado por otra vía; se
 *   devuelven la fecha y el motivo originales sin modificar nada.
 * - `unavailable`: eliminado lógicamente, inexistente o fuera del alcance;
 *   el pendiente se cumple igual y no se toca el inventario.
 * - `not_applicable`: el pendiente no deriva del inventario.
 * En lecturas, un insumo vivo aún asignado viaja como `null` (sin desenlace).
 */
export const SUPPLY_OUTCOME = {
  RETIRED: 'retired',
  ALREADY_RETIRED: 'already_retired',
  UNAVAILABLE: 'unavailable',
  NOT_APPLICABLE: 'not_applicable',
} as const

export type SupplyOutcome = (typeof SUPPLY_OUTCOME)[keyof typeof SUPPLY_OUTCOME]

/**
 * Motivo estampado en `employee_supplies` al retirar desde el expediente
 * (D-1): permite rastrear de vuelta al expediente desde el módulo de
 * insumos. Cabe en los 500 caracteres del validator vigente de insumos.
 */
export function buildOffboardingSupplyRetirementReason(employeeOffboardingId: number): string {
  return `Devolución registrada en el expediente de salida #${employeeOffboardingId}`
}

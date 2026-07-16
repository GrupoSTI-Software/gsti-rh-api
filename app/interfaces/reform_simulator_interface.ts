/**
 * Tipos del simulador de reforma de jornada (proyección roster × tope legal futuro).
 *
 * La API expone camelCase. Los topes de cada año provienen de getRulesForDate;
 * estos tipos solo describen el contrato de respuesta del endpoint.
 */

import type { EffectiveRuleSource } from '#modules/working-time-rules/effective/dto/effective.dto'

/** Estado de un empleado frente al tope del año objetivo. */
export type ReformSimulationEmployeeStatus = 'affected' | 'compliant' | 'without_schedule'

/** Origen del tope aplicado al año objetivo (null si el motor no resolvió regla). */
export type ReformSimulationRulesSource = EffectiveRuleSource | null

/** Detalle por empleado activo del roster simulado. */
export interface ReformSimulationEmployee {
  employeeId: number
  fullName: string
  shiftName: string | null
  weeklyScheduledHours: number | null
  maxWeeklyHours: number | null
  excessHours: number
  status: ReformSimulationEmployeeStatus
}

/** Totales agregados del escenario del año objetivo. */
export interface ReformSimulationTotals {
  activeEmployees: number
  affected: number
  withoutSchedule: number
  totalExcessHours: number
}

/** Resumen de un escalón dentro de la comparativa multi-año. */
export interface ReformSimulationComparisonYear {
  year: number
  maxWeeklyHours: number | null
  affected: number | null
}

/** Respuesta completa de GET /reform-simulation. */
export interface ReformSimulationResult {
  targetYear: number
  queryDate: string
  maxWeeklyHours: number | null
  rulesSource: ReformSimulationRulesSource
  totals: ReformSimulationTotals
  comparison: ReformSimulationComparisonYear[]
  employees: ReformSimulationEmployee[]
}

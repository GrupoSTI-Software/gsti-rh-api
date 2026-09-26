import type { EffectiveRuleSource } from '#modules/working-time-rules/effective/dto/effective.dto'

/**
 * Medición diaria de tiempo extraordinario para nómina.
 * Contrato exportado para ESB-08-12-03-02 (reparto doble/triple por semana ISO).
 */
interface PayrollOvertimeDayMeasurement {
  employeeId: number
  date: string
  isoWeekYear: number
  isoWeek: number
  extraordinaryMinutes: number
  maxWeeklyOvertimeHours: number | null
  maxDailyOvertimeHours: number | null
  effectiveYear: number | null
  ruleSource: EffectiveRuleSource | null
  workingTimeRuleResolved: boolean
}

/**
 * Resultado agregado de medición HE por empleado y periodo del calendario.
 */
interface PayrollOvertimeEmployeeMeasurement {
  employeeId: number
  payrollBusinessUnitId: number | null
  totalExtraordinaryMinutes: number
  workingTimeRuleUnresolved: boolean
  days: PayrollOvertimeDayMeasurement[]
}

export type { PayrollOvertimeDayMeasurement, PayrollOvertimeEmployeeMeasurement }

import type { EffectiveRuleSource } from '#modules/working-time-rules/effective/dto/effective.dto'
import type { PayrollOvertimeEmployeeMeasurement } from './payroll_overtime_measurement_interface.js'

/**
 * Clave determinista de semana ISO (lunes a domingo, numerada con su año ISO).
 */
interface PayrollOvertimeIsoWeekKey {
  isoWeekYear: number
  isoWeek: number
}

/**
 * Reparto de tiempo extraordinario en minutos para una semana ISO de un empleado.
 * Contrato de persistencia para `overtime_weekly_details` (E3/E4).
 */
interface PayrollOvertimeWeekAllocation {
  employeeId: number
  businessUnitId: number | null
  payrollBusinessUnitId: number
  isoWeekYear: number
  isoWeek: number
  totalExtraordinaryMinutes: number
  doubleMinutes: number
  tripleMinutes: number
  weeklyCapHours: number
  effectiveYear: number | null
  ruleSource: EffectiveRuleSource | null
}

/**
 * Resultado agregado del reparto doble/triple por empleado en un periodo.
 */
interface PayrollOvertimeEmployeeAllocation {
  employeeId: number
  businessUnitId: number | null
  payrollBusinessUnitId: number | null
  workingTimeRuleUnresolved: boolean
  totalDoubleMinutes: number
  totalTripleMinutes: number
  weeks: PayrollOvertimeWeekAllocation[]
}

/**
 * Entrada del servicio de reparto: medición por día exportada por USRH1783692104352.
 */
type PayrollOvertimeAllocationInput = PayrollOvertimeEmployeeMeasurement

export type {
  PayrollOvertimeAllocationInput,
  PayrollOvertimeEmployeeAllocation,
  PayrollOvertimeIsoWeekKey,
  PayrollOvertimeWeekAllocation,
}

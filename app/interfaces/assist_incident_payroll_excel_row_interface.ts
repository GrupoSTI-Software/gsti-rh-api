import type { PayrollOvertimeEmployeeMeasurement } from './payroll_overtime_measurement_interface.js'
import type { PayrollOvertimeEmployeeAllocation } from './payroll_overtime_allocation_interface.js'

interface AssistIncidentPayrollExcelRowInterface {
  workBusinessUnit: string
  payrollBusinessUnit: string
  employeeName: string
  employeeId: string
  department: string
  company: string
  faults: number
  delays: number
  inc: number
  overtimeDouble: number
  overtimeTriple: number
  workingTimeRuleUnresolved: boolean
  sundayBonus: number
  laborRest: number
  vacationBonus: number
  leveling: string
  bonus: string
  others: string
  overtimeMeasurement?: PayrollOvertimeEmployeeMeasurement
  overtimeAllocation?: PayrollOvertimeEmployeeAllocation
}
export type { AssistIncidentPayrollExcelRowInterface }

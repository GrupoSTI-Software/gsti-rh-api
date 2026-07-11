import Employee from '#models/employee'
import { AssistDayInterface } from './assist_day_interface.js'

interface AssistIncidentPayrollCalendarExcelFilterInterface {
  employee: Employee
  employeeCalendar: AssistDayInterface[]
  tardies: number
  datePay: string
  toleranceCountPerAbsences: number
}
export type { AssistIncidentPayrollCalendarExcelFilterInterface }

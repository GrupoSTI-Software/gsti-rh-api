import { EmployeeVacationExcelRowSummaryYearInterface } from './employee_vacation_excel_row_summary_year_interface.js'

interface EmployeeVacationExcelRowSummaryInterface {
  employeePayrollCode: string
  employeeCode: string
  employeeName: string
  department: string
  position: string
  employeeHireDate: string
  years: EmployeeVacationExcelRowSummaryYearInterface[]
}
export type { EmployeeVacationExcelRowSummaryInterface }

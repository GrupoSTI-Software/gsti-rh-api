import type { PermissionGateOptions } from '#constants/permission_gate'

const employeesStandard = (action: string): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})

/**
 * Mapa de declaraciones de permiso de descarga del módulo Empleados
 * (USRH1785766406735). Fuente única que consumen las rutas y los jobs
 * asíncronos de asistencia; no concede nada ni enciende la exigencia.
 */
export const EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS = {
  getEmployeesExcel: employeesStandard('download-employees-list'),
  getEmployeesImportTemplate: employeesStandard('download-employees-import-template'),
  getShiftAssignmentTemplate: employeesStandard('download-shift-assignment-template'),
  getAttendanceReport: employeesStandard('download-attendance-report'),
  exportShiftExceptionsExcel: employeesStandard('download-shift-exceptions'),
  getVacationsExcel: employeesStandard('download-vacations-report'),
  getVacationsUsedExcel: employeesStandard('download-vacations-history'),
  getVacationsSummaryExcel: employeesStandard('download-vacations-summary'),
  getVacationImportTemplate: employeesStandard('download-vacation-import-template'),
  getPayrollFormat: employeesStandard('download-payroll-format'),
  getAttendanceByEmployee: employeesStandard('download-attendance-by-employee'),
  getAttendanceByPosition: employeesStandard('download-attendance-by-position'),
  getAttendanceByDepartment: employeesStandard('download-attendance-by-department'),
  getAttendanceAll: employeesStandard('download-attendance-all'),
  getPermissionsByDates: employeesStandard('download-permissions-by-dates'),
  getSuppliesExcel: employeesStandard('download-supplies-report'),
  downloadProceedingFile: employeesStandard('download-proceeding-files'),
  downloadEmployeeContract: employeesStandard('download-employee-contract'),
} as const satisfies Record<string, PermissionGateOptions>

/** Lectura de la pestaña de expediente exigida además de descargar el adjunto. */
export const EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-expediente-read')

/** Lectura de la ficha de trabajo exigida además de descargar el contrato. */
export const EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-trabajo-read')

/**
 * El job asíncrono de asistencia es la misma descarga que el Excel síncrono
 * por colaborador o el general. No es un permiso extra.
 */
export function employeesAttendanceReportJobDeclaration(
  reportType: string,
  employeeId?: number
): PermissionGateOptions {
  if (reportType === 'assistance_employee' || (employeeId !== undefined && employeeId > 0)) {
    return EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceByEmployee
  }
  return EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceAll
}

import type { PermissionGateOptions } from '#constants/permission_gate'

const employeeLactationPeriodsStandard = (action: string): PermissionGateOptions => ({
  module: 'employee-lactation-periods',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso de la Bitácora de lactancia
 * (`employee-lactation-periods`). Fuente única que consume
 * `start/routes/employee_lactation_periods_routes.ts`.
 *
 * Solo el reporte de cumplimiento y su PDF son de la pantalla de la bitácora.
 * Antes pedían permisos de Empleados (`tab-periodos-lactancia-read` en la ruta
 * y `read` en el controller) mientras el backoffice abría la pantalla con
 * `employee-lactation-periods:read`: la casilla de roles no decidía nada.
 * Periodos, conflictos y evidencias de la ficha del empleado siguen en las
 * pestañas de Empleados.
 *
 * El PDF sin enmascarar exige además `employees:export-sensitive-data` dentro
 * de `PiiExportService`; sin ese permiso se entrega enmascarado.
 */
export const EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS = {
  complianceReport: employeeLactationPeriodsStandard('read'),
  complianceReportExport: employeeLactationPeriodsStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>

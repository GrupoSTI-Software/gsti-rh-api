import type { PermissionGateOptions } from '#constants/permission_gate'

const employeesStandard = (action: string): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso de las 23 operaciones de escritura del colaborador
 * y su ficha laboral. Fuente única que consumen las rutas; no concede nada
 * ni enciende la exigencia del módulo.
 */
export const EMPLOYEES_WRITE_PERMISSION_DECLARATIONS = {
  createEmployee: employeesStandard('create'),
  updateEmployee: employeesStandard('tab-trabajo-write'),
  terminateEmployee: employeesStandard('delete'),
  reactivateEmployee: employeesStandard('tab-trabajo-write'),
  uploadEmployeePhoto: employeesStandard('tab-foto-write'),
  deleteEmployeePhoto: employeesStandard('tab-foto-delete'),
  createEmployeeContract: employeesStandard('tab-trabajo-write'),
  updateEmployeeContract: employeesStandard('tab-trabajo-write'),
  deleteEmployeeContract: employeesStandard('tab-trabajo-delete'),
  assignEmployeeBranchOffice: employeesStandard('tab-trabajo-write'),
  unassignEmployeeBranchOffice: employeesStandard('tab-trabajo-delete'),
  createTemporaryAssignment: employeesStandard('tab-trabajo-write'),
  updateTemporaryAssignment: employeesStandard('tab-trabajo-write'),
  cancelTemporaryAssignment: employeesStandard('tab-trabajo-write'),
  deleteTemporaryAssignment: employeesStandard('tab-trabajo-delete'),
  importEmployeesExcel: employeesStandard('import-employees'),
  importShiftAssignmentsExcel: employeesStandard('import-shift-assignments'),
  syncDepartments: employeesStandard('manage-biotime'),
  syncPositions: employeesStandard('manage-biotime'),
  syncEmployees: employeesStandard('manage-biotime'),
  syncShift: employeesStandard('manage-biotime'),
  syncEmployeesBySelection: employeesStandard('manage-biotime'),
  inverseSyncEmployee: employeesStandard('manage-biotime'),
} as const satisfies Record<string, PermissionGateOptions>

/** Permiso secundario cuando la edición toca el registro de baja. */
export const EMPLOYEES_TERMINATION_RECORD_PERMISSION: PermissionGateOptions = employeesStandard('delete')

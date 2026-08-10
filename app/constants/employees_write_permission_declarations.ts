import type { PermissionGateOptions } from '#constants/permission_gate'

const employeesStandard = (action: string): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})

/**
 * Mapa acumulado de declaraciones de permiso de escritura del módulo Empleados
 * (orden 7 + Persona/Domicilio/Bancos). Fuente única que consumen las rutas;
 * no concede nada ni enciende la exigencia del módulo.
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
  createAddress: employeesStandard('tab-domicilio-write'),
  updateAddress: employeesStandard('tab-domicilio-write'),
  createEmployeeAddress: employeesStandard('tab-domicilio-write'),
  updateEmployeeAddress: employeesStandard('tab-domicilio-write'),
  deleteEmployeeAddress: employeesStandard('tab-domicilio-delete'),
  createEmployeeBank: employeesStandard('tab-bancos-write'),
  updateEmployeeBank: employeesStandard('tab-bancos-write'),
  deleteEmployeeBank: employeesStandard('tab-bancos-delete'),
  createEmployeeChild: employeesStandard('tab-persona-write'),
  updateEmployeeChild: employeesStandard('tab-persona-write'),
  deleteEmployeeChild: employeesStandard('tab-persona-delete'),
  createEmployeeSpouse: employeesStandard('tab-persona-write'),
  updateEmployeeSpouse: employeesStandard('tab-persona-write'),
  deleteEmployeeSpouse: employeesStandard('tab-persona-delete'),
  createEmployeeEmergencyContact: employeesStandard('tab-persona-write'),
  updateEmployeeEmergencyContact: employeesStandard('tab-persona-write'),
  deleteEmployeeEmergencyContact: employeesStandard('tab-persona-delete'),
} as const satisfies Record<string, PermissionGateOptions>

/** Permiso secundario cuando la edición toca el registro de baja. */
export const EMPLOYEES_TERMINATION_RECORD_PERMISSION: PermissionGateOptions = employeesStandard('delete')

/** Permiso cuando se editan datos personales de una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-write')

/** Permiso cuando se borra una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-delete')

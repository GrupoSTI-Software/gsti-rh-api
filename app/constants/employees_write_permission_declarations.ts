import type { PermissionGateOptions } from '#constants/permission_gate'

const employeesStandard = (action: string): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})

/**
 * Mapa acumulado de declaraciones de permiso de escritura del módulo Empleados
 * (orden 7 + Persona/Domicilio/Bancos + Condición médica/Lactancia/Incapacidades + Expediente/Certificaciones + Turnos/Excepciones/Vacaciones).
 * Fuente única que consumen las rutas; no concede nada ni enciende la exigencia del módulo.
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
  createEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-write'),
  updateEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-write'),
  deleteEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-delete'),
  createEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-write'),
  updateEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-write'),
  deleteEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-delete'),
  regenerateLactationShiftExceptions: employeesStandard('tab-periodos-lactancia-write'),
  runLactationExpiringCheck: employeesStandard('tab-periodos-lactancia-write'),
  revokeLactationConflict: employeesStandard('tab-periodos-lactancia-write'),
  reassignLactationConflict: employeesStandard('tab-periodos-lactancia-write'),
  reassignLactationConflictsBulk: employeesStandard('tab-periodos-lactancia-write'),
  createLactationEvidence: employeesStandard('tab-periodos-lactancia-write'),
  deleteLactationEvidence: employeesStandard('tab-periodos-lactancia-delete'),
  createWorkDisability: employeesStandard('manage-work-disabilities'),
  updateWorkDisability: employeesStandard('manage-work-disabilities'),
  deleteWorkDisability: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
  createEmployeeRecord: employeesStandard('tab-expediente-write'),
  updateEmployeeRecord: employeesStandard('tab-expediente-write'),
  deleteEmployeeRecord: employeesStandard('tab-expediente-delete'),
  createEmployeeProceedingFile: employeesStandard('tab-expediente-write'),
  updateEmployeeProceedingFile: employeesStandard('tab-expediente-write'),
  deleteEmployeeProceedingFile: employeesStandard('tab-expediente-delete'),
  createCertification: employeesStandard('tab-certificaciones-write'),
  updateCertification: employeesStandard('tab-certificaciones-write'),
  deleteCertification: employeesStandard('tab-certificaciones-delete'),
  createEmployeeCertificationUpload: employeesStandard('tab-certificaciones-write'),
  deleteEmployeeCertificationUpload: employeesStandard('tab-certificaciones-delete'),
  createEmployeeShift: employeesStandard('manage-shift'),
  updateEmployeeShift: employeesStandard('manage-shift'),
  deleteEmployeeShift: employeesStandard('remove-shift-assigned-to-the-day'),
  createEmployeeShiftChange: employeesStandard('manage-shift-change'),
  deleteEmployeeShiftChange: employeesStandard('manage-shift-change'),
  createShiftException: employeesStandard('add-exception'),
  updateShiftException: employeesStandard('add-exception'),
  deleteShiftException: employeesStandard('add-exception'),
  applyExceptionMass: employeesStandard('apply-exception-mass'),
  createShiftExceptionEvidence: employeesStandard('add-exception'),
  updateShiftExceptionEvidence: employeesStandard('add-exception'),
  deleteShiftExceptionEvidence: employeesStandard('add-exception'),
  updateExceptionRequest: employeesStandard('exception-request'),
  deleteExceptionRequest: employeesStandard('exception-request'),
  updateExceptionRequestStatus: employeesStandard('add-exception'),
  createEmployeeVacationArchive: employeesStandard('manage-vacation'),
  deleteEmployeeVacationArchive: employeesStandard('manage-vacation'),
  createEmployeeVacationArchiveContent: employeesStandard('manage-vacation'),
  updateEmployeeVacationArchiveContent: employeesStandard('manage-vacation'),
  deleteEmployeeVacationArchiveContent: employeesStandard('manage-vacation'),
  applyVacationDeduction: employeesStandard('manage-vacation'),
  deleteVacationDeduction: employeesStandard('manage-vacation'),
  authorizeVacationWithSignature: employeesStandard('manage-vacation'),
  signVacationShiftExceptions: employeesStandard('manage-vacation'),
  importVacationExcel: employeesStandard('manage-vacation'),
} as const satisfies Record<string, PermissionGateOptions>

/** Permiso secundario cuando la edición toca el registro de baja. */
export const EMPLOYEES_TERMINATION_RECORD_PERMISSION: PermissionGateOptions = employeesStandard('delete')

/** Permiso cuando se editan datos personales de una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-write')

/** Permiso cuando se borra una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-delete')

/** Permiso cuando se escribe un proceeding file / valor de propiedad del área employee. */
export const EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-expediente-write')

/** Permiso cuando se elimina un proceeding file / valor de propiedad del área employee. */
export const EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-expediente-delete')

/** Permiso secundario cuando la escritura de excepción / aceptación de solicitud asienta o altera vacaciones. */
export const EMPLOYEES_MANAGE_VACATION_PERMISSION: PermissionGateOptions =
  employeesStandard('manage-vacation')

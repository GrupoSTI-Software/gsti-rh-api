import type { PermissionGateOptions } from '#constants/permission_gate'
import type { EmployeeActionSlug } from '#constants/employees_permission_catalog'
import type { LegalCategory } from '#constants/sensitive_fields'

const employeesStandard = (
  action: string | readonly string[]
): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})

const employeesSensitiveWrite = (action: EmployeeActionSlug): PermissionGateOptions =>
  employeesStandard(action)

/**
 * Mapa acumulado de declaraciones de permiso de escritura del módulo Empleados
 * (orden 7 + Persona/Domicilio/Bancos + Condición médica/Lactancia/Incapacidades + Expediente/Certificaciones + Turnos/Excepciones/Vacaciones + Biométricos/Dispositivos + Evaluaciones/Assessments/Ruta de carrera + Zonas/Anotaciones/Bonificaciones/Responsable/Activos + Gafetes del backoffice).
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
  // Gafetes del backoffice (USRH1787433076993): las cuatro vías —consultar,
  // PDF, PNG y lote— las gobierna `generate-badges`, que es la casilla que el
  // backoffice ya usaba para mostrar u ocultar el botón. Antes las tres
  // individuales colgaban de `tab-foto-read` —el permiso de ver la
  // fotografía, no el de generar el documento— y el lote no comprobaba nada.
  // El gafete propio del colaborador (`GET /me`) queda fuera a propósito: es
  // exención de diseño (`collaborator-own-badge`).
  showEmployeeBadge: employeesStandard('generate-badges'),
  getEmployeeBadgePdf: employeesStandard('generate-badges'),
  getEmployeeBadgePng: employeesStandard('generate-badges'),
  bulkEmployeeBadges: employeesStandard('generate-badges'),
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
  importVacationExcel: employeesStandard('import-vacations'),
  uploadEmployeeFaceId: employeesStandard('upload-face-id'),
  replaceEmployeeFaceId: employeesStandard('upload-face-id'),
  deleteEmployeeFaceId: employeesStandard('tab-biometricos-delete'),
  updateEmployeeFingers: employeesStandard('upload-fingers'),
  createEmployeeBiometric: employeesStandard('tab-biometricos-write'),
  updateEmployeeBiometric: employeesStandard('tab-biometricos-write'),
  updateEmployeeFaceStatus: employeesStandard('tab-biometricos-write'),
  updateEmployeeDeviceStatus: employeesStandard('tab-dispositivos-write'),
  deleteEmployeeDevice: employeesStandard('tab-dispositivos-delete'),
  createEmployeeEvaluation: employeesStandard('tab-evaluaciones-write'),
  updateEmployeeEvaluation: employeesStandard('tab-evaluaciones-write'),
  updateEmployeeEvaluationPotential: employeesStandard('tab-evaluaciones-write'),
  deleteEmployeeEvaluation: employeesStandard('tab-evaluaciones-delete'),
  createEmployeeCompetencyEvaluation: employeesStandard('tab-evaluaciones-write'),
  updateEmployeeCompetencyEvaluation: employeesStandard('tab-evaluaciones-write'),
  deleteEmployeeCompetencyEvaluation: employeesStandard('tab-evaluaciones-delete'),
  createEmployeeKpiEvaluation: employeesStandard('tab-evaluaciones-write'),
  updateEmployeeKpiEvaluation: employeesStandard('tab-evaluaciones-write'),
  deleteEmployeeKpiEvaluation: employeesStandard('tab-evaluaciones-delete'),
  createEmployeeAssessment: employeesStandard('tab-assessments-write'),
  updateEmployeeAssessment: employeesStandard('tab-assessments-write'),
  deleteEmployeeAssessment: employeesStandard('tab-assessments-delete'),
  createCareerPathCandidate: employeesStandard('tab-ruta-carrera-write'),
  updateCareerPathCandidateStatus: employeesStandard('tab-ruta-carrera-write'),
  deleteCareerPathCandidate: employeesStandard('tab-ruta-carrera-delete'),
  createEmployeeZone: employeesStandard('tab-zonas-write'),
  updateEmployeeZone: employeesStandard('tab-zonas-write'),
  deleteEmployeeZone: employeesStandard('tab-zonas-delete'),
  createEmployeeAnnotation: employeesStandard('tab-anotaciones-write'),
  updateEmployeeAnnotation: employeesStandard('tab-anotaciones-write'),
  deleteEmployeeAnnotation: employeesStandard('tab-anotaciones-delete'),
  createEmployeeBonus: employeesStandard('tab-trabajo-write'),
  updateEmployeeBonus: employeesStandard('tab-trabajo-write'),
  deleteEmployeeBonus: employeesStandard('tab-trabajo-delete'),
  createUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  updateUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  deleteUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  createEmployeeSupply: employeesStandard('manage-employee-supplies'),
  updateEmployeeSupply: employeesStandard('manage-employee-supplies'),
  retireEmployeeSupply: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupply: employeesStandard('manage-employee-supplies'),
  createEmployeeSupplyResponseContract: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupplyResponseContract: employeesStandard('manage-employee-supplies'),
  uploadEmployeeSupplyAssignationPhoto: employeesStandard('manage-employee-supplies'),
  uploadEmployeeSupplyReturnPhoto: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupplyAssignationPhoto: employeesStandard('manage-employee-supplies'),
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

/**
 * Permisos de escritura por categoría legal (USRH1787204602831).
 * Consumidos por `resolveSensitiveWriteDecisions`; no se montan en rutas.
 * Un slug inventado no compila: `employeesSensitiveWrite` exige `EmployeeActionSlug`.
 */
export const EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS: Record<LegalCategory, PermissionGateOptions> = {
  identificacion: employeesSensitiveWrite('sensitive-identificacion-write'),
  contacto: employeesSensitiveWrite('sensitive-contacto-write'),
  financiero: employeesSensitiveWrite('sensitive-financiero-write'),
  salud: employeesSensitiveWrite('sensitive-salud-write'),
  biometrico: employeesSensitiveWrite('sensitive-biometrico-write'),
}

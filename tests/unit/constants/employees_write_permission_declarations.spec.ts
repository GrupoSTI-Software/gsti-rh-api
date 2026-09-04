import { test } from '@japa/runner'
import {
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
  EMPLOYEES_MANAGE_VACATION_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  // 156 tras integrar multitenant en la rama de gafetes: a las 147 del ancestro
  // comun se suman las 4 que aporta esta rama (showEmployeeBadge,
  // getEmployeeBadgePng, getEmployeeBadgePdf, bulkEmployeeBadges) y las 5 que
  // traia multitenant (assignEmployeeAccessPoint, removeEmployeeAccessPoint y
  // las tres de propiedades del tipo de expediente).
  test('declara exactamente 156 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 156)

    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))

    for (const key of keys) {
      const decl =
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS[
          key as keyof typeof EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
        ]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      const actions = Array.isArray(decl.action) ? decl.action : [decl.action]
      for (const slug of actions) {
        assert.isTrue(catalogSlugs.has(slug), `slug ausente en catálogo: ${slug} (${key})`)
      }
    }
  })

  test('mapea Persona, Domicilio y Bancos de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createAddress.action, 'tab-domicilio-write')
    assert.equal(d.updateAddress.action, 'tab-domicilio-write')
    assert.equal(d.createEmployeeAddress.action, 'tab-domicilio-write')
    assert.equal(d.updateEmployeeAddress.action, 'tab-domicilio-write')
    assert.equal(d.deleteEmployeeAddress.action, 'tab-domicilio-delete')
    assert.equal(d.createEmployeeBank.action, 'tab-bancos-write')
    assert.equal(d.updateEmployeeBank.action, 'tab-bancos-write')
    assert.equal(d.deleteEmployeeBank.action, 'tab-bancos-delete')
    assert.equal(d.createEmployeeChild.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeChild.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeChild.action, 'tab-persona-delete')
    assert.equal(d.createEmployeeSpouse.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeSpouse.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeSpouse.action, 'tab-persona-delete')
    assert.equal(d.createEmployeeEmergencyContact.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeEmergencyContact.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeEmergencyContact.action, 'tab-persona-delete')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION.action, 'tab-persona-write')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION.action, 'tab-persona-delete')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION.bypass, 'standard')
  })

  test('mapea Condición médica, Lactancia e Incapacidades de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeMedicalCondition.action, 'tab-condicion-medica-write')
    assert.equal(d.updateEmployeeMedicalCondition.action, 'tab-condicion-medica-write')
    assert.equal(d.deleteEmployeeMedicalCondition.action, 'tab-condicion-medica-delete')

    assert.equal(d.createEmployeeLactationPeriod.action, 'tab-periodos-lactancia-write')
    assert.equal(d.updateEmployeeLactationPeriod.action, 'tab-periodos-lactancia-write')
    assert.equal(d.deleteEmployeeLactationPeriod.action, 'tab-periodos-lactancia-delete')
    assert.equal(d.regenerateLactationShiftExceptions.action, 'tab-periodos-lactancia-write')
    assert.equal(d.runLactationExpiringCheck.action, 'tab-periodos-lactancia-write')
    assert.equal(d.revokeLactationConflict.action, 'tab-periodos-lactancia-write')
    assert.equal(d.reassignLactationConflict.action, 'tab-periodos-lactancia-write')
    assert.equal(d.reassignLactationConflictsBulk.action, 'tab-periodos-lactancia-write')
    assert.equal(d.createLactationEvidence.action, 'tab-periodos-lactancia-write')
    assert.equal(d.deleteLactationEvidence.action, 'tab-periodos-lactancia-delete')

    assert.equal(d.createWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
  })

  test('mapea Expediente documental y Certificaciones de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeRecord.action, 'tab-expediente-write')
    assert.equal(d.updateEmployeeRecord.action, 'tab-expediente-write')
    assert.equal(d.deleteEmployeeRecord.action, 'tab-expediente-delete')
    assert.equal(d.createEmployeeProceedingFile.action, 'tab-expediente-write')
    assert.equal(d.updateEmployeeProceedingFile.action, 'tab-expediente-write')
    assert.equal(d.deleteEmployeeProceedingFile.action, 'tab-expediente-delete')
    // USRH1786648597850: catálogo compartido de categorías de propiedades de expediente
    assert.equal(d.storeProceedingFileTypeProperty.action, 'tab-expediente-write')
    assert.equal(d.storeMultipleProceedingFileTypeProperties.action, 'tab-expediente-write')
    assert.equal(d.deleteProceedingFileTypeProperty.action, 'tab-expediente-delete')
    assert.equal(d.createCertification.action, 'tab-certificaciones-write')
    assert.equal(d.updateCertification.action, 'tab-certificaciones-write')
    assert.equal(d.deleteCertification.action, 'tab-certificaciones-delete')
    assert.equal(d.createEmployeeCertificationUpload.action, 'tab-certificaciones-write')
    assert.equal(d.deleteEmployeeCertificationUpload.action, 'tab-certificaciones-delete')

    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.action, 'tab-expediente-write')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.action, 'tab-expediente-delete')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.module, 'employees')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.module, 'employees')
  })

  test('mapea Turnos, Excepciones y Vacaciones de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeShift.action, 'manage-shift')
    assert.equal(d.updateEmployeeShift.action, 'manage-shift')
    assert.equal(d.deleteEmployeeShift.action, 'remove-shift-assigned-to-the-day')
    assert.equal(d.createEmployeeShiftChange.action, 'manage-shift-change')
    assert.equal(d.deleteEmployeeShiftChange.action, 'manage-shift-change')
    assert.equal(d.createShiftException.action, 'add-exception')
    assert.equal(d.updateShiftException.action, 'add-exception')
    assert.equal(d.deleteShiftException.action, 'add-exception')
    assert.equal(d.applyExceptionMass.action, 'apply-exception-mass')
    assert.equal(d.createShiftExceptionEvidence.action, 'add-exception')
    assert.equal(d.updateShiftExceptionEvidence.action, 'add-exception')
    assert.equal(d.deleteShiftExceptionEvidence.action, 'add-exception')
    assert.equal(d.updateExceptionRequest.action, 'exception-request')
    assert.equal(d.deleteExceptionRequest.action, 'exception-request')
    assert.equal(d.updateExceptionRequestStatus.action, 'add-exception')
    assert.equal(d.createEmployeeVacationArchive.action, 'manage-vacation')
    assert.equal(d.deleteEmployeeVacationArchive.action, 'manage-vacation')
    assert.equal(d.createEmployeeVacationArchiveContent.action, 'manage-vacation')
    assert.equal(d.updateEmployeeVacationArchiveContent.action, 'manage-vacation')
    assert.equal(d.deleteEmployeeVacationArchiveContent.action, 'manage-vacation')
    assert.equal(d.applyVacationDeduction.action, 'manage-vacation')
    assert.equal(d.deleteVacationDeduction.action, 'manage-vacation')
    assert.equal(d.authorizeVacationWithSignature.action, 'manage-vacation')
    assert.equal(d.signVacationShiftExceptions.action, 'manage-vacation')
    assert.equal(d.importVacationExcel.action, 'import-vacations')

    assert.equal(EMPLOYEES_MANAGE_VACATION_PERMISSION.action, 'manage-vacation')
    assert.equal(EMPLOYEES_MANAGE_VACATION_PERMISSION.module, 'employees')
    assert.equal(EMPLOYEES_MANAGE_VACATION_PERMISSION.bypass, 'standard')
  })

  test('mapea Biométricos y Dispositivos de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.uploadEmployeeFaceId.action, 'upload-face-id')
    assert.equal(d.replaceEmployeeFaceId.action, 'upload-face-id')
    assert.equal(d.deleteEmployeeFaceId.action, 'tab-biometricos-delete')
    assert.equal(d.updateEmployeeFingers.action, 'upload-fingers')
    assert.equal(d.createEmployeeBiometric.action, 'tab-biometricos-write')
    assert.equal(d.updateEmployeeBiometric.action, 'tab-biometricos-write')
    assert.equal(d.updateEmployeeFaceStatus.action, 'tab-biometricos-write')
    assert.equal(d.updateEmployeeDeviceStatus.action, 'tab-dispositivos-write')
    assert.equal(d.deleteEmployeeDevice.action, 'tab-dispositivos-delete')
  })

  test('mapea Evaluaciones, Assessments y Ruta de carrera de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.updateEmployeeEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.updateEmployeeEvaluationPotential.action, 'tab-evaluaciones-write')
    assert.equal(d.deleteEmployeeEvaluation.action, 'tab-evaluaciones-delete')
    assert.equal(d.createEmployeeCompetencyEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.updateEmployeeCompetencyEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.deleteEmployeeCompetencyEvaluation.action, 'tab-evaluaciones-delete')
    assert.equal(d.createEmployeeKpiEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.updateEmployeeKpiEvaluation.action, 'tab-evaluaciones-write')
    assert.equal(d.deleteEmployeeKpiEvaluation.action, 'tab-evaluaciones-delete')
    assert.equal(d.createEmployeeAssessment.action, 'tab-assessments-write')
    assert.equal(d.updateEmployeeAssessment.action, 'tab-assessments-write')
    assert.equal(d.deleteEmployeeAssessment.action, 'tab-assessments-delete')
    assert.equal(d.createCareerPathCandidate.action, 'tab-ruta-carrera-write')
    assert.equal(d.updateCareerPathCandidateStatus.action, 'tab-ruta-carrera-write')
    assert.equal(d.deleteCareerPathCandidate.action, 'tab-ruta-carrera-delete')
  })

  test('mapea Zonas, Anotaciones, Bonificaciones, Responsable/Asignados y Activos de escritura', ({
    assert,
  }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeZone.action, 'tab-zonas-write')
    assert.equal(d.updateEmployeeZone.action, 'tab-zonas-write')
    assert.equal(d.deleteEmployeeZone.action, 'tab-zonas-delete')

    assert.equal(d.createEmployeeAnnotation.action, 'tab-anotaciones-write')
    assert.equal(d.updateEmployeeAnnotation.action, 'tab-anotaciones-write')
    assert.equal(d.deleteEmployeeAnnotation.action, 'tab-anotaciones-delete')

    assert.equal(d.createEmployeeBonus.action, 'tab-trabajo-write')
    assert.equal(d.updateEmployeeBonus.action, 'tab-trabajo-write')
    assert.equal(d.deleteEmployeeBonus.action, 'tab-trabajo-delete')

    assert.deepEqual(d.createUserResponsibleEmployee.action, [
      'manage-responsible-edit',
      'manage-assigned-edit',
    ])
    assert.deepEqual(d.updateUserResponsibleEmployee.action, [
      'manage-responsible-edit',
      'manage-assigned-edit',
    ])
    assert.deepEqual(d.deleteUserResponsibleEmployee.action, [
      'manage-responsible-edit',
      'manage-assigned-edit',
    ])

    assert.equal(d.createEmployeeSupply.action, 'manage-employee-supplies')
    assert.equal(d.updateEmployeeSupply.action, 'manage-employee-supplies')
    assert.equal(d.retireEmployeeSupply.action, 'manage-employee-supplies')
    assert.equal(d.deleteEmployeeSupply.action, 'manage-employee-supplies')
    assert.equal(d.createEmployeeSupplyResponseContract.action, 'manage-employee-supplies')
    assert.equal(d.deleteEmployeeSupplyResponseContract.action, 'manage-employee-supplies')
    assert.equal(d.uploadEmployeeSupplyAssignationPhoto.action, 'manage-employee-supplies')
    assert.equal(d.uploadEmployeeSupplyReturnPhoto.action, 'manage-employee-supplies')
    assert.equal(d.deleteEmployeeSupplyAssignationPhoto.action, 'manage-employee-supplies')
  })
})

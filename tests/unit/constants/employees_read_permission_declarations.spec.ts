import { test } from '@japa/runner'
import {
  EMPLOYEES_READ_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION,
} from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_READ_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 111 operaciones con module employees y bypass standard', ({
    assert,
  }) => {
    const keys = Object.keys(EMPLOYEES_READ_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 111)

    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))
    for (const key of keys) {
      const decl =
        EMPLOYEES_READ_PERMISSION_DECLARATIONS[
          key as keyof typeof EMPLOYEES_READ_PERMISSION_DECLARATIONS
        ]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      const actions = Array.isArray(decl.action) ? decl.action : [decl.action]
      for (const slug of actions) {
        assert.isTrue(catalogSlugs.has(slug), `slug ausente en catálogo: ${slug} (${key})`)
      }
    }
  })

  test('la ficha compuesta y el calendario cuelgan de tab-trabajo-read', ({ assert }) => {
    const d = EMPLOYEES_READ_PERMISSION_DECLARATIONS
    assert.equal(d.showEmployee.action, 'tab-trabajo-read')
    assert.equal(d.getEmployeeById.action, 'tab-trabajo-read')
    assert.equal(d.getSalaryHistory.action, 'tab-trabajo-read')
    assert.equal(d.showEmployeeContract.action, 'tab-trabajo-read')
    assert.equal(d.getShiftsByEmployee.action, 'tab-trabajo-read')
    assert.equal(d.getVacationsUsed.action, 'tab-trabajo-read')
    assert.equal(d.showEmployeeBonus.action, 'tab-trabajo-read')
    assert.equal(d.indexAssistCalendars.action, 'tab-trabajo-read')
  })

  test('las anidadas heredan el permiso de su pestaña', ({ assert }) => {
    const d = EMPLOYEES_READ_PERMISSION_DECLARATIONS
    assert.equal(d.showEmployeeChild.action, 'tab-persona-read')
    assert.equal(d.getEmergencyContactsByEmployee.action, 'tab-persona-read')
    assert.equal(d.showMedicalConditionPropertyValue.action, 'tab-condicion-medica-read')
    assert.equal(d.indexLactationEvidences.action, 'tab-periodos-lactancia-read')
    assert.equal(d.indexCertificationUploads.action, 'tab-certificaciones-read')
  })

  test('homologa legacy a pestaña y conserva incapacidades', ({ assert }) => {
    const d = EMPLOYEES_READ_PERMISSION_DECLARATIONS
    assert.equal(d.getUserResponsible.action, 'tab-responsable-read')
    assert.equal(d.getEmployeesAssigned.action, 'tab-asignados-read')
    assert.deepEqual(d.showUserResponsibleEmployee.action, [
      'tab-responsable-read',
      'tab-asignados-read',
    ])
    assert.equal(d.getEmployeeProceedingFiles.action, 'tab-expediente-read')
    assert.equal(d.getEmployeeFingers.action, 'tab-biometricos-read')
    assert.equal(d.getBiometricFaceId.action, 'tab-biometricos-read')
    assert.equal(d.getWorkDisabilitiesByEmployee.action, 'read-work-disabilities')
    assert.equal(d.showWorkDisability.action, 'read-work-disabilities')
  })

  test('constantes de superficie compartida usan pestaña y bypass standard', ({ assert }) => {
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION.action, 'tab-persona-read')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION.action, 'tab-expediente-read')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION.module, 'employees')
  })
})


import { test } from '@japa/runner'
import {
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 65 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 65)

    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))

    for (const key of keys) {
      const decl =
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS[
          key as keyof typeof EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
        ]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      assert.isTrue(catalogSlugs.has(decl.action), `slug ausente en catálogo: ${decl.action} (${key})`)
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
})

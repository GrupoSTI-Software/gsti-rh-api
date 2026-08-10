import { test } from '@japa/runner'
import {
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 40 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 40)

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
})

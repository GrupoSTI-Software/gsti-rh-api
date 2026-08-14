import { test } from '@japa/runner'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 23 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 23)

    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))

    for (const key of keys) {
      const decl = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS[key as keyof typeof EMPLOYEES_WRITE_PERMISSION_DECLARATIONS]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      assert.isTrue(catalogSlugs.has(decl.action), `slug ausente en catálogo: ${decl.action} (${key})`)
    }
  })

  test('mapea las acciones críticas del dominio', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployee.action, 'create')
    assert.equal(d.updateEmployee.action, 'tab-trabajo-write')
    assert.equal(d.terminateEmployee.action, 'delete')
    assert.equal(d.reactivateEmployee.action, 'tab-trabajo-write')
    assert.equal(d.uploadEmployeePhoto.action, 'tab-foto-write')
    assert.equal(d.deleteEmployeePhoto.action, 'tab-foto-delete')
    assert.equal(d.deleteEmployeeContract.action, 'tab-trabajo-delete')
    assert.equal(d.unassignEmployeeBranchOffice.action, 'tab-trabajo-delete')
    assert.equal(d.deleteTemporaryAssignment.action, 'tab-trabajo-delete')
    assert.equal(d.importEmployeesExcel.action, 'import-employees')
    assert.equal(d.importShiftAssignmentsExcel.action, 'import-shift-assignments')
    assert.equal(d.syncDepartments.action, 'manage-biotime')
    assert.equal(d.syncShift.action, 'manage-biotime')
    assert.equal(d.inverseSyncEmployee.action, 'manage-biotime')
  })
})

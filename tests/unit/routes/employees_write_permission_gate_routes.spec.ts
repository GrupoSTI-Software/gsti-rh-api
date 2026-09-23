import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_routes — declaraciones PermissionGate (escrituras)', () => {
  test('alta, baja, reactivación y foto declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployee)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployee)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.terminateEmployee)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reactivateEmployee)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeePhoto)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeePhoto)')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeBranchOffice)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createTemporaryAssignment)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateTemporaryAssignment)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.cancelTemporaryAssignment)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteTemporaryAssignment)'
    )
  })

  /**
   * Un empleado no puede quedarse sin sucursal: la ruta que lo permitía se
   * retiró junto con su declaración de permiso. Si alguien la repone, este
   * test lo detiene antes de que la invariante vuelva a tener una puerta
   * trasera.
   */
  test('la ruta de desasignar sucursal ya no existe', async ({ assert }) => {
    const routes = await readFile(join(process.cwd(), 'start/routes/employee_routes.ts'), 'utf8')
    assert.notInclude(routes, 'employee_branch_office_controller.unassign')

    const declarations = await readFile(
      join(process.cwd(), 'app/constants/employees_write_permission_declarations.ts'),
      'utf8'
    )
    assert.notInclude(declarations, 'unassignEmployeeBranchOffice')
  })

  test('cargas Excel e inversa de sincronización declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importEmployeesExcel)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importShiftAssignmentsExcel)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.inverseSyncEmployee)'
    )
  })

  test('contratos declaran permissionGate en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_contract_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeContract)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeContract)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeContract)'
    )
  })
})

test.group('synchronization_routes — declaraciones PermissionGate (escrituras)', () => {
  test('POST de sincronización biométrica declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/synchronization_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncDepartments)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncPositions)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncEmployees)'
    )
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncShift)')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncEmployeesBySelection)'
    )
  })

  test('documenta deuda técnica en ruta /shift', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/synchronization_routes.ts'),
      'utf8'
    )
    assert.match(content, /shifts_controller\.synchronization/i)
    assert.match(content, /no (est[aá]|implementa)/i)
  })
})

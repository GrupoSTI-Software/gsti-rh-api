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
  })
})

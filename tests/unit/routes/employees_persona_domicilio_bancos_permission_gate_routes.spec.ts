import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('address_routes — PermissionGate Domicilio', () => {
  test('alta y edición de contenido declaran permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/address_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateAddress)')
  })
})

test.group('employee_address_routes — PermissionGate Domicilio', () => {
  test('vínculo domicilio–colaborador declara permissionGate en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_address_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAddress)'
    )
  })
})

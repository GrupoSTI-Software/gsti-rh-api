import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_zone_routes — PermissionGate Zonas', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_zone_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeZone)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeZone)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeZone)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notMatch(
      compact(content),
      /get\('\/:employeeZoneId'[\s\S]*?\)\.use\(middleware\.permissionGate/
    )
  })

  test('el catálogo de zonas de la empresa no declara permissionGate de Empleados', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/zone_routes.ts'), 'utf8')
    assert.notInclude(content, 'permissionGate')
    assert.notInclude(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
  })
})

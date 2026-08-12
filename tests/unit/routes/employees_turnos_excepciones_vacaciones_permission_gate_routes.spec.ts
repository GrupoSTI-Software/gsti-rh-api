import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_shifts_routes — PermissionGate Turnos', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_shifts_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeShift)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeShift)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeShift)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_shift_change_routes — PermissionGate', () => {
  test('alta y baja declaran permissionGate; GETs no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_shift_change_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeShiftChange)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeShiftChange)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 2)
  })
})

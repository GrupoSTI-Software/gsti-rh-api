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

test.group('shift_exceptions_routes — PermissionGate', () => {
  test('escrituras y masiva declaran permissionGate; GETs no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/shift_exceptions_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.applyExceptionMass)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createShiftException)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateShiftException)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteShiftException)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 4)
  })
})

test.group('shift_exception_evidence_routes — PermissionGate', () => {
  test('escrituras declaran add-exception; lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/shift_exception_evidence_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createShiftExceptionEvidence)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateShiftExceptionEvidence)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteShiftExceptionEvidence)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('exception_request_routes — PermissionGate + D-08', () => {
  test('editar, borrar y status declaran gate; alta y GETs no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/exception_request_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequest)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteExceptionRequest)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequestStatus)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    // D-08: el store no lleva permissionGate en la misma declaración de ruta.
    assert.notMatch(
      compact(content),
      /post\('\/',\s*'#controllers\/exception_requests_controller\.store'\)\.use\(middleware\.permissionGate/
    )
  })
})

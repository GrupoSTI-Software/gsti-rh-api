import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_biometric_face_id_routes — PermissionGate Biométricos', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_biometric_face_id_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeFaceId)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.replaceEmployeeFaceId)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeFaceId)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notMatch(
      compact(content),
      /get\('\/:employeeId\/biometric-face-id',\s*'#controllers\/employee_biometric_face_id_controller\.getPhoto'\)\.use\(middleware\.permissionGate/
    )
  })
})

test.group('employee_biometric_routes — PermissionGate Biométricos', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_biometric_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBiometric)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFingers)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFaceStatus)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 4)
  })
})

test.group('employee_device_routes — PermissionGate Dispositivos', () => {
  test('status y delete declaran permissionGate; GETs no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_device_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeDeviceStatus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeDevice)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 2)
  })
})

test.group('Biométricos/Dispositivos — caminos exentos sin permissionGate (D-08 / deuda)', () => {
  test('face_routes.ts (verify-face) no declara permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/face_routes.ts'), 'utf8')
    assert.include(content, "prefix('/api/verify-face')")
    assert.notInclude(content, 'permissionGate')
  })

  test('login_routes no declara permissionGate sobre auth/login', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/login_routes.ts'), 'utf8')
    assert.notInclude(content, 'permissionGate')
  })

  test('socket.ts conserva enrolamiento sin permissionGate (deuda Wilvardo)', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/socket.ts'), 'utf8')
    assert.include(content, "socket.on('start-biometric-enrollment'")
    assert.include(content, "socket.on('biometric-enrollment-status'")
    assert.notInclude(content, 'permissionGate')
  })
})

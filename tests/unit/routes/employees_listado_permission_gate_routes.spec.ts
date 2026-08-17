import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_routes — PermissionGate listado y bajas', () => {
  test('listado, variantes, calendarios y catálogos internos declaran read', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_routes.ts'), 'utf8')
    for (const key of [
      'indexEmployees',
      'indexEmployeesToAssigned',
      'indexEmployeesWithoutUser',
      'getBirthday',
      'getAnniversary',
      'getWorkSchedules',
      'getTerminationCatalog',
    ]) {
      assert.include(content, `permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.${key})`, key)
    }
    assert.notInclude(content, 'read-terminated-employees')
  })

  test('el catálogo de tipos de colaborador declara read', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_type_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeTypes)'
    )
  })

  test('catálogos de otros módulos y descargas ajenas no declaran READ del listado', async ({
    assert,
  }) => {
    const files = [
      'start/routes/department_routes.ts',
      'start/routes/position_routes.ts',
      'start/routes/branch_offices.ts',
      'start/routes/business_unit_routes.ts',
    ]
    for (const file of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      assert.notInclude(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS', file)
    }
    const employeeRoutes = await readFile(
      join(process.cwd(), 'start/routes/employee_routes.ts'),
      'utf8'
    )
    const attendanceIdx = employeeRoutes
      .split('\n')
      .findIndex((line) => line.includes('employee_controller.getAttendanceReport'))
    assert.isAtLeast(attendanceIdx, 0)
    const attendanceBlock = employeeRoutes
      .split('\n')
      .slice(attendanceIdx, attendanceIdx + 2)
      .join('\n')
    assert.include(attendanceBlock, 'DOWNLOAD_PERMISSION')
    assert.notInclude(attendanceBlock, 'READ_PERMISSION')
  })
})

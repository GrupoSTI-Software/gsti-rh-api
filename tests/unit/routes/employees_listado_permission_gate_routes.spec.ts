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
      'getEmployeesExcel',
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
    const attendance = employeeRoutes
      .split('\n')
      .find((line) => line.includes('employee_controller.getAttendanceReport'))
    assert.exists(attendance)
    assert.notInclude(attendance!, 'READ_PERMISSION')
  })
})

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

test.group('employee_annotation_routes — PermissionGate Anotaciones', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_annotation_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAnnotation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAnnotation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAnnotation)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(compact(content), "get('/').use(middleware.permissionGate")
    assert.notInclude(
      compact(content),
      "get('/employee/:employeeId').use(middleware.permissionGate"
    )
    assert.notInclude(
      compact(content),
      "get('/:employeeAnnotationId').use(middleware.permissionGate"
    )
  })

  test('el controlador de update conserva el mensaje de autoría vigente', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/employee_annotation_controller.ts'),
      'utf8'
    )
    assert.include(content, 'Only the original creator can update this annotation')
    assert.include(content, 'currentEmployeeAnnotation.userId !== user.userId')
  })
})

test.group('employee_bonus_routes — PermissionGate Bonificaciones', () => {
  test('escrituras declaran permissionGate de Trabajo y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_bonus_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBonus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBonus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBonus)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(compact(content), "get('/').use(middleware.permissionGate")
    assert.notInclude(
      compact(content),
      "get('/concepts/:employeeId').use(middleware.permissionGate"
    )
    assert.notInclude(compact(content), "get('/:employeeBonusId').use(middleware.permissionGate")
  })
})

test.group('user_responsible_employee_routes — PermissionGate Responsable/Asignados', () => {
  test('escrituras declaran un solo permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/user_responsible_employee_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateUserResponsibleEmployee)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteUserResponsibleEmployee)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(
      compact(content),
      "get('/:userResponsibleEmployeeId').use(middleware.permissionGate"
    )
  })
})

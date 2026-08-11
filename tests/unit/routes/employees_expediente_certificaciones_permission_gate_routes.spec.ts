import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_record_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_record_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeRecord)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeRecord)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeRecord)')
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_proceeding_file_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate; index/show/download no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_proceeding_file_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFile)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeProceedingFile)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeProceedingFile)'
    )
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
    assert.notMatch(content, /download[\s\S]{0,120}permissionGate/)
  })
})

test.group('certifications_routes — PermissionGate', () => {
  test('escrituras del catálogo declaran permissionGate; lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/certifications_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCertification)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCertification)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCertification)')
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_certification_upload_routes — PermissionGate', () => {
  test('carga y baja declaran permissionGate; historial y download-url no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_certification_upload_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCertificationUpload)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCertificationUpload)'
    )
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 2)
    assert.notMatch(content, /download-url[\s\S]{0,160}permissionGate/)
  })
})

test.group('Deuda — catálogo de tipos y requisitos por puesto sin gate Empleados', () => {
  test('rutas del catálogo de tipos de documento no declaran permissionGate', async ({ assert }) => {
    for (const rel of [
      'start/routes/proceeding_file_type_routes.ts',
      'start/routes/proceeding_file_type_property_routes.ts',
      'start/routes/proceeding_file_type_email_routes.ts',
      'start/routes/position_certification_requirement_routes.ts',
    ]) {
      const content = await readFile(join(process.cwd(), rel), 'utf8')
      assert.notInclude(content, 'permissionGate')
      assert.notInclude(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    }
  })
})

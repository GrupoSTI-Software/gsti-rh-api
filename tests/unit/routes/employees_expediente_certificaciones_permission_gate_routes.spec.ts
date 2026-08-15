import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_record_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_record_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeRecord)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeRecord)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeRecord)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_proceeding_file_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate; download declara DOWNLOAD', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_proceeding_file_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFile)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeProceedingFile)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeProceedingFile)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.match(
      compact(content),
      /\/:employeeProceedingFileId\/download[\s\S]{0,220}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.downloadProceedingFile\)/
    )
  })
})

test.group('certifications_routes — PermissionGate', () => {
  test('escrituras del catálogo declaran permissionGate; lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/certifications_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCertification)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCertification)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCertification)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
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
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCertificationUpload)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCertificationUpload)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 2)
    assert.notMatch(content, /download-url[\s\S]{0,160}permissionGate/)
  })
})

test.group('proceeding_file_routes — sin permissionGate de ruta (superficie compartida)', () => {
  test('la ruta compartida /api/proceeding-files no monta permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/proceeding_file_routes.ts'),
      'utf8'
    )
    assert.notInclude(content, 'permissionGate')
  })
})

test.group('proceeding_file_type_property_value_routes — sin permissionGate de ruta', () => {
  test('la ruta compartida no monta permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/proceeding_file_type_property_value_routes.ts'),
      'utf8'
    )
    assert.notInclude(content, 'permissionGate')
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

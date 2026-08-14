import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const compact = (content: string) => content.replace(/\s+/g, '')

test.group('employee_routes — PermissionGate descargas', () => {
  test('generate-excel, plantillas, attendance-report y excepciones declaran su descarga', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_routes.ts'), 'utf8')
    const packed = compact(content)
    assert.include(
      packed,
      "get('/employee-generate-excel','#controllers/employee_controller.getExcel').use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getEmployeesExcel))"
    )
    assert.notInclude(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeesExcel')
    assert.include(
      packed,
      "get('/shift-assignment-template','#controllers/employee_controller.getShiftAssignmentTemplate')"
    )
    assert.match(
      packed,
      /shift-assignment-template[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getShiftAssignmentTemplate\)/
    )
    assert.match(
      packed,
      /template-excel[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getEmployeesImportTemplate\)/
    )
    assert.include(
      packed,
      "get('/attendance-report','#controllers/employee_controller.getAttendanceReport').use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceReport))"
    )
    assert.include(
      packed,
      "post('/attendance-report','#controllers/employee_controller.getAttendanceReport').use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceReport))"
    )
    assert.match(
      packed,
      /export-excel[\s\S]{0,200}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.exportShiftExceptionsExcel\)/
    )
    assert.include(
      packed,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importEmployeesExcel)'
    )
    assert.include(
      packed,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importShiftAssignmentsExcel)'
    )
  })
})

test.group('employee_vacation_routes — PermissionGate descargas e importación', () => {
  test('los tres Excel, la plantilla y la importación declaran su permiso propio', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_vacation_routes.ts'),
      'utf8'
    )
    const packed = compact(content)
    assert.match(
      packed,
      /get-excel[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getVacationsExcel\)/
    )
    assert.match(
      packed,
      /get-vacations-used-excel[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getVacationsUsedExcel\)/
    )
    assert.match(
      packed,
      /get-vacations-summary-excel[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getVacationsSummaryExcel\)/
    )
    assert.match(
      packed,
      /get-vacation-import-template[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getVacationImportTemplate\)/
    )
    assert.include(
      packed,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importVacationExcel)'
    )
  })
})

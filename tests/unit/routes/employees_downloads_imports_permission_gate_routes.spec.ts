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

test.group('assist_routes — PermissionGate descargas de asistencia', () => {
  test('los seis Excel/CSV síncronos declaran su descarga; synchronize no', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/assist_routes.ts'), 'utf8')
    const packed = compact(content)
    const pairs: Array<[string, string]> = [
      ['get-format-payroll', 'getPayrollFormat'],
      ['get-excel-by-employee', 'getAttendanceByEmployee'],
      ['get-excel-by-position', 'getAttendanceByPosition'],
      ['get-excel-by-department', 'getAttendanceByDepartment'],
      ['get-excel-all', 'getAttendanceAll'],
      ['get-excel-permissions-dates', 'getPermissionsByDates'],
    ]
    for (const [path, key] of pairs) {
      assert.match(
        packed,
        new RegExp(
          `${path}[\\s\\S]{0,220}permissionGate\\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\\.${key}\\)`
        ),
        path
      )
    }
    assert.notMatch(packed, /synchronize[\s\S]{0,120}DOWNLOAD_PERMISSION/)
    assert.notMatch(packed, /reports[\s\S]{0,160}permissionGate\(EMPLOYEES_DOWNLOAD/)
  })
})

test.group('supplies — PermissionGate reporte', () => {
  test('solo excel declara descarga; index/store no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/supplies.ts'), 'utf8')
    const packed = compact(content)
    assert.match(
      packed,
      /supplies\/excel[\s\S]{0,180}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.getSuppliesExcel\)/
    )
    assert.notMatch(packed, /router\.get\('\/supplies'[\s\S]{0,80}DOWNLOAD_PERMISSION/)
    assert.notInclude(content, 'businessScope()')
  })
})

test.group('report_jobs_controller — misma descarga que el Excel síncrono', () => {
  test('create y download evalúan employeesAttendanceReportJobDeclaration', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/report_jobs_controller.ts'),
      'utf8'
    )
    assert.include(content, 'employeesAttendanceReportJobDeclaration')
    assert.include(content, 'ensureSecondaryPermission')
    assert.include(content, 'employeesAttendanceReportJobDeclaration(reportJobType, employeeId)')
    assert.include(content, 'employeesAttendanceReportJobDeclaration(job.reportJobType')
  })
})

test.group('proceeding_file y contract — descarga con AND de pestaña', () => {
  test('download de expediente declara download-proceeding-files; show no cambia', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_proceeding_file_routes.ts'),
      'utf8'
    )
    const packed = compact(content)
    assert.match(
      packed,
      /\/:employeeProceedingFileId\/download[\s\S]{0,220}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.downloadProceedingFile\)/
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeProceedingFile)'
    )
  })

  test('download de contrato declara download-employee-contract', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_contract_routes.ts'),
      'utf8'
    )
    const packed = compact(content)
    assert.match(
      packed,
      /\/:employeeContractId\/download[\s\S]{0,220}permissionGate\(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS\.downloadEmployeeContract\)/
    )
  })

  test('los controladores exigen la lectura de pestaña antes de enviar el archivo', async ({
    assert,
  }) => {
    const proceeding = await readFile(
      join(process.cwd(), 'app/controllers/employee_proceeding_file_controller.ts'),
      'utf8'
    )
    const contract = await readFile(
      join(process.cwd(), 'app/controllers/employee_contract_controller.ts'),
      'utf8'
    )
    assert.include(proceeding, 'ensureSecondaryPermission')
    assert.include(proceeding, 'EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION')
    assert.include(contract, 'ensureSecondaryPermission')
    assert.include(contract, 'EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION')
  })
})

import { test } from '@japa/runner'
import {
  EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS,
  EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION,
  EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION,
  employeesAttendanceReportJobDeclaration,
} from '#constants/employees_download_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 18 descargas con module employees y bypass standard', ({
    assert,
  }) => {
    const keys = Object.keys(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 18)
    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))
    for (const key of keys) {
      const decl =
        EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS[
          key as keyof typeof EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS
        ]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      assert.isTrue(catalogSlugs.has(decl.action as string), `${key}:${decl.action}`)
    }
  })

  test('mapea cada superficie a su slug propio sin herencia', ({ assert }) => {
    const d = EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS
    assert.equal(d.getEmployeesExcel.action, 'download-employees-list')
    assert.equal(d.getEmployeesImportTemplate.action, 'download-employees-import-template')
    assert.equal(d.getShiftAssignmentTemplate.action, 'download-shift-assignment-template')
    assert.equal(d.getAttendanceReport.action, 'download-attendance-report')
    assert.equal(d.exportShiftExceptionsExcel.action, 'download-shift-exceptions')
    assert.equal(d.getVacationsExcel.action, 'download-vacations-report')
    assert.equal(d.getVacationsUsedExcel.action, 'download-vacations-history')
    assert.equal(d.getVacationsSummaryExcel.action, 'download-vacations-summary')
    assert.equal(d.getVacationImportTemplate.action, 'download-vacation-import-template')
    assert.equal(d.getPayrollFormat.action, 'download-payroll-format')
    assert.equal(d.getAttendanceByEmployee.action, 'download-attendance-by-employee')
    assert.equal(d.getAttendanceByPosition.action, 'download-attendance-by-position')
    assert.equal(d.getAttendanceByDepartment.action, 'download-attendance-by-department')
    assert.equal(d.getAttendanceAll.action, 'download-attendance-all')
    assert.equal(d.getPermissionsByDates.action, 'download-permissions-by-dates')
    assert.equal(d.getSuppliesExcel.action, 'download-supplies-report')
    assert.equal(d.downloadProceedingFile.action, 'download-proceeding-files')
    assert.equal(d.downloadEmployeeContract.action, 'download-employee-contract')

    const actions = Object.values(d).map((decl) => decl.action)
    assert.equal(new Set(actions).size, actions.length)
  })

  test('el AND de expediente y contrato exige la lectura de su pestaña', ({ assert }) => {
    assert.equal(EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION.action, 'tab-expediente-read')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION.module, 'employees')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_DOWNLOAD_TAB_READ_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION.action, 'tab-trabajo-read')
    assert.equal(EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION.module, 'employees')
    assert.equal(EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION.bypass, 'standard')
  })

  test('el job asíncrono reutiliza asistencia por colaborador o general', ({ assert }) => {
    assert.equal(
      employeesAttendanceReportJobDeclaration('assistance_employee').action,
      'download-attendance-by-employee'
    )
    assert.equal(
      employeesAttendanceReportJobDeclaration('assistance_incident_summary', 44).action,
      'download-attendance-by-employee'
    )
    assert.equal(
      employeesAttendanceReportJobDeclaration('assistance_all').action,
      'download-attendance-all'
    )
    assert.equal(
      employeesAttendanceReportJobDeclaration('assistance_incident_summary').action,
      'download-attendance-all'
    )
    assert.equal(
      employeesAttendanceReportJobDeclaration('assistance_incident_summary_payroll').action,
      'download-attendance-all'
    )
  })
})

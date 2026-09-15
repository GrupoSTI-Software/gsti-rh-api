import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_medical_condition_routes — PermissionGate', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_medical_condition_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition)'
    )
    // La consulta del colaborador no debe llevar gate de escritura
    assert.notMatch(content, /getByEmployee[\s\S]{0,200}permissionGate/)
  })
})

test.group('employee_lactation_periods_routes — PermissionGate', () => {
  test('las 10 escrituras y las lecturas del reporte, conflictos y descarga declaran su gate', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_lactation_periods_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    const keys = [
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
    ]
    for (const key of keys) {
      assert.include(
        compact(content),
        `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      )
    }
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 10)
    // Las lecturas también llevan gate: el reporte y su PDF son de la Bitácora
    // de lactancia; conflictos y descarga de evidencias, de la pestaña de
    // lactancia de Empleados.
    for (const gate of [
      'EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS.complianceReport',
      'EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS.complianceReportExport',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.listAllLactationConflicts',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.listLactationConflicts',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.downloadLactationEvidence',
    ]) {
      assert.include(compact(content), `permissionGate(${gate})`, gate)
    }
  })
})

test.group('work_disability_*_routes — PermissionGate', () => {
  test('incapacidad, periodos, notas y gastos declaran manage-work-disabilities', async ({
    assert,
  }) => {
    const files = [
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const keys = [
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    let joined = ''
    for (const file of files) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of keys) {
      assert.include(
        compact(joined),
        `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      )
    }
    const matches =
      compact(joined).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 12)

    const disabilities = await readFile(
      join(process.cwd(), 'start/routes/work_disability_routes.ts'),
      'utf8'
    )
    assert.notMatch(disabilities, /getByEmployee[\s\S]{0,200}permissionGate/)
  })
})

test.group('lactancia — comprobación legacy intacta', () => {
  test('controladores siguen exigiendo update-information vía assertHasPermission', async ({
    assert,
  }) => {
    const periods = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_periods_controller.ts'),
      'utf8'
    )
    const evidences = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_period_evidences_controller.ts'),
      'utf8'
    )
    assert.include(periods, "update: 'update-information'")
    assert.include(periods, 'assertHasPermission')
    assert.include(periods, "key: 'sin-permiso'")
    assert.include(evidences, 'assertHasPermission')
    assert.include(evidences, "key: 'sin-permiso'")
  })
})

test.group('guards — fuera de alcance de esta historia', () => {
  test('comando y scheduler de aviso automático no usan permissionGate', async ({ assert }) => {
    const command = await readFile(
      join(process.cwd(), 'commands/lactation_notify_expiring.ts'),
      'utf8'
    )
    const scheduler = await readFile(join(process.cwd(), 'start/scheduler.ts'), 'utf8')
    const lactationNotificationConstants = await readFile(
      join(process.cwd(), 'app/constants/employee_lactation_notification.ts'),
      'utf8'
    )
    assert.notInclude(command, 'permissionGate')
    assert.notInclude(command, 'PermissionGate')
    assert.notInclude(scheduler, 'permissionGate')
    assert.include(
      lactationNotificationConstants,
      "export const LACTATION_NOTIFY_EXPIRING_COMMAND = 'lactation:notify-expiring'"
    )
    assert.include(scheduler, 'LACTATION_NOTIFY_EXPIRING_COMMAND')
  })

  test('catálogos de tipos de condición médica no declaran gate de sección', async ({ assert }) => {
    const files = [
      'start/routes/medical_condition_type_routes.ts',
      'start/routes/medical_condition_type_property_routes.ts',
      'start/routes/medical_condition_type_property_value_routes.ts',
    ]
    for (const file of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      assert.notInclude(content, 'permissionGate')
      assert.notInclude(content, 'tab-condicion-medica')
    }
  })
})

test.group('cobertura — 25 escrituras de salud/lactancia/incapacidades', () => {
  test('cada clave del dominio aparece exactamente una vez en rutas', async ({ assert }) => {
    const routeFiles = [
      'start/routes/employee_medical_condition_routes.ts',
      'start/routes/employee_lactation_periods_routes.ts',
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const expected = [
      'createEmployeeMedicalCondition',
      'updateEmployeeMedicalCondition',
      'deleteEmployeeMedicalCondition',
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    assert.equal(expected.length, 25)

    let joined = ''
    for (const file of routeFiles) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of expected) {
      const needle = `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      const count = compact(joined).split(needle).length - 1
      assert.equal(count, 1, `${key} debe aparecer exactamente una vez en rutas`)
    }
    const allMatches =
      compact(joined).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(allMatches.length, 25)
  })
})

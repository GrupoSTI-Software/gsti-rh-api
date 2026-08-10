import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_medical_condition_routes — PermissionGate', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_medical_condition_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition)'
    )
    // La consulta del colaborador no debe llevar gate de escritura
    assert.notMatch(content, /getByEmployee[\s\S]{0,200}permissionGate/)
  })
})

test.group('employee_lactation_periods_routes — PermissionGate', () => {
  test('las 10 escrituras declaran permissionGate', async ({ assert }) => {
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
      assert.include(content, `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`)
    }
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 10)
    // Lecturas / reportes / download no llevan gate (sus handlers no aparecen junto a permissionGate)
    assert.notMatch(content, /complianceReport[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /listConflicts[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /listAllConflicts[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /downloadUrl[\s\S]{0,80}permissionGate/)
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

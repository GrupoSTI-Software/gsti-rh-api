import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_evaluation — PermissionGate Evaluaciones', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_evaluation.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEvaluationPotential)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEvaluation)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 4)
    assert.notInclude(compact(content), "get('/').use(middleware.permissionGate")
    assert.notInclude(
      compact(content),
      "get('/:employeeEvaluationId').use(middleware.permissionGate"
    )
    assert.notInclude(
      compact(content),
      "get('/by-employee/:employeeId').use(middleware.permissionGate"
    )
  })
})

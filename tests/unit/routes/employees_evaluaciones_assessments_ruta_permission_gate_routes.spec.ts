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

test.group('employee_competency_evaluation — PermissionGate Evaluaciones (herencia)', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_competency_evaluation.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCompetencyEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeCompetencyEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCompetencyEvaluation)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_kpi_evaluation — PermissionGate Evaluaciones (herencia)', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_kpi_evaluation.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeKpiEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeKpiEvaluation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeKpiEvaluation)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_assessment_routes — PermissionGate Assessments', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_assessment_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAssessment)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAssessment)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAssessment)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEvaluation)')
  })
})

test.group('career_path_candidate_routes — PermissionGate Ruta de carrera', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/career_path_candidate_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCareerPathCandidate)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCareerPathCandidateStatus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCareerPathCandidate)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
  })
})

test.group('Evaluaciones/Assessments/Ruta — total de gates en los cinco archivos', () => {
  test('suma exactamente 16 permissionGate de declaraciones', async ({ assert }) => {
    const files = [
      'start/routes/employee_evaluation.ts',
      'start/routes/employee_competency_evaluation.ts',
      'start/routes/employee_kpi_evaluation.ts',
      'start/routes/employee_assessment_routes.ts',
      'start/routes/career_path_candidate_routes.ts',
    ]
    let total = 0
    for (const relative of files) {
      const content = await readFile(join(process.cwd(), relative), 'utf8')
      const matches =
        compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
        []
      total += matches.length
    }
    assert.equal(total, 16)
  })
})

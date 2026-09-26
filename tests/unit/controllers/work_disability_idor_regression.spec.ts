import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058487 — 404 uniforme fuera de alcance (anti-IDOR) y bypass
 * de la purga masiva para no dejar residuos por el candado.
 */

test.group('Incapacidades — 404 uniforme y purga sin candado', () => {
  test('work_disability_controller responde 404 con key recurso-no-encontrado', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/controllers/work_disability_controller.ts'),
      'utf-8'
    )

    assert.include(content, "key: 'recurso-no-encontrado'")
    assert.include(content, 'WORK_DISABILITY_ERROR_CODES.NOT_FOUND')
    assert.include(content, 'workDisabilityNotFoundResponse')
  })

  test('deleteAllEmployees envuelve counts/deletes de incapacidades en runUnscoped', ({
    assert,
  }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/employee_service.ts'), 'utf-8')

    assert.include(content, 'TenantContext.runUnscoped')
    assert.include(content, 'purga masiva de empleados')
    assert.include(content, 'WorkDisability.query()')
    assert.include(content, 'WorkDisabilityNote.query()')
    assert.include(content, 'WorkDisabilityPeriod.query()')
    assert.include(content, 'WorkDisabilityPeriodExpense.query()')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058510 — rutas ya con businessScope; aviso de vencimientos
 * debe correr bajo runUnscoped (cross-empresa).
 */

test.group('Lactancia — rutas y aviso cross-empresa', () => {
  test('employee_lactation_periods_routes monta auth + businessScope', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'start/routes/employee_lactation_periods_routes.ts'),
      'utf-8'
    )
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('notification service envuelve la corrida en runUnscoped', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/employee_lactation_notification_service.ts'),
      'utf-8'
    )
    assert.include(content, 'TenantContext.runUnscoped')
    assert.include(content, 'aviso de vencimientos de lactancia')
    assert.include(content, 'business_unit_id: r.businessUnitId')
  })
})

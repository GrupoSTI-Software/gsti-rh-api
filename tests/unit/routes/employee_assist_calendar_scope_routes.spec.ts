import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058544 — `employee_assist_calendar_routes.ts` montaba solo
 * `auth()`; el controlador lee por `employeeId` sin filtro propio, así que
 * sin `businessScope()` el candado del modelo nunca se activa.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/employee_assist_calendar_routes.ts')

test.group('employee_assist_calendar_routes — scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/v1/employee-assist-calendars')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('el índice sigue expuesto bajo el grupo con scope', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "router.get('/', '#controllers/employee_assist_calendar_controller.index')"
    )
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios de las rutas de consulta de estatus del buzón de quejas
 * (USRH1783115930049): confirma que el GET original sigue vivo (deprecado,
 * para apps ya instaladas) y que el POST nuevo (credenciales en body) está
 * registrado apuntando al controlador correcto, sin levantar el servidor.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/complaint_routes.ts')

test.group('Complaint status — rutas', () => {
  test('expone GET /status apuntando a consultStatus (deprecado)', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    assert.include(
      content,
      "router.get('/status', '#controllers/complaint_controller.consultStatus')"
    )
  })

  test('expone POST /status apuntando a consultStatusFromBody', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    assert.include(
      content,
      "router.post('/status', '#controllers/complaint_controller.consultStatusFromBody')"
    )
  })
})

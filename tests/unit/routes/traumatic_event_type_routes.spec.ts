import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios del archivo de rutas traumatic_event_type_routes.
 * Validan prefijo, método GET y middleware auth sin levantar el servidor.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/traumatic_event_type_routes.ts')
const MAIN_ROUTES_FILE = join(process.cwd(), 'start/routes.ts')

test.group('TraumaticEventType — rutas', () => {
  test('expone GET /api/traumatic-event-types con middleware auth', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/traumatic-event-types')")
    assert.include(content, "router.get('/', '#controllers/traumatic_event_type_controller.index')")
    assert.include(content, 'middleware.auth()')
  })

  test('está importado en start/routes.ts', ({ assert }) => {
    const content = readFileSync(MAIN_ROUTES_FILE, 'utf-8')
    assert.include(content, './routes/traumatic_event_type_routes.js')
  })
})

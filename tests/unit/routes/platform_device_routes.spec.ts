import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'

/**
 * El tramo de plataforma cruza empresas por definicion. Si alguna vez se le
 * cae el guard, cualquier autenticado veria las series completas de toda la
 * flota y los incidentes de todos los clientes.
 */
test.group('platform_device_routes — guard obligatorio', () => {
  test('todas las rutas van detras de auth y platformAdmin', async ({ assert }) => {
    const content = await readFile('start/routes/platform_device_routes.ts', 'utf8')

    assert.include(content, 'middleware.platformAdmin()')
    assert.include(content, "middleware.auth({ guards: ['api'] })")
    // Y sin scope de tenant: aqui no aplica, y ponerlo lo dejaria sin ver nada.
    assert.notInclude(content, 'businessScope')
  })

  test('el prefijo es el del tramo de plataforma', async ({ assert }) => {
    const content = await readFile('start/routes/platform_device_routes.ts', 'utf8')
    assert.include(content, "prefix('/api/platform/devices')")
  })

  test('las rutas del tramo estan registradas', async ({ assert }) => {
    const routes = await readFile('start/routes.ts', 'utf8')
    assert.include(routes, "import './routes/platform_device_routes.js'")
  })
})

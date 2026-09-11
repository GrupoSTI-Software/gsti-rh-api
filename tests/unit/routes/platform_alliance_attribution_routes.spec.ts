import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROUTES_PATH = 'start/routes/platform_alliance_attribution_routes.ts'

test.group('platform_alliance_attribution_routes — guard de plataforma', () => {
  test('el grupo completo usa auth + platformAdmin', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, 'middleware.auth(')
    assert.include(content, 'middleware.platformAdmin()')
  })

  test('nunca declara businessScope() — no es dato de tenant', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
  })

  test('declara las tres rutas del contrato', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, 'router.post(')
    assert.include(content, '/alliance-attributions')
    assert.include(content, '/alliance-attributions/:allianceAttributionId')
    assert.include(content, '/tenants/:businessUnitPublicId/alliance-attributions')
  })
})

test.group('start/routes.ts — registro de atribuciones', () => {
  test('platform_alliance_attribution_routes.js está importado', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(content, "import './routes/platform_alliance_attribution_routes.js'")
  })
})

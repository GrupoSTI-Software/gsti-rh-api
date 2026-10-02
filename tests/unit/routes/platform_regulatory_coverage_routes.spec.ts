import { test } from '@japa/runner'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1790610965479 — las lecturas de cobertura regulatoria son dato de
 * plataforma: sus rutas deben llevar `auth` + `platformAdmin`, nunca
 * `businessScope` ni `permissionGate` (no pertenece a ninguna empresa cliente).
 */

const ROUTES_PATH = 'start/routes/platform_regulatory_coverage_routes.ts'

test.group('platform_regulatory_coverage_routes — guard de plataforma', () => {
  test('el grupo completo usa auth + platformAdmin', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, 'middleware.auth(')
    assert.include(content, 'middleware.platformAdmin()')
  })

  test('nunca declara businessScope ni permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
    assert.notInclude(content, 'permissionGate')
  })

  test('declara las 3 lecturas', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(
      content,
      "router.get('/', '#modules/regulatory-coverage/regulatory_coverage.controller.index')"
    )
    assert.include(
      content,
      "router.get('/summary', '#modules/regulatory-coverage/regulatory_coverage.controller.summary')"
    )
    assert.include(
      content,
      "router.get('/:regulationId', '#modules/regulatory-coverage/regulatory_coverage.controller.show')"
    )
  })

  test('summary se declara antes que :regulationId', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.isBelow(content.indexOf("'/summary'"), content.indexOf("'/:regulationId'"))
  })
})

test.group('start/routes.ts — registro del módulo', () => {
  test('platform_regulatory_coverage_routes.js está importado', async ({ assert }) => {
    const routesTs = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(routesTs, "import './routes/platform_regulatory_coverage_routes.js'")
  })

  test('el archivo de rutas viejo fue eliminado', async ({ assert }) => {
    const routesTs = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.notInclude(routesTs, "import './routes/regulatory_coverage_routes.js'")
    await assert.rejects(() =>
      access(join(process.cwd(), 'start/routes/regulatory_coverage_routes.ts'))
    )
  })
})

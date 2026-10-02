import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1790610965479 — las lecturas del marco regulatorio son dato de
 * plataforma: sus rutas deben llevar `auth` + `platformAdmin`, nunca
 * `businessScope` ni `permissionGate` (no pertenece a ninguna empresa cliente).
 */

const ROUTES_PATH = 'start/routes/platform_regulatory_framework_routes.ts'

test.group('platform_regulatory_framework_routes — guard de plataforma', () => {
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

  test('declara las 5 lecturas', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(
      content,
      "router.get('/regulatory-authorities', '#modules/regulatory-framework/regulatory_framework.controller.listAuthorities')"
    )
    assert.include(
      content,
      "router.get('/regulatory-authorities/:slug', '#modules/regulatory-framework/regulatory_framework.controller.showAuthority')"
    )
    assert.include(
      content,
      "router.get('/regulations/:code', '#modules/regulatory-framework/regulatory_framework.controller.showRegulation')"
    )
    assert.include(
      content,
      "router.get('/regulations/:code/clauses/:clauseCode', '#modules/regulatory-framework/regulatory_framework.controller.showClause')"
    )
    assert.include(
      content,
      "router.get('/regulations/:code/clauses/:clauseCode/features', '#modules/regulatory-framework/regulatory_framework.controller.showClauseFeatures')"
    )
  })
})

test.group('start/routes.ts — registro del módulo', () => {
  test('platform_regulatory_framework_routes.js está importado', async ({ assert }) => {
    const routesTs = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(routesTs, "import './routes/platform_regulatory_framework_routes.js'")
  })
})

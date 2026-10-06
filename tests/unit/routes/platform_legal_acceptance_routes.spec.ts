import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1790610965452 — las aceptaciones legales son dato de plataforma: sus
 * rutas deben llevar `auth` + `platformAdmin`, nunca `businessScope()` (sin
 * scope de tenant).
 */

const ROUTES_PATH = 'start/routes/platform_legal_acceptance_routes.ts'

test.group('platform_legal_acceptance_routes — guard de plataforma', () => {
  test('declara un único router.group cerrado con prefijo y guard', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    const groupMatches = content.match(/router\s*\.group\(/g)
    assert.equal(groupMatches?.length ?? 0, 1)
    assert.include(content, ".prefix('/api/platform')")
    assert.include(content, "middleware.auth({ guards: ['api'] })")
    assert.include(content, 'middleware.platformAdmin()')
  })

  test('nunca declara businessScope()', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
  })

  test('declara GET /legal-acceptances hacia el index', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(
      content,
      "router.get('/legal-acceptances', '#modules/consent/platform/platform_consent.controller.index')"
    )
  })

  test('declara GET /tenants/:businessUnitPublicId/legal-acceptances hacia tenantHistory', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    // Prettier parte la llamada en varias líneas: se comparan sin espacios en blanco
    // (mismo criterio de tolerancia que la prueba "ninguna ruta fuera del grupo").
    const compact = content.replace(/\s+/g, '')
    assert.include(
      compact,
      "router.get('/tenants/:businessUnitPublicId/legal-acceptances','#modules/consent/platform/platform_consent.controller.tenantHistory')"
    )
  })

  test('ninguna ruta fuera del grupo', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    // Prettier parte la cadena en `router\n  .group(`: se tolera el salto de línea.
    const groupIndex = content.search(/router\s*\.group\(/)
    const firstGetIndex = content.indexOf('router.get(')
    assert.isTrue(groupIndex >= 0 && firstGetIndex >= 0)
    assert.isTrue(groupIndex < firstGetIndex)
    assert.notMatch(content, /router\.post\(/)
    assert.notMatch(content, /router\.put\(/)
    assert.notMatch(content, /router\.patch\(/)
    assert.notMatch(content, /router\.delete\(/)
  })
})

test.group('start/routes.ts — registro del módulo', () => {
  test('platform_legal_acceptance_routes.js está importado', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(content, "import './routes/platform_legal_acceptance_routes.js'")
  })
})

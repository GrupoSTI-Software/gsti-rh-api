import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1790610965394 — la gestión de documentos legales es dato de plataforma:
 * sus rutas deben llevar `auth` + `platformAdmin`, nunca `businessScope`
 * (no pertenece a ninguna empresa cliente; es global de plataforma).
 *
 * Molde: tests/unit/routes/platform_discount_code_routes.spec.ts
 * Seguridad (S1 del spec): si estas aserciones fallan, las 5 rutas de gestión
 * quedan expuestas sin el guard correcto.
 */

const PLATFORM_ROUTES_PATH = 'start/routes/platform_legal_document_routes.ts'
const LEGACY_ROUTES_PATH = 'app/modules/legal-documents/legal_document.routes.ts'

test.group('platform_legal_document_routes — guard de plataforma', () => {
  test('el grupo completo usa auth + platformAdmin', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), PLATFORM_ROUTES_PATH), 'utf8')
    assert.include(content, 'middleware.auth(')
    assert.include(content, 'middleware.platformAdmin()')
  })

  test('nunca declara businessScope() — no es dato de tenant', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), PLATFORM_ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
  })

  test('declara las 5 rutas de gestión bajo /api/platform/legal-documents', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), PLATFORM_ROUTES_PATH), 'utf8')
    assert.include(content, "router.get('/', '#modules/legal-documents/legal_document.controller.listByType')")
    assert.include(content, "router.get('/:id', '#modules/legal-documents/legal_document.controller.getById')")
    assert.include(content, "router.post('/', '#modules/legal-documents/legal_document.controller.createDraft')")
    assert.include(content, "router.put('/:id', '#modules/legal-documents/legal_document.controller.updateDraft')")
    assert.include(content, "router.post('/:id/publish', '#modules/legal-documents/legal_document.controller.publish')")
  })

  test('el prefijo del grupo es /api/platform/legal-documents', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), PLATFORM_ROUTES_PATH), 'utf8')
    assert.include(content, "'/api/platform/legal-documents'")
  })
})

test.group('start/routes.ts — registro del módulo', () => {
  test('platform_legal_document_routes.js está importado en start/routes.ts', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(content, "import './routes/platform_legal_document_routes.js'")
  })
})

test.group('legal_document.routes.ts — solo expone /current', () => {
  test('solo declara GET /current — las 5 rutas de gestión salieron', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), LEGACY_ROUTES_PATH), 'utf8')
    assert.include(content, "router.get('/current',")
    assert.notInclude(content, 'listByType')
    assert.notInclude(content, 'getById')
    assert.notInclude(content, 'createDraft')
    assert.notInclude(content, 'updateDraft')
    assert.notInclude(content, '.publish')
  })

  test('no declara businessScope() ni platformAdmin() — es lectura pública con solo auth', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), LEGACY_ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
    assert.notInclude(content, 'platformAdmin')
  })
})

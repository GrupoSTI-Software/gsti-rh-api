import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1790610965572 (CA-16) — la lectura pública de documentos legales declara una sola ruta,
 * sin autenticación ni alcance de empresa, protegida por el limitador de 60/min por IP.
 */

const ROUTES_FILE = join(
  process.cwd(),
  'app/modules/legal-documents/legal_document_public.routes.ts'
)

test.group('LegalDocument public — tabla de rutas (CA-16)', () => {
  test('declara exactamente una ruta GET /current', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    const routeDeclarations = content.match(/\.\s*(get|post|put|patch|delete)\(/g) ?? []
    assert.lengthOf(routeDeclarations, 1)
    assert.include(
      content,
      "router\n      .get('/current', '#modules/legal-documents/legal_document_public.controller.current')"
    )
  })

  test('la ruta cuelga del prefijo /api/public/legal-documents', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, ".prefix('/api/public/legal-documents')")
  })

  test('la ruta monta el limitador legal-document-public con .use(', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, '.use(legalDocumentPublicRateLimit)')
    assert.include(content, "limiter.define('legal-document-public'")
  })

  test('el limitador es de 60 por minuto y usa la IP como llave', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, 'allowRequests(60)')
    assert.include(content, "every('1 minute')")
    assert.include(content, 'usingKey(ctx.request.ip())')
  })

  test('no contiene middleware.auth( ni businessScope', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.notInclude(content, 'middleware.auth(')
    assert.notInclude(content, 'businessScope')
  })
})

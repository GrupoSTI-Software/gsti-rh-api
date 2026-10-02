import { test } from '@japa/runner'
import {
  isLegalDocumentPublicPath,
  isLegalDocumentPublicRateLimitError,
  respondLegalDocumentPublicRateLimit,
} from '../../../app/helpers/legal_document_public_request_errors.js'
import { LEGAL_DOCUMENT_PUBLIC_ERROR_CODES } from '../../../app/constants/legal_document_public_error_codes.js'

/**
 * La consulta pública de documentos legales no tiene sesión: el límite por IP es
 * su única defensa. Lo que se fija aquí es que al dispararse responda con el
 * contrato propio (incluido `code`), sin caché y con cuánto falta para reintentar.
 */

function fakeResponse() {
  const headers: Record<string, unknown> = {}
  let status = 0
  let body: unknown = null
  const response = {
    status(code: number) {
      status = code
      return response
    },
    header(name: string, value: unknown) {
      headers[name] = value
      return response
    },
    json(payload: unknown) {
      body = payload
      return response
    },
  }
  return {
    ctx: { response } as never,
    read: () => ({ status, headers, body: body as Record<string, unknown> }),
  }
}

function tooManyRequests() {
  return {
    code: 'E_TOO_MANY_REQUESTS',
    response: { limit: 60, remaining: 0, availableIn: 30 },
  } as never
}

test.group('legal_document_public_request_errors — a qué ruta aplica', () => {
  test('reconoce la ruta pública, con y sin query, y no otras', ({ assert }) => {
    assert.isTrue(isLegalDocumentPublicPath('/api/public/legal-documents/current'))
    assert.isTrue(isLegalDocumentPublicPath('/api/public/legal-documents/current?locale=es'))
    assert.isFalse(isLegalDocumentPublicPath('/api/legal-documents/current'))
    assert.isFalse(isLegalDocumentPublicPath('/api/public/legal-documents/history'))
    assert.isFalse(isLegalDocumentPublicPath('/api/auth/login'))
  })

  test('reconoce el error del limitador aunque llegue sin instancia', ({ assert }) => {
    assert.isTrue(isLegalDocumentPublicRateLimitError(tooManyRequests()))
    assert.isFalse(isLegalDocumentPublicRateLimitError(new Error('otra cosa')))
    assert.isFalse(isLegalDocumentPublicRateLimitError({ code: 'E_TOO_MANY_REQUESTS' }))
  })
})

test.group('legal_document_public_request_errors — qué responde', () => {
  test('responde 429 con cabeceras de límite, sin caché y con el contrato', ({ assert }) => {
    const { ctx, read } = fakeResponse()

    respondLegalDocumentPublicRateLimit(ctx, tooManyRequests())

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['Cache-Control'], 'no-store')
    assert.equal(headers['X-RateLimit-Limit'], 60)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 30)
    assert.isString(headers['X-RateLimit-Reset'])
    assert.isFalse(Number.isNaN(Date.parse(headers['X-RateLimit-Reset'] as string)))

    assert.sameMembers(Object.keys(body), [
      'type',
      'title',
      'detail',
      'key',
      'code',
      'retryAfterSeconds',
    ])
    assert.equal(body.type, 'error')
    assert.isString(body.title)
    assert.isString(body.detail)
    assert.isString(body.key)
    assert.equal(body.code, LEGAL_DOCUMENT_PUBLIC_ERROR_CODES.RATE_LIMITED)
    assert.equal(body.code, 'LGDOC.PUBLIC.002')
    assert.equal(body.retryAfterSeconds, 30)
  })

  test('no filtra el mensaje interno del limitador', ({ assert }) => {
    const { ctx, read } = fakeResponse()

    respondLegalDocumentPublicRateLimit(ctx, tooManyRequests())

    const texto = JSON.stringify(read().body)
    assert.notInclude(texto, 'Too many requests')
    assert.notInclude(texto, 'E_TOO_MANY_REQUESTS')
  })
})

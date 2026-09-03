import { test } from '@japa/runner'
import { errors as limiterErrors } from '@adonisjs/limiter'
import {
  isAuthLoginPath,
  isAuthLoginRateLimitError,
  respondAuthLoginRateLimit,
} from '../../../app/helpers/auth_login_request_errors.js'
import { AUTH_LOGIN_ERROR_CODES } from '../../../app/constants/auth_login_error_codes.js'

/**
 * El 429 del límite de intentos no tenía respuesta propia: caía al manejador por
 * defecto y el cliente recibía un cuerpo fuera del contrato. Lo que se fija aquí
 * es que sí lo tenga, y que lleve `Retry-After` — sin ese dato la app solo puede
 * decir "espera unos minutos".
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

function tooManyRequests(availableIn: number) {
  return new limiterErrors.E_TOO_MANY_REQUESTS({
    limit: 5,
    remaining: 0,
    consumed: 6,
    availableIn,
  } as never)
}

test.group('auth_login_request_errors — a qué ruta aplica', () => {
  test('reconoce la ruta de acceso y no otras del mismo grupo', ({ assert }) => {
    assert.isTrue(isAuthLoginPath('/api/auth/login'))
    assert.isTrue(isAuthLoginPath('/api/auth/login?foo=1'))
    assert.isFalse(isAuthLoginPath('/api/auth/logout'))
    assert.isFalse(isAuthLoginPath('/api/auth/recovery'))
    assert.isFalse(isAuthLoginPath('/api/platform/auth/login'))
  })

  test('reconoce el error del limitador aunque llegue sin instancia', ({ assert }) => {
    assert.isTrue(isAuthLoginRateLimitError(tooManyRequests(300)))
    assert.isTrue(
      isAuthLoginRateLimitError({ code: 'E_TOO_MANY_REQUESTS', response: {} })
    )
    assert.isFalse(isAuthLoginRateLimitError(new Error('otra cosa')))
    assert.isFalse(isAuthLoginRateLimitError({ code: 'E_TOO_MANY_REQUESTS' }))
  })
})

test.group('auth_login_request_errors — qué responde', () => {
  test('responde 429 con el contrato y con cuánto falta', ({ assert }) => {
    const { ctx, read } = fakeResponse()

    respondAuthLoginRateLimit(ctx, tooManyRequests(480))

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['Retry-After'], 480)
    assert.equal(body.key, AUTH_LOGIN_ERROR_CODES.RATE_LIMITED)
    assert.equal(body.retryAfterSeconds, 480)
    assert.isString(body.title)
    assert.isString(body.detail)
  })

  test('no filtra el mensaje interno del limitador', ({ assert }) => {
    const { ctx, read } = fakeResponse()

    respondAuthLoginRateLimit(ctx, tooManyRequests(60))

    const texto = JSON.stringify(read().body)
    assert.notInclude(texto, 'Too many requests')
    assert.notInclude(texto, 'E_TOO_MANY_REQUESTS')
  })
})

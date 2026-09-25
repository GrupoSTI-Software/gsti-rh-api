import { test } from '@japa/runner'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { readFileSync } from 'node:fs'
import {
  isPersonWritePath,
  isPersonWriteRateLimitError,
  respondPersonWriteRateLimit,
  respondPersonEmailProbeRateLimit,
} from '../../../app/helpers/person_email_request_errors.js'
import {
  PERSON_IDENTITY_ERROR_CODES,
  PERSON_IDENTITY_ERRORS,
} from '../../../app/constants/person_identity_error_codes.js'

/**
 * T1 del censo C.2. Sin bootear controladores: ctx falso con response espía e
 * i18n falso. La respuesta 429 del sondeo de correo personal existe para que el
 * cliente reciba el contrato del equipo y sepa cuándo volver a intentar, en vez
 * del cuerpo por defecto de Adonis. El 429 es deliberadamente indistinguible
 * entre contadores.
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
  const i18n = { t: (key: string) => key }
  return {
    ctx: { response, i18n } as never,
    read: () => ({ status, headers, body: body as Record<string, unknown> }),
  }
}

function tooManyRequests(availableIn: number, limit = 5, remaining = 0) {
  return new limiterErrors.E_TOO_MANY_REQUESTS({
    limit,
    remaining,
    consumed: limit + 1,
    availableIn,
  } as never)
}

test.group('person_email_request_errors — a qué ruta aplica', () => {
  test('reconoce escritura de personas y no rutas hermanas del prefijo', ({ assert }) => {
    assert.isTrue(isPersonWritePath('/api/persons'))
    assert.isTrue(isPersonWritePath('/api/persons/12'))
    assert.isTrue(isPersonWritePath('/api/persons?x=1'))
    assert.isFalse(isPersonWritePath('/api/persons-get-places-of-birth'))
    assert.isFalse(isPersonWritePath('/api/person-get-employee/12'))
  })
})

test.group('person_email_request_errors — reconocer el error', () => {
  test('reconoce el error del limitador aunque llegue sin instancia', ({ assert }) => {
    assert.isTrue(isPersonWriteRateLimitError(tooManyRequests(3600)))
    assert.isTrue(
      isPersonWriteRateLimitError({ code: 'E_TOO_MANY_REQUESTS', response: {} })
    )
    assert.isFalse(isPersonWriteRateLimitError(new Error('otra cosa')))
    assert.isFalse(isPersonWriteRateLimitError({ code: 'E_TOO_MANY_REQUESTS' }))
  })
})

test.group('person_email_request_errors — qué responde', () => {
  test('respondPersonWriteRateLimit responde 429 con headers RFC 6585 y el contrato', ({
    assert,
  }) => {
    const { ctx, read } = fakeResponse()

    respondPersonWriteRateLimit(ctx, tooManyRequests(3600))

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['X-RateLimit-Limit'], 5)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 3600)
    assert.isString(headers['X-RateLimit-Reset'])
    assert.equal(body.title, 'person_email_probe_rate_limited_title')
    assert.equal(body.detail, 'person_email_probe_rate_limited_detail')
    assert.equal(body.key, 'demasiados-intentos-de-captura-de-correo')
    assert.equal(body.code, 'PERSON.IDENTITY.006')
  })

  test('respondPersonEmailProbeRateLimit responde 429 con limit explícito y remaining 0', ({
    assert,
  }) => {
    const { ctx, read } = fakeResponse()

    respondPersonEmailProbeRateLimit(ctx, 3600, 20)

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['X-RateLimit-Limit'], 20)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 3600)
    assert.isString(headers['X-RateLimit-Reset'])
    assert.equal(body.title, 'person_email_probe_rate_limited_title')
    assert.equal(body.detail, 'person_email_probe_rate_limited_detail')
    assert.equal(body.key, 'demasiados-intentos-de-captura-de-correo')
    assert.equal(body.code, 'PERSON.IDENTITY.006')
  })

  test('no filtra el mensaje interno del limitador', ({ assert }) => {
    const { ctx, read } = fakeResponse()

    respondPersonWriteRateLimit(ctx, tooManyRequests(60))

    const texto = JSON.stringify(read().body)
    assert.notInclude(texto, 'Too many requests')
    assert.notInclude(texto, 'E_TOO_MANY_REQUESTS')
  })
})

test.group('person_email_request_errors — catálogo', () => {
  test('la entrada del catálogo es 429 y con la key pactada', ({ assert }) => {
    assert.equal(PERSON_IDENTITY_ERROR_CODES.EMAIL_PROBE_RATE_LIMITED, 'PERSON.IDENTITY.006')
    assert.deepEqual(PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED, {
      key: 'demasiados-intentos-de-captura-de-correo',
      code: 'PERSON.IDENTITY.006',
      status: 429,
    })
  })
})

test.group('person_email_request_errors — i18n', () => {
  const keys = ['person_email_probe_rate_limited_title', 'person_email_probe_rate_limited_detail']

  test('las dos claves existen en es.json y en en.json, y el detail no delata', ({ assert }) => {
    for (const lang of ['es', 'en']) {
      const path = new URL(`../../../resources/langs/${lang}.json`, import.meta.url)
      const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
      for (const key of keys) {
        assert.isString(catalog[key], `${lang}.json debe traer ${key}`)
      }
    }

    const esPath = new URL('../../../resources/langs/es.json', import.meta.url)
    const es = JSON.parse(readFileSync(esPath, 'utf8')) as Record<string, string>
    const detail = es.person_email_probe_rate_limited_detail
    assert.notInclude(detail, 'registrado')
    assert.notInclude(detail, 'sondeo')
  })
})

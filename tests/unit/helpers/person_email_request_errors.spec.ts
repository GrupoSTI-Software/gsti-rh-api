import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
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

/**
 * Ancla el VALOR de `X-RateLimit-Reset`, no su tipo: un `isString` deja pasar
 * una fecha mal calculada. El instante emitido debe ser el de la llamada (que
 * cae entre `before` y `after`) más el desfase en segundos que corresponde al
 * límite topado.
 */
function assertResetHeader(
  assert: Assert,
  value: unknown,
  offsetSeconds: number,
  before: number,
  after: number
): void {
  assert.isString(value, 'X-RateLimit-Reset debe ser una cadena ISO')
  const reset = value as string
  assert.match(
    reset,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'X-RateLimit-Reset debe ser una fecha ISO-8601 en UTC'
  )
  const resetMs = Date.parse(reset)
  assert.isFalse(Number.isNaN(resetMs), 'la fecha debe ser parseable')
  assert.equal(
    new Date(resetMs).toISOString(),
    reset,
    'la cadena debe ser la representación ISO exacta del instante'
  )
  const offsetMs = offsetSeconds * 1000
  assert.isAtLeast(
    resetMs,
    before + offsetMs,
    'el reset no puede ser anterior al instante de la llamada + el desfase'
  )
  assert.isAtMost(
    resetMs,
    after + offsetMs,
    'el reset no puede ser posterior al instante de la llamada + el desfase'
  )
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

    const before = Date.now()
    respondPersonWriteRateLimit(ctx, tooManyRequests(3600))
    const after = Date.now()

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['X-RateLimit-Limit'], 5)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 3600)
    assertResetHeader(assert, headers['X-RateLimit-Reset'], 3600, before, after)
    assert.equal(body.title, 'person_email_probe_rate_limited_title')
    assert.equal(body.detail, 'person_email_probe_rate_limited_detail')
    assert.equal(body.key, 'demasiados-intentos-de-captura-de-correo')
    assert.equal(body.code, 'PERSON.IDENTITY.006')
  })

  test('respondPersonEmailProbeRateLimit responde 429 con limit explícito y remaining 0', ({
    assert,
  }) => {
    const { ctx, read } = fakeResponse()

    const before = Date.now()
    respondPersonEmailProbeRateLimit(ctx, 3600, 20)
    const after = Date.now()

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['X-RateLimit-Limit'], 20)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 3600)
    assertResetHeader(assert, headers['X-RateLimit-Reset'], 3600, before, after)
    assert.equal(body.title, 'person_email_probe_rate_limited_title')
    assert.equal(body.detail, 'person_email_probe_rate_limited_detail')
    assert.equal(body.key, 'demasiados-intentos-de-captura-de-correo')
    assert.equal(body.code, 'PERSON.IDENTITY.006')
  })

  test('un error serializado sin contadores igual responde 429 con las cuatro cabeceras', ({
    assert,
  }) => {
    const { ctx, read } = fakeResponse()

    // Objeto pato incompleto: es la forma que acepta el predicado tras cruzar un
    // borde de serialización. No debe lanzar RangeError ni devolver 500.
    const before = Date.now()
    respondPersonWriteRateLimit(ctx, {
      code: 'E_TOO_MANY_REQUESTS',
      response: {},
    } as never)
    const after = Date.now()

    const { status, headers, body } = read()
    assert.equal(status, 429)
    assert.equal(headers['X-RateLimit-Limit'], 0)
    assert.equal(headers['X-RateLimit-Remaining'], 0)
    assert.equal(headers['Retry-After'], 0)
    assertResetHeader(assert, headers['X-RateLimit-Reset'], 0, before, after)
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

  test('los dos emisores del 429 producen el mismo cuerpo y las mismas cabeceras', ({ assert }) => {
    // El tiempo se congela para que el `X-RateLimit-Reset` de los dos emisores
    // sea comparable: sin congelarlo, la copia duplicada del cuerpo y las
    // cabeceras podría derivar sin que esta prueba lo notara.
    const fixedNow = 1_700_000_000_000
    const realNow = Date.now
    Date.now = () => fixedNow

    try {
      const write = fakeResponse()
      respondPersonWriteRateLimit(write.ctx, tooManyRequests(3600, 20, 0))
      const probe = fakeResponse()
      respondPersonEmailProbeRateLimit(probe.ctx, 3600, 20)

      const a = write.read()
      const b = probe.read()

      assert.equal(a.status, b.status, 'mismo status')
      assert.deepEqual(a.body, b.body, 'mismo cuerpo byte a byte')
      assert.deepEqual(a.headers, b.headers, 'mismas cabeceras con los mismos valores propios')
      // Y el valor propio de cada emisor es el que le toca.
      assert.equal(a.headers['X-RateLimit-Reset'], new Date(fixedNow + 3600 * 1000).toISOString())
      assert.equal(a.headers['Retry-After'], 3600)
      assert.equal(a.headers['X-RateLimit-Limit'], 20)
      assert.equal(a.headers['X-RateLimit-Remaining'], 0)
    } finally {
      Date.now = realNow
    }
  })

  test('cambiar los valores propios no altera el cuerpo: el contrato es idéntico', ({ assert }) => {
    const write = fakeResponse()
    respondPersonWriteRateLimit(write.ctx, tooManyRequests(60, 7, 3))
    const probe = fakeResponse()
    respondPersonEmailProbeRateLimit(probe.ctx, 60, 7)

    const a = write.read()
    const b = probe.read()

    // El cuerpo no depende de los contadores: es el MISMO con límites distintos.
    assert.deepEqual(a.body, b.body)
    // Lo único propio de cada emisor son sus cuatro valores de cabecera.
    assert.equal(a.headers['X-RateLimit-Limit'], 7)
    assert.equal(b.headers['X-RateLimit-Limit'], 7)
    assert.equal(a.headers['X-RateLimit-Remaining'], 3)
    assert.equal(b.headers['X-RateLimit-Remaining'], 0)
    assert.equal(a.headers['Retry-After'], 60)
    assert.equal(b.headers['Retry-After'], 60)
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

  test('las dos claves existen en es.json y en en.json, y el detail no delata en ningún idioma', ({
    assert,
  }) => {
    for (const lang of ['es', 'en']) {
      const path = new URL(`../../../resources/langs/${lang}.json`, import.meta.url)
      const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
      for (const key of keys) {
        assert.isString(catalog[key], `${lang}.json debe traer ${key}`)
      }

      const detail = catalog.person_email_probe_rate_limited_detail
      assert.notInclude(detail, 'registrado')
      assert.notInclude(detail, 'sondeo')
    }
  })
})

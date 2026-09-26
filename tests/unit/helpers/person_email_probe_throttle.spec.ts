import { test } from '@japa/runner'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import testUtils from '@adonisjs/core/services/test_utils'
import i18nManager from '@adonisjs/i18n/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { LogStore } from '#models/MongoDB/log_store'
import User from '#models/user'
import { blindIndex } from '#utils/blind_index'
import {
  PERSON_EMAIL_PROBE_RATE,
  PERSON_EMAIL_PROBE_BUSINESS_RATE,
  PERSON_WRITE_RATE,
  PersonEmailProbeThrottleMemory,
  PersonEmailProbeBusinessThrottleMemory,
  personEmailProbeGuard,
  personWriteRateLimit,
  logPersonEmailProbe,
} from '#helpers/person_email_probe_throttle'

/**
 * Task 3 (USRH1789762889970) — contador del sondeo, guard de ruta y envoltorio
 * del desenlace.
 *
 * Las clases corren contra el store `memory` REAL de `@adonisjs/limiter`
 * (el runner de `ace test` bootea la app, así que el singleton `limiter` está
 * disponible). El store `memory` PERSISTE entre casos del mismo proceso: cada
 * test usa SUJETOS ÚNICOS (`user:t3-*`, `bu:t3-*`) para no contaminar los demás.
 *
 * Regla dura del spec (§7): se consume cuota en TODO intento, jamás `penalize`.
 * El 21º intento es el que recibe el 429 porque el corte lo detecta `isBlocked`
 * al inicio del intento siguiente.
 */
function captureSet(): {
  collection: () => string
  payload: () => Record<string, unknown>
  called: () => boolean
} {
  let collection = ''
  let payload: Record<string, unknown> = {}
  let called = false
  LogStore.set = async (collectionName: string, logData: Parameters<typeof LogStore.set>[1]) => {
    collection = collectionName
    payload = logData as Record<string, unknown>
    called = true
  }
  return { collection: () => collection, payload: () => payload, called: () => called }
}

test.group('PersonEmailProbeThrottleMemory — umbral de usuario (20/h)', () => {
  test('19 intentos pasan y el 20º toca el techo', async ({ assert }) => {
    assert.deepEqual(PERSON_EMAIL_PROBE_RATE, { requests: 20, duration: '1 hour', blockMinutes: 60 })

    const throttle = new PersonEmailProbeThrottleMemory()
    const subject = 'user:t3-a1'

    for (let i = 1; i < PERSON_EMAIL_PROBE_RATE.requests; i++) {
      assert.equal(await throttle.count(subject), 'ok', `el intento ${i} debe pasar`)
    }
    assert.equal(await throttle.count(subject), 'threshold_reached')
  })

  test('tras el 20º intento el sujeto queda bloqueado y otro sujeto no se contamina', async ({
    assert,
  }) => {
    const throttle = new PersonEmailProbeThrottleMemory()
    const subject = 'user:t3-a2'

    for (let i = 0; i < PERSON_EMAIL_PROBE_RATE.requests; i++) {
      await throttle.count(subject)
    }

    assert.isTrue(await throttle.isBlocked(subject))
    // La llave es POR SUJETO: otro sujeto no paga el bloqueo del primero.
    assert.isFalse(await throttle.isBlocked('user:t3-a2-otro'))
    assert.equal(await throttle.count('user:t3-a2-otro'), 'ok')
  })
})

test.group('PersonEmailProbeBusinessThrottleMemory — techo por empresa (200/h)', () => {
  test('199 intentos pasan, el 200º toca el techo y su llave no pisa la del usuario', async ({
    assert,
  }) => {
    assert.deepEqual(PERSON_EMAIL_PROBE_BUSINESS_RATE, {
      requests: 200,
      duration: '1 hour',
      blockMinutes: 60,
    })

    const business = new PersonEmailProbeBusinessThrottleMemory()
    const subject = 'bu:t3-b1'

    for (let i = 1; i < PERSON_EMAIL_PROBE_BUSINESS_RATE.requests; i++) {
      assert.equal(await business.count(subject), 'ok', `el intento ${i} debe pasar`)
    }
    assert.equal(await business.count(subject), 'threshold_reached')
    assert.isTrue(await business.isBlocked(subject))

    // Misma terminación numérica, prefijo distinto → contador del usuario intacto.
    const user = new PersonEmailProbeThrottleMemory()
    assert.isFalse(await user.isBlocked('user:t3-b1'))
    assert.equal(await user.count('user:t3-b1'), 'ok')
  })
})

test.group('logPersonEmailProbe — el desenlace se registra solo si el guard dejó contexto', (group) => {
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  test('con contexto escribe log_person_email_probe con el outcome dado', async ({ assert }) => {
    const captured = captureSet()
    const email = 'sondeo-t3@dominio.mx'
    const ctx = await testUtils.createHttpContext()
    ctx.personEmailProbe = {
      path: 'update',
      emailHash: blindIndex(email),
      actorUserId: 5,
      businessUnitScope: [1, 2],
      targetPersonId: 42,
    }

    await logPersonEmailProbe(ctx, 'rejected_not_available')

    assert.equal(captured.collection(), 'log_person_email_probe')
    assert.equal(captured.payload().outcome, 'rejected_not_available')
    assert.equal(captured.payload().path, 'update')
    assert.equal(captured.payload().email_hash, blindIndex(email))
    assert.equal(captured.payload().actor_user_id, 5)
    assert.deepEqual(captured.payload().business_unit_scope, [1, 2])
    assert.equal(captured.payload().target_person_id, 42)
  })

  test('sin contexto no escribe nada: la regla del correo vacío se decide en el guard', async ({
    assert,
  }) => {
    const captured = captureSet()
    const ctx = await testUtils.createHttpContext()

    await logPersonEmailProbe(ctx, 'accepted')

    assert.isFalse(captured.called())
  })
})

test.group('personEmailProbeGuard — el intento y su corte', (group) => {
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  function makeNext(): { next: NextFn; calls: () => number } {
    let calls = 0
    const next: NextFn = async () => {
      calls++
    }
    return { next, calls: () => calls }
  }

  async function makeGuardCtx(options: {
    method: string
    personEmail: string
    userId: number
    businessUnitScope?: number[]
    personId?: string
  }): Promise<{ ctx: HttpContext; next: NextFn; calls: () => number }> {
    const req = new IncomingMessage(new Socket())
    req.method = options.method
    const ctx = await testUtils.createHttpContext({ req })
    ctx.i18n = i18nManager.locale('es')
    ctx.request.updateBody({ personEmail: options.personEmail })
    const actor = new User()
    actor.userId = options.userId
    ctx.auth = { user: actor } as HttpContext['auth']
    ctx.businessUnitScope = options.businessUnitScope ?? []
    if (options.personId !== undefined) {
      ctx.params = { personId: options.personId }
    }
    const counter = makeNext()
    return { ctx, next: counter.next, calls: counter.calls }
  }

  test('correo vacío o solo espacios no es intento: no consume cuota ni deja contexto', async ({
    assert,
  }) => {
    const captured = captureSet()

    for (let i = 0; i < 25; i++) {
      const { ctx, next, calls } = await makeGuardCtx({
        method: 'PUT',
        personEmail: '   ',
        userId: 7000101,
      })
      await personEmailProbeGuard(ctx, next)
      assert.equal(calls(), 1)
      assert.isUndefined(ctx.personEmailProbe)
    }
    assert.isFalse(captured.called())

    // Si el vacío hubiera consumido cuota, el sujeto ya estaría a medio camino.
    let passed = 0
    for (let i = 0; i < PERSON_EMAIL_PROBE_RATE.requests; i++) {
      const { ctx, next } = await makeGuardCtx({
        method: 'PUT',
        personEmail: `vacio-probe-${i}@dominio.mx`,
        userId: 7000101,
        businessUnitScope: [7000101],
      })
      await personEmailProbeGuard(ctx, next)
      if (ctx.personEmailProbe) passed++
    }
    assert.equal(passed, PERSON_EMAIL_PROBE_RATE.requests, 'el correo vacío no consumió cuota')
  })

  test('POST deja el contexto store y targetPersonId null (el alta no escribe expediente)', async ({
    assert,
  }) => {
    const email = 'alta-t3@dominio.mx'
    const { ctx, next, calls } = await makeGuardCtx({
      method: 'POST',
      personEmail: `  ${email}  `,
      userId: 7000202,
      businessUnitScope: [11, 22],
    })

    await personEmailProbeGuard(ctx, next)

    assert.equal(calls(), 1)
    assert.equal(ctx.personEmailProbe?.path, 'store')
    assert.equal(ctx.personEmailProbe?.emailHash, blindIndex(email))
    assert.equal(ctx.personEmailProbe?.actorUserId, 7000202)
    assert.deepEqual(ctx.personEmailProbe?.businessUnitScope, [11, 22])
    assert.isNull(ctx.personEmailProbe?.targetPersonId)
  })

  test('PUT deja el contexto update con el expediente como targetPersonId', async ({ assert }) => {
    const { ctx, next, calls } = await makeGuardCtx({
      method: 'PUT',
      personEmail: 'edita-t3@dominio.mx',
      userId: 7000303,
      businessUnitScope: [33],
      personId: '4242',
    })

    await personEmailProbeGuard(ctx, next)

    assert.equal(calls(), 1)
    assert.equal(ctx.personEmailProbe?.path, 'update')
    assert.equal(ctx.personEmailProbe?.targetPersonId, 4242)
  })

  test('el 21º intento recibe 429 y se registra rate_limited, sin dejar contexto', async ({
    assert,
  }) => {
    const captured = captureSet()
    const userId = 7000404
    const businessUnitScope = [7000404]

    let passed = 0
    for (let i = 0; i < PERSON_EMAIL_PROBE_RATE.requests; i++) {
      const { ctx, next } = await makeGuardCtx({
        method: 'PUT',
        personEmail: `sondeo-${i}@dominio.mx`,
        userId,
        businessUnitScope,
      })
      await personEmailProbeGuard(ctx, next)
      if (ctx.personEmailProbe) passed++
    }
    assert.equal(passed, PERSON_EMAIL_PROBE_RATE.requests, 'los 20 primeros pasan')

    const { ctx, next, calls } = await makeGuardCtx({
      method: 'PUT',
      personEmail: 'sondeo-21@dominio.mx',
      userId,
      businessUnitScope,
    })
    await personEmailProbeGuard(ctx, next)

    assert.equal(ctx.response.getStatus(), 429)
    assert.isUndefined(ctx.personEmailProbe)
    assert.equal(calls(), 0, 'el corte no llega al controlador')
    assert.isTrue(captured.called())
    assert.equal(captured.payload().outcome, 'rate_limited')
    assert.equal(captured.payload().actor_user_id, userId)
    assert.equal(captured.payload().path, 'update')
  })

  test('el techo de la EMPRESA corta por el guard: 429 y fila rate_limited con el usuario intacto', async ({
    assert,
  }) => {
    const captured = captureSet()
    const businessId = 7000606
    const businessSubject = `bu:${businessId}`

    // Se topa el techo de la empresa con su umbral REAL (200), fuera del guard:
    // un solo usuario (20/h) jamás lo alcanzaría, por eso esta rama solo se
    // ejercita aquí. Si la llave `bu:` se rompiera o el OR se invirtiera, este
    // caso sería el único que lo notaría.
    const business = new PersonEmailProbeBusinessThrottleMemory()
    for (let i = 0; i < PERSON_EMAIL_PROBE_BUSINESS_RATE.requests; i++) {
      await business.count(businessSubject)
    }
    assert.isTrue(await business.isBlocked(businessSubject))

    // Actor FRESCO: su contador individual está intacto, así que el corte tiene
    // que venir de la rama `bu:` del OR y no de la del usuario.
    const { ctx, next, calls } = await makeGuardCtx({
      method: 'POST',
      personEmail: 'empresa-topada-t3@dominio.mx',
      userId: 7000607,
      businessUnitScope: [businessId],
    })
    await personEmailProbeGuard(ctx, next)

    assert.equal(ctx.response.getStatus(), 429)
    assert.isUndefined(ctx.personEmailProbe)
    assert.equal(calls(), 0, 'el corte por empresa no llega al controlador')
    assert.isTrue(captured.called())
    assert.equal(captured.payload().outcome, 'rate_limited')
    assert.equal(captured.payload().path, 'store')
    assert.equal(captured.payload().actor_user_id, 7000607)
    assert.deepEqual(captured.payload().business_unit_scope, [businessId])
  })

  test('sin empresa cuenta en el cubo compartido `bu:sin-empresa` y se corta al toparlo', async ({
    assert,
  }) => {
    const captured = captureSet()
    const bucket = 'bu:sin-empresa'
    const business = new PersonEmailProbeBusinessThrottleMemory()

    // 200 actores DISTINTOS y sin empresa: cada contador individual arranca
    // intacto, así que los 200 intentos pasan y cargan el cubo compartido
    // `businessUnitScope: [] → 'sin-empresa'` (el fallback, nunca un literal).
    let passed = 0
    for (let i = 0; i < PERSON_EMAIL_PROBE_BUSINESS_RATE.requests; i++) {
      const { ctx, next } = await makeGuardCtx({
        method: 'POST',
        personEmail: `sin-empresa-${i}@dominio.mx`,
        userId: 7000700 + i,
        businessUnitScope: [],
      })
      await personEmailProbeGuard(ctx, next)
      if (ctx.personEmailProbe) passed++
    }
    assert.equal(
      passed,
      PERSON_EMAIL_PROBE_BUSINESS_RATE.requests,
      'los 200 intentos cargaron el cubo sin-empresa'
    )
    assert.isTrue(await business.isBlocked(bucket), 'el techo cayó sobre el cubo sin-empresa')
    // El cubo de quien sí tiene empresa no se contaminó.
    assert.isFalse(await business.isBlocked('bu:7000700'))

    const { ctx, next, calls } = await makeGuardCtx({
      method: 'POST',
      personEmail: 'sin-empresa-201@dominio.mx',
      userId: 7999999,
      businessUnitScope: [],
    })
    await personEmailProbeGuard(ctx, next)

    assert.equal(ctx.response.getStatus(), 429)
    assert.isUndefined(ctx.personEmailProbe)
    assert.equal(calls(), 0)
    assert.equal(captured.payload().outcome, 'rate_limited')
    assert.deepEqual(captured.payload().business_unit_scope, [])
  })
})

test.group('personWriteRateLimit — el piso de escritura sin cabeceras de framework', () => {
  function makeNext(): { next: NextFn; calls: () => number } {
    let calls = 0
    const next: NextFn = async () => {
      calls++
    }
    return { next, calls: () => calls }
  }

  async function makeWriteCtx(
    userId: number | null
  ): Promise<{ ctx: HttpContext; next: NextFn; calls: () => number }> {
    const ctx = await testUtils.createHttpContext()
    if (userId === null) {
      ctx.auth = { user: null } as unknown as HttpContext['auth']
    } else {
      const actor = new User()
      actor.userId = userId
      ctx.auth = { user: actor } as HttpContext['auth']
    }
    const counter = makeNext()
    return { ctx, next: counter.next, calls: counter.calls }
  }

  test('consume del store REAL: 40 pasan, el 41º lanza E_TOO_MANY_REQUESTS y otro usuario no paga', async ({
    assert,
  }) => {
    assert.deepEqual(PERSON_WRITE_RATE, { requests: 40, duration: '1 minute' })

    const userId = 8001001
    for (let i = 0; i < PERSON_WRITE_RATE.requests; i++) {
      const { ctx, next, calls } = await makeWriteCtx(userId)
      await personWriteRateLimit(ctx, next)
      assert.equal(calls(), 1, `la petición ${i + 1} pasa al siguiente middleware`)
    }

    const over = await makeWriteCtx(userId)
    let caught: unknown
    try {
      await personWriteRateLimit(over.ctx, over.next)
    } catch (error) {
      caught = error
    }
    assert.equal(
      (caught as { code?: string } | undefined)?.code,
      'E_TOO_MANY_REQUESTS',
      'la cuota agotada lanza E_TOO_MANY_REQUESTS (el handler lo traduce a 429)'
    )
    assert.equal(over.calls(), 0, 'el corte no llega al controlador')

    // La llave es POR USUARIO: otro actor no paga el bloqueo del primero.
    const otro = await makeWriteCtx(userId + 1)
    await personWriteRateLimit(otro.ctx, otro.next)
    assert.equal(otro.calls(), 1)
  })

  test('NO escribe cabeceras X-RateLimit-* ni Retry-After en la respuesta que atraviesa', async ({
    assert,
  }) => {
    const { ctx, next, calls } = await makeWriteCtx(8002002)

    await personWriteRateLimit(ctx, next)

    assert.equal(calls(), 1)
    assert.isUndefined(ctx.response.getHeader('X-RateLimit-Limit'))
    assert.isUndefined(ctx.response.getHeader('X-RateLimit-Remaining'))
    assert.isUndefined(ctx.response.getHeader('Retry-After'))
    assert.isUndefined(ctx.response.getHeader('X-RateLimit-Reset'))
  })

  test('sin actor consume igual (llave por IP), sin escribir cabeceras', async ({ assert }) => {
    const { ctx, next, calls } = await makeWriteCtx(null)

    await personWriteRateLimit(ctx, next)

    assert.equal(calls(), 1)
    assert.isUndefined(ctx.response.getHeader('X-RateLimit-Limit'))
  })
})

test.group('person_email_probe_throttle — regla dura nunca-penalize', () => {
  test('el contador no menciona `penalize` y sí usa su llave propia', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/helpers/person_email_probe_throttle.ts'),
      'utf8'
    )

    assert.notInclude(source, 'penalize', 'la cuota se consume en TODO intento, jamás con penalize')
    // El sujeto cae a IP cuando no hay actor: prohibido un literal fijo que agrupe a
    // todos en un cubo global único (el gate del DoD hace el mismo grep).
    assert.notInclude(source, 'anonimo', 'el sujeto cae a IP, nunca a una cadena fija')
    assert.include(source, 'person-email-probe:', 'la llave separada del piso de escritura')
  })
})

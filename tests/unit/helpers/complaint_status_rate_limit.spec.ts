import { test } from '@japa/runner'
import { LimiterManager, stores, errors as limiterErrors } from '@adonisjs/limiter'
import { consultStatusRateLimited } from '../../../app/helpers/complaint_status_rate_limit.js'

/**
 * USRH1783115930049 — candados de fuerza bruta de la consulta de estatus
 * del buzón. Corre contra el store `memory` real de `@adonisjs/limiter`
 * (sin bootear la app ni tocar la base de datos): cada test arma su propio
 * `LimiterManager` para no compartir contadores entre casos.
 */
function makeLimiters() {
  const manager = new LimiterManager({
    default: 'memory',
    stores: { memory: stores.memory({}) },
  })
  return {
    ipLimiter: manager.use({ requests: 20, duration: '15 minutes' }),
    folioLimiter: manager.use({ requests: 5, duration: '15 minutes' }),
  }
}

test.group('complaint_status_rate_limit — regla 1 (solo fallos cuentan)', () => {
  test('una consulta exitosa siempre responde, sin importar cuántas veces se repita', async ({ assert }) => {
    const { ipLimiter, folioLimiter } = makeLimiters()

    for (let i = 0; i < 25; i++) {
      const result = await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:legit',
        folioLimiter,
        folioKey: 'folio:BQ-2026-000001',
        callback: async () => ({ ok: true }),
      })
      assert.deepEqual(result, { ok: true })
    }
  })
})

test.group('complaint_status_rate_limit — regla 2 (límite por folio)', () => {
  test('permite 5 fallos y bloquea el 6º intento sobre el mismo folio', async ({ assert }) => {
    const { ipLimiter, folioLimiter } = makeLimiters()
    const fail = () => {
      throw new Error('case-not-found')
    }

    for (let i = 1; i <= 5; i++) {
      await assert.rejects(() =>
        consultStatusRateLimited({
          ipLimiter,
          ipKey: `ip:distinct-${i}`,
          folioLimiter,
          folioKey: 'folio:BQ-2026-000002',
          callback: async () => fail(),
        }),
        'case-not-found'
      )
    }

    try {
      await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:distinct-6',
        folioLimiter,
        folioKey: 'folio:BQ-2026-000002',
        callback: async () => ({ ok: true }),
      })
      assert.fail('debía lanzar ThrottleException por folio agotado')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
  })
})

test.group('complaint_status_rate_limit — regla 2 (límite por IP/origen)', () => {
  test('bloquea al origen tras 20 fallos aunque cada intento use un folio distinto', async ({ assert }) => {
    const { ipLimiter, folioLimiter } = makeLimiters()
    const fail = () => {
      throw new Error('case-not-found')
    }

    for (let i = 1; i <= 20; i++) {
      await assert.rejects(() =>
        consultStatusRateLimited({
          ipLimiter,
          ipKey: 'ip:attacker',
          folioLimiter,
          folioKey: `folio:BQ-2026-${100000 + i}`,
          callback: async () => fail(),
        })
      )
    }

    try {
      await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:attacker',
        folioLimiter,
        folioKey: 'folio:BQ-2026-999999',
        callback: async () => ({ ok: true }),
      })
      assert.fail('debía lanzar ThrottleException por IP agotada')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
  })

  test('primero evalúa IP: si ya está agotado, ni siquiera llama al callback', async ({ assert }) => {
    const { ipLimiter, folioLimiter } = makeLimiters()
    const fail = () => {
      throw new Error('case-not-found')
    }
    for (let i = 1; i <= 20; i++) {
      await assert.rejects(() =>
        consultStatusRateLimited({
          ipLimiter,
          ipKey: 'ip:exhausted',
          folioLimiter,
          folioKey: `folio:BQ-2026-${200000 + i}`,
          callback: async () => fail(),
        })
      )
    }

    let callbackCalled = false
    try {
      await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:exhausted',
        folioLimiter,
        folioKey: 'folio:BQ-2026-777777',
        callback: async () => {
          callbackCalled = true
          return { ok: true }
        },
      })
      assert.fail('debía lanzar ThrottleException por IP agotada')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
    assert.isFalse(callbackCalled, 'el candado de IP debe cortar antes de tocar la base de datos')
  })
})

test.group('complaint_status_rate_limit — ThrottleException expone cuánto esperar', () => {
  test('el error de bloqueo trae availableIn (segundos) para el header Retry-After', async ({ assert }) => {
    const { ipLimiter, folioLimiter } = makeLimiters()
    const fail = () => {
      throw new Error('case-not-found')
    }
    for (let i = 1; i <= 5; i++) {
      await assert.rejects(() =>
        consultStatusRateLimited({
          ipLimiter,
          ipKey: `ip:x-${i}`,
          folioLimiter,
          folioKey: 'folio:BQ-2026-333333',
          callback: async () => fail(),
        })
      )
    }

    try {
      await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:x-6',
        folioLimiter,
        folioKey: 'folio:BQ-2026-333333',
        callback: async () => ({ ok: true }),
      })
      assert.fail('debía lanzar ThrottleException')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
      assert.isAbove((error as InstanceType<typeof limiterErrors.ThrottleException>).response.availableIn, 0)
    }
  })
})

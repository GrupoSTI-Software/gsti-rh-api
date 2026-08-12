import { test } from '@japa/runner'
import { LimiterManager, stores, errors as limiterErrors } from '@adonisjs/limiter'
import { consultStatusRateLimited } from '../../../app/helpers/complaint_status_rate_limit.js'

function makeManager() {
  return new LimiterManager({
    default: 'memory',
    stores: { memory: stores.memory({}) },
  })
}

test.group('complaint_status_rate_limit', () => {
  test('un intento correcto no consume cuota (resetea el contador)', async ({ assert }) => {
    const manager = makeManager()
    const ipLimiter = manager.use({ requests: 2, duration: '1 minute' })
    const folioLimiter = manager.use({ requests: 2, duration: '1 minute' })

    for (let i = 0; i < 10; i++) {
      const result = await consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:1',
        folioLimiter,
        folioKey: 'folio:A',
        callback: async () => 'ok',
      })
      assert.equal(result, 'ok')
    }
  })

  test('los fallos del folio agotan primero el candado del folio', async ({ assert }) => {
    const manager = makeManager()
    const ipLimiter = manager.use({ requests: 20, duration: '1 minute' })
    const folioLimiter = manager.use({ requests: 2, duration: '1 minute' })

    const attempt = () =>
      consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:2',
        folioLimiter,
        folioKey: 'folio:B',
        callback: async () => {
          throw new Error('folio o passphrase incorrectos')
        },
      })

    await assert.rejects(attempt)
    await assert.rejects(attempt)

    try {
      await attempt()
      assert.fail('se esperaba ThrottleException')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
  })

  test('los fallos agotan el candado de IP aunque el folio cambie', async ({ assert }) => {
    const manager = makeManager()
    const ipLimiter = manager.use({ requests: 2, duration: '1 minute' })
    const folioLimiter = manager.use({ requests: 20, duration: '1 minute' })

    const attempt = (folioKey: string) =>
      consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:3',
        folioLimiter,
        folioKey,
        callback: async () => {
          throw new Error('folio o passphrase incorrectos')
        },
      })

    await assert.rejects(() => attempt('folio:C1'))
    await assert.rejects(() => attempt('folio:C2'))

    try {
      await attempt('folio:C3')
      assert.fail('se esperaba ThrottleException')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
  })

  test('un candado de IP ya agotado bloquea sin tocar el folio', async ({ assert }) => {
    const manager = makeManager()
    const ipLimiter = manager.use({ requests: 1, duration: '1 minute' })
    const folioLimiter = manager.use({ requests: 20, duration: '1 minute' })

    const attempt = () =>
      consultStatusRateLimited({
        ipLimiter,
        ipKey: 'ip:4',
        folioLimiter,
        folioKey: 'folio:D',
        callback: async () => {
          throw new Error('folio o passphrase incorrectos')
        },
      })

    await assert.rejects(attempt)

    try {
      await attempt()
      assert.fail('se esperaba ThrottleException')
    } catch (error) {
      assert.instanceOf(error, limiterErrors.ThrottleException)
    }
  })
})

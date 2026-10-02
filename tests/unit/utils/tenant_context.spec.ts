import { test } from '@japa/runner'
import logger from '@adonisjs/core/services/logger'
import {
  TENANT_UNSCOPED_REASON,
  TENANT_UNSCOPED_REASON_POLICY,
} from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

type LoggerLevel = 'debug' | 'info' | 'warn'

function spyOnLoggerLevel(level: LoggerLevel): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = []
  const original = logger[level].bind(logger)
  ;(logger as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
    calls.push(args)
  }
  return {
    calls,
    restore: () => {
      ;(logger as unknown as Record<string, unknown>)[level] = original
    },
  }
}

test.group('TenantContext — estado del scope', () => {
  test('sin contexto activo isActive es false y getScope devuelve []', ({ assert }) => {
    assert.isFalse(TenantContext.isActive())
    assert.deepEqual(TenantContext.getScope(), [])
    assert.isFalse(TenantContext.isBypassed())
  })

  test('run activa el scope y desactiva bypass', ({ assert }) => {
    TenantContext.run([10, 20], () => {
      assert.isTrue(TenantContext.isActive())
      assert.deepEqual(TenantContext.getScope(), [10, 20])
      assert.isFalse(TenantContext.isBypassed())
    })
  })

  test('runUnscoped activa bypass con scope vacío', ({ assert }) => {
    TenantContext.runUnscoped(() => {
      assert.isTrue(TenantContext.isActive())
      assert.deepEqual(TenantContext.getScope(), [])
      assert.isTrue(TenantContext.isBypassed())
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
  })

  test('run anidado dentro de runUnscoped apaga el bypass en esa rama', ({ assert }) => {
    TenantContext.runUnscoped(() => {
      assert.isTrue(TenantContext.isBypassed())
      TenantContext.run([99], () => {
        assert.isFalse(TenantContext.isBypassed())
        assert.deepEqual(TenantContext.getScope(), [99])
      })
      assert.isTrue(TenantContext.isBypassed())
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
  })
})

test.group('TenantContext.runUnscoped — bitácora por política', () => {
  test('motivo del catálogo escribe en el nivel definido por la política', ({ assert }) => {
    const reason = TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    const level = TENANT_UNSCOPED_REASON_POLICY[reason].logLevel
    const spy = spyOnLoggerLevel(level)

    try {
      TenantContext.runUnscoped(() => undefined, reason, 'user:42')

      assert.lengthOf(spy.calls, 1)
      const payload = spy.calls[0][0] as Record<string, unknown>
      assert.equal(payload.reason, reason)
      assert.equal(payload.origin, TENANT_UNSCOPED_REASON_POLICY[reason].origin)
      assert.equal(payload.detail, 'user:42')
      assert.include(String(spy.calls[0][1]), 'TenantContext.runUnscoped')
    } finally {
      spy.restore()
    }
  })

  test('motivo legacy no escribe el texto libre y cae en debug', ({ assert }) => {
    const debugSpy = spyOnLoggerLevel('debug')
    const warnSpy = spyOnLoggerLevel('warn')

    try {
      TenantContext.runUnscoped(() => undefined, 'motivo heredado sin catálogo')

      assert.lengthOf(debugSpy.calls, 1)
      assert.deepEqual(debugSpy.calls[0][0], { reason: 'legacy' })
      assert.lengthOf(warnSpy.calls, 0)
    } finally {
      debugSpy.restore()
      warnSpy.restore()
    }
  })
})

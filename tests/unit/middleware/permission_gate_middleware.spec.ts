import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateMiddleware from '../../../app/middleware/permission_gate_middleware.js'
import PermissionGateService from '#services/permission_gate_service'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeContext(evaluateResult: { allowed: boolean; reason: string }): {
  ctx: HttpContext
  captured: CapturedResponse
} {
  const captured: CapturedResponse = {}

  const fakeService = {
    evaluate: async () => evaluateResult,
  } as unknown as PermissionGateService

  const ctx = {
    auth: { user: { userId: 1, roleId: 1 } },
    permissionGate: fakeService,
    response: {
      status(code: number) {
        captured.status = code
        return {
          json(body: Record<string, unknown>) {
            captured.body = body
            return body
          },
        }
      },
    },
  } as unknown as HttpContext

  return { ctx, captured }
}

test.group('PermissionGateMiddleware', () => {
  test('permite y llama next() cuando la decisión es allowed', async ({ assert }) => {
    const { ctx } = makeContext({ allowed: true, reason: 'granted' })
    let nextCalled = false

    await new PermissionGateMiddleware().handle(
      ctx,
      async () => {
        nextCalled = true
      },
      { module: 'test-module', action: 'read', bypass: 'standard' }
    )

    assert.isTrue(nextCalled)
  })

  test('responde 403 PERM.DENIED cuando la decisión es denied', async ({ assert }) => {
    const { ctx, captured } = makeContext({ allowed: false, reason: 'denied' })
    let nextCalled = false

    await new PermissionGateMiddleware().handle(
      ctx,
      async () => {
        nextCalled = true
      },
      { module: 'test-module', action: 'read', bypass: 'standard' }
    )

    assert.isFalse(nextCalled)
    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, PERMISSION_GATE_ERROR_CODES.DENIED)
    assert.isString(captured.body?.title)
    assert.isString(captured.body?.detail)
  })

  test('responde 403 PERM.UNRESOLVED cuando la decisión es unresolved', async ({ assert }) => {
    const { ctx, captured } = makeContext({ allowed: false, reason: 'unresolved' })
    let nextCalled = false

    await new PermissionGateMiddleware().handle(
      ctx,
      async () => {
        nextCalled = true
      },
      { module: 'test-module', action: 'read', bypass: 'standard' }
    )

    assert.isFalse(nextCalled)
    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, PERMISSION_GATE_ERROR_CODES.UNRESOLVED)
  })

  test('reusa la instancia de PermissionGateService ya cacheada en ctx.permissionGate', async ({ assert }) => {
    const { ctx } = makeContext({ allowed: true, reason: 'granted' })
    const originalService = ctx.permissionGate

    await new PermissionGateMiddleware().handle(ctx, async () => {}, {
      module: 'test-module',
      action: 'read',
      bypass: 'standard',
    })

    assert.strictEqual(ctx.permissionGate, originalService)
  })

  test('crea una instancia nueva cuando ctx.permissionGate no existe todavía', async ({ assert }) => {
    const ctx = {
      auth: { user: { userId: 1, roleId: 1 } },
      response: {
        status(code: number) {
          return {
            json(body: Record<string, unknown>) {
              return body
            },
          }
        },
      },
    } as unknown as HttpContext

    await new PermissionGateMiddleware().handle(ctx, async () => {}, {
      module: 'employees',
      action: 'read',
      bypass: 'standard',
    })

    assert.instanceOf(ctx.permissionGate, PermissionGateService)
  })
})

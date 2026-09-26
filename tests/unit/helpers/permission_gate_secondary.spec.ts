import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateService from '#services/permission_gate_service'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'

function makeCtx(evaluateResult: { allowed: boolean; reason: string }) {
  const captured: { status?: number; body?: Record<string, unknown> } = {}
  const fakeService = {
    evaluate: async () => evaluateResult,
  } as unknown as PermissionGateService

  const ctx = {
    auth: { user: { userId: 1 } },
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

test.group('ensureSecondaryPermission', () => {
  test('retorna true cuando allowed', async ({ assert }) => {
    const { ctx } = makeCtx({ allowed: true, reason: 'granted' })
    const ok = await ensureSecondaryPermission(ctx, {
      module: 'employees',
      action: 'delete',
      bypass: 'standard',
    })
    assert.isTrue(ok)
  })

  test('retorna false y responde 403 cuando denied', async ({ assert }) => {
    const { ctx, captured } = makeCtx({ allowed: false, reason: 'denied' })
    const ok = await ensureSecondaryPermission(ctx, {
      module: 'employees',
      action: 'delete',
      bypass: 'standard',
    })
    assert.isFalse(ok)
    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, PERMISSION_GATE_ERROR_CODES.DENIED)
  })
})

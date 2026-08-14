import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { respondPermissionGateDenial } from '#helpers/permission_gate_http'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'

test.group('respondPermissionGateDenial', () => {
  test('escribe 403 PERM.DENIED', async ({ assert }) => {
    const captured: { status?: number; body?: Record<string, unknown> } = {}
    const ctx = {
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

    respondPermissionGateDenial(ctx, { reason: 'denied' })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, PERMISSION_GATE_ERROR_CODES.DENIED)
    assert.equal(captured.body?.title, 'Sin permiso')
  })

  test('escribe 403 PERM.UNRESOLVED', async ({ assert }) => {
    const captured: { status?: number; body?: Record<string, unknown> } = {}
    const ctx = {
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

    respondPermissionGateDenial(ctx, { reason: 'unresolved' })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, PERMISSION_GATE_ERROR_CODES.UNRESOLVED)
  })
})

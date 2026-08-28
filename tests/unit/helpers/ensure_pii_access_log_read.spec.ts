import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import { PiiAuditError } from '#exceptions/pii_audit_error'
import { PII_AUDIT_ERROR_CODES } from '#constants/pii_audit_error_codes'
import { ensurePiiAccessLogRead } from '#helpers/ensure_pii_access_log_read'

function makeCtx(decision: PermissionGateDecision): HttpContext {
  const fakeService = {
    evaluateEnforced: async () => decision,
    evaluate: async () => {
      throw new Error('ensurePiiAccessLogRead no debe llamar evaluate')
    },
  } as unknown as PermissionGateService

  return {
    auth: { user: { userId: 1, roleId: 1 } },
    permissionGate: fakeService,
  } as unknown as HttpContext
}

test.group('ensurePiiAccessLogRead', () => {
  test('granted y bypass no lanzan', async ({ assert }) => {
    await ensurePiiAccessLogRead(makeCtx({ allowed: true, reason: 'granted' }))
    await ensurePiiAccessLogRead(makeCtx({ allowed: true, reason: 'bypass' }))
    assert.isTrue(true)
  })

  test('module-not-enforced, denied y unresolved lanzan FORBIDDEN 403', async ({ assert }) => {
    const denied: PermissionGateDecision[] = [
      { allowed: true, reason: 'module-not-enforced' },
      { allowed: false, reason: 'denied' },
      { allowed: false, reason: 'unresolved' },
    ]

    for (const decision of denied) {
      try {
        await ensurePiiAccessLogRead(makeCtx(decision))
        assert.fail(`debería lanzar con reason=${decision.reason}`)
      } catch (error) {
        assert.instanceOf(error, PiiAuditError)
        const audit = error as PiiAuditError
        assert.equal(audit.errorCode, PII_AUDIT_ERROR_CODES.FORBIDDEN)
        assert.equal(audit.httpStatus, 403)
        assert.equal(audit.key, 'consulta-bitacora-denegada')
        assert.equal(
          audit.message,
          'No tienes permiso para consultar la bitácora de accesos a datos sensibles.'
        )
      }
    }
  })

  test('reusa ctx.permissionGate y no instancia otro servicio', async ({ assert }) => {
    let evaluateCalls = 0
    const existing = {
      evaluateEnforced: async () => {
        evaluateCalls += 1
        return { allowed: true, reason: 'granted' } satisfies PermissionGateDecision
      },
    } as unknown as PermissionGateService

    const ctx = {
      auth: { user: { userId: 1, roleId: 1 } },
      permissionGate: existing,
    } as unknown as HttpContext

    await ensurePiiAccessLogRead(ctx)
    assert.equal(evaluateCalls, 1)
    assert.strictEqual(ctx.permissionGate, existing)
  })
})

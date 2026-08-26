import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateService from '#services/permission_gate_service'
import SensitiveAccessContextMiddleware from '#middleware/sensitive_access_context_middleware'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

test.group('SensitiveAccessContextMiddleware', () => {
  test('abre el ALS durante next() usando evaluateEnforced', async ({ assert }) => {
    const fakeService = {
      evaluateEnforced: async () => ({ allowed: true, reason: 'bypass' }),
    } as unknown as PermissionGateService

    const ctx = {
      auth: { user: { userId: 1, roleId: 1 } },
      permissionGate: fakeService,
    } as unknown as HttpContext

    let inside = false
    await new SensitiveAccessContextMiddleware().handle(ctx, async () => {
      inside = SensitiveAccessContext.canRead('identificacion')
    })

    assert.isTrue(inside)
    assert.isFalse(SensitiveAccessContext.isActive())
  })
})

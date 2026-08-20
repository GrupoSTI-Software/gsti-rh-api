import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import {
  isSensitiveReadAllowed,
  resolveSensitiveReadDecisions,
  runWithSensitiveReadDecisions,
} from '#helpers/sensitive_read_decisions'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

test.group('isSensitiveReadAllowed', () => {
  test('solo granted y bypass abren el dato', ({ assert }) => {
    const cases: Array<[PermissionGateDecision, boolean]> = [
      [{ allowed: true, reason: 'granted' }, true],
      [{ allowed: true, reason: 'bypass' }, true],
      [{ allowed: true, reason: 'module-not-enforced' }, false],
      [{ allowed: false, reason: 'denied' }, false],
      [{ allowed: false, reason: 'unresolved' }, false],
    ]
    for (const [decision, expected] of cases) {
      assert.equal(isSensitiveReadAllowed(decision), expected, decision.reason)
    }
  })
})

function makeCtx(
  evaluateEnforced: (action: string) => PermissionGateDecision
): HttpContext {
  const fakeService = {
    evaluateEnforced: async (_user: unknown, options: { action: string }) =>
      evaluateEnforced(options.action as string),
  } as unknown as PermissionGateService

  return {
    auth: { user: { userId: 1, roleId: 1 } },
    permissionGate: fakeService,
  } as unknown as HttpContext
}

test.group('resolveSensitiveReadDecisions', () => {
  test('mezcla categorías: contacto granted, el resto denied', async ({ assert }) => {
    const ctx = makeCtx((action) =>
      action === 'sensitive-contacto-read'
        ? { allowed: true, reason: 'granted' }
        : { allowed: false, reason: 'denied' }
    )

    const decisions = await resolveSensitiveReadDecisions(ctx)
    assert.isTrue(decisions.contacto)
    assert.isFalse(decisions.identificacion)
    assert.isFalse(decisions.financiero)
    assert.isFalse(decisions.salud)
    assert.isFalse(decisions.biometrico)
  })

  test('bypass abre las cinco', async ({ assert }) => {
    const ctx = makeCtx(() => ({ allowed: true, reason: 'bypass' }))
    const decisions = await resolveSensitiveReadDecisions(ctx)
    assert.isTrue(decisions.identificacion)
    assert.isTrue(decisions.contacto)
    assert.isTrue(decisions.financiero)
    assert.isTrue(decisions.salud)
    assert.isTrue(decisions.biometrico)
  })

  test('reusa ctx.permissionGate y no instancia otro servicio', async ({ assert }) => {
    const ctx = makeCtx(() => ({ allowed: false, reason: 'denied' }))
    const original = ctx.permissionGate
    await resolveSensitiveReadDecisions(ctx)
    assert.strictEqual(ctx.permissionGate, original)
  })
})

test.group('runWithSensitiveReadDecisions', () => {
  test('deja canRead activo durante next() y lo cierra al salir', async ({ assert }) => {
    const ctx = makeCtx((action) =>
      action === 'sensitive-salud-read'
        ? { allowed: true, reason: 'granted' }
        : { allowed: false, reason: 'denied' }
    )
    let seenInside = false
    const next: NextFn = async () => {
      seenInside = SensitiveAccessContext.canRead('salud')
      assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    }

    await runWithSensitiveReadDecisions(ctx, next)
    assert.isTrue(seenInside)
    assert.isFalse(SensitiveAccessContext.canRead('salud'))
  })
})

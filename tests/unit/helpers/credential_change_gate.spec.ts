import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import PermissionGateService from '#services/permission_gate_service'
import User from '#models/user'
import { ensureCredentialChangeAllowed } from '#helpers/credential_change_gate'

type GateDecision = PermissionGateDecision | ((options: PermissionGateOptions) => PermissionGateDecision)

async function gateContext(
  decision: GateDecision = { allowed: true, reason: 'granted' }
): Promise<{ ctx: HttpContext; evaluations: PermissionGateOptions[] }> {
  const ctx = await testUtils.createHttpContext()
  const actor = new User()
  actor.userId = 1
  actor.roleId = 1
  ctx.auth = { user: actor } as HttpContext['auth']

  const evaluations: PermissionGateOptions[] = []
  ctx.permissionGate = {
    evaluate: async (_user: User | null | undefined, options: PermissionGateOptions) => {
      evaluations.push(options)
      return typeof decision === 'function' ? decision(options) : decision
    },
  } as PermissionGateService

  return { ctx, evaluations }
}

function currentUser(email: string): User {
  const user = new User()
  user.userEmail = email
  return user
}

test('correo entrante vacio deja pasar sin pedir permiso', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext({ allowed: false, reason: 'denied' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    personId: 1,
    incomingEmail: '   ',
    persistedEmailType: 'personal',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 0)
})

test('sin contraparte viva deja pasar sin pedir permiso', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext({ allowed: false, reason: 'denied' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    personId: -1,
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'personal',
    origin: 'person-file',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 0)
})

test('tipo persistido cruzado deja pasar sin pedir permiso', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext({ allowed: false, reason: 'denied' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    personId: 7,
    currentUser: currentUser('viejo@corp.mx'),
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'institutional',
    origin: 'person-file',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 0)
})

test('correo ya sincronizado ignora mayusculas y espacios sin pedir permiso', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext({ allowed: false, reason: 'denied' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    currentUser: currentUser('  Persona@Corp.MX  '),
    incomingEmail: ' persona@corp.mx ',
    persistedEmailType: 'personal',
    origin: 'user-screen',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 0)
})

test('cambia sin permiso responde 403 y devuelve false', async ({ assert }) => {
  const { ctx } = await gateContext({ allowed: false, reason: 'denied' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    currentUser: currentUser('viejo@corp.mx'),
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'personal',
    origin: 'user-screen',
  })

  assert.isFalse(ok)
  assert.equal(ctx.response.getStatus(), 403)
})

test('cambia con permiso devuelve true', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext({ allowed: true, reason: 'granted' })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    currentUser: currentUser('viejo@corp.mx'),
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'personal',
    origin: 'user-screen',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 1)
  assert.equal(evaluations[0].action, 'credential-change')
})

test('root deja pasar por bypass standard', async ({ assert }) => {
  const { ctx, evaluations } = await gateContext((options) => ({
    allowed: options.bypass === 'standard',
    reason: options.bypass === 'standard' ? 'bypass' : 'denied',
  }))
  const ok = await ensureCredentialChangeAllowed(ctx, {
    currentUser: currentUser('viejo@corp.mx'),
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'personal',
    origin: 'user-screen',
  })

  assert.isTrue(ok)
  assert.lengthOf(evaluations, 1)
  assert.equal(evaluations[0].bypass, 'standard')
})

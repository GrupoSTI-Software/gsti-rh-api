import { test } from '@japa/runner'
import PiiAccessLogService from '#services/pii_access_log_service'
import {
  createActor,
  cleanupActor,
  buHeader,
  createSystemActor,
  cleanupSystemActor,
  grantAcrossModules,
  cleanupRevealLogs,
  type TenantActor,
} from './pii_permission_gate_support.js'

test.group('Permiso de la bitácora de accesos a datos sensibles (USRH1787433076989)', (group) => {
  let actor: TenantActor | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-audit-gate')
  })

  group.each.teardown(async () => {
    if (actor) {
      await cleanupRevealLogs({ userId: actor.user.userId })
      await cleanupRevealLogs({ businessUnitId: actor.businessUnit.businessUnitId })
    }
    await cleanupActor(actor)
    actor = null
  })

  test('F.8 — sin sensitive-data-access-log:read, la bitácora responde 403 sin data ni meta', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get('/api/v1/pii/access-logs')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.code, 'SEC.AUD.FORB.001')
    assert.equal(body.key, 'consulta-bitacora-denegada')
    assert.isNull(body.data)
    assert.notProperty(body, 'meta')
  })

  test('F.9 — sin el permiso, un rango de fechas invertido también da 403, no 422', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get('/api/v1/pii/access-logs?dateFrom=2026-12-01&dateTo=2026-01-01')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(403)
    assert.equal(response.body().code, 'SEC.AUD.FORB.001')
  })

  test('F.10 — con el permiso, el mismo rango invertido sigue dando 422 del validador', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const response = await client
      .get('/api/v1/pii/access-logs?dateFrom=2026-12-01&dateTo=2026-01-01')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(422)
    assert.equal(response.body().code, 'SEC.AUD.VAL.DATE.001')
  })

  test('F.11 — con el permiso, la bitácora solo muestra filas de la propia empresa', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const otherActor = await createActor('pii-audit-gate-other-bu')
    try {
      const service = new PiiAccessLogService()
      await service.record({
        businessUnitId: actor!.businessUnit.businessUnitId,
        accessorUserId: actor!.user.userId,
        model: 'Person',
        modelColumn: 'personCurp',
        recordId: actor!.person.personId,
        accessorIp: '127.0.0.1',
      })
      await service.record({
        businessUnitId: otherActor.businessUnit.businessUnitId,
        accessorUserId: otherActor.user.userId,
        model: 'Person',
        modelColumn: 'personCurp',
        recordId: otherActor.person.personId,
        accessorIp: '127.0.0.1',
      })

      const response = await client
        .get('/api/v1/pii/access-logs')
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
      const payload = response.body().data
      assert.properties(payload, ['data', 'meta'])
      const rows = payload.data
      assert.isArray(rows)
      for (const row of rows) {
        assert.notEqual(row.businessUnitId, otherActor.businessUnit.businessUnitId)
      }
    } finally {
      await cleanupRevealLogs({ userId: otherActor.user.userId })
      await cleanupRevealLogs({ businessUnitId: otherActor.businessUnit.businessUnitId })
      await cleanupActor(otherActor)
    }
  })

  test('F.12 — root y owner leen la bitácora sin el permiso concedido (bypass standard)', async ({ client }) => {
    for (const roleSlug of ['owner', 'root'] as const) {
      const bypassActor = await createSystemActor(
        roleSlug,
        `pii-audit-gate-${roleSlug}`,
        actor!.businessUnit.businessUnitId
      )
      try {
        const response = await client
          .get('/api/v1/pii/access-logs')
          .loginAs(bypassActor.user)
          .header('X-Business-Unit-Id', buHeader(actor!))
        response.assertStatus(200)
      } finally {
        await cleanupRevealLogs({ userId: bypassActor.user.userId })
        await cleanupSystemActor(bypassActor)
      }
    }
  })
})

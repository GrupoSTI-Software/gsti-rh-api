/**
 * Un puesto pertenece a un solo departamento vigente de su empresa
 * (VLRH-H1792122315616, CA-1 a CA-10).
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import DepartmentPositionService from '#services/department_position_service'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
  linkDepartmentPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import { lockHolderOf, waitForLockWaitOn } from '#tests/helpers/lock_wait'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

async function liveLinks(positionId: number) {
  return db
    .from('department_position')
    .where('position_id', positionId)
    .whereNull('department_position_deleted_at')
}

test.group('department_position — un solo departamento (VLRH-H1792122315616)', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('root', 'dp-single-a')
    actorB = await createBypassActor('root', 'dp-single-b')
  })

  group.teardown(async () => {
    const buA = required(actor, 'actor').businessUnit.businessUnitId
    const buB = required(actorB, 'actorB').businessUnit.businessUnitId
    const positions: { position_id: number }[] = await db
      .from('positions')
      .whereIn('business_unit_id', [buA, buB])
      .select('position_id')
    const positionIds = positions.map((row) => row.position_id)
    if (positionIds.length > 0) {
      await db.from('department_position').whereIn('position_id', positionIds).delete()
    }
    await cleanupOrgChartFixtures(buA)
    await cleanupOrgChartFixtures(buB)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(actorB)
  })

  test('CA-1 — un puesto libre queda ligado solo a su departamento', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'logistica')
    const position = await createPositionFixture(buId, 'auxiliar')

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    const links = await liveLinks(position.positionId)
    assert.lengthOf(links, 1)
    assert.equal(Number(links[0].department_id), department.departmentId)
    assert.equal(Number(links[0].business_unit_id), buId)
  })

  test('CA-2 — un segundo departamento se rechaza y nombra al que ya tiene', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const production = await createDepartmentFixture(buId, 'produccion')
    const quality = await createDepartmentFixture(buId, 'calidad')
    const position = await createPositionFixture(buId, 'supervisor')
    await linkDepartmentPositionFixture(production.departmentId, position.positionId, buId)

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: quality.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body().key, 'puesto-ligado-a-otro-departamento')
    assert.equal(res.body().type, 'warning')
    assert.include(res.body().message, position.positionName)
    assert.include(res.body().message, production.departmentName)
    assert.equal(res.body().data.departmentId, quality.departmentId)
    assert.equal(res.body().data.positionId, position.positionId)
    const links = await liveLinks(position.positionId)
    assert.lengthOf(links, 1)
    assert.equal(Number(links[0].department_id), production.departmentId)
  })

  test('CA-3 — el mismo par sigue en 400 y no crea otra fila', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'mismo-par')
    const position = await createPositionFixture(buId, 'mismo-par')
    await linkDepartmentPositionFixture(department.departmentId, position.positionId, buId)

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 400, JSON.stringify(res.body()))
    assert.isUndefined(res.body().key)
    assert.lengthOf(await liveLinks(position.positionId), 1)
  })

  test('CA-4 — cambiar el departamento reemplaza el mismo vínculo', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const finance = await createDepartmentFixture(buId, 'finanzas')
    const control = await createDepartmentFixture(buId, 'contraloria')
    const position = await createPositionFixture(buId, 'analista')
    const linkId = await linkDepartmentPositionFixture(finance.departmentId, position.positionId, buId)

    const res = await client
      .put(`/api/departments-positions/${linkId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: control.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body().data.departmentPosition.departmentPositionId, linkId)
    const links = await liveLinks(position.positionId)
    assert.lengthOf(links, 1)
    assert.equal(Number(links[0].department_position_id), linkId)
    assert.equal(Number(links[0].department_id), control.departmentId)
  })

  test('CA-5 — sustituir por un puesto ya ligado se rechaza y el vínculo queda igual', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'origen')
    const other = await createDepartmentFixture(buId, 'ocupado')
    const current = await createPositionFixture(buId, 'puesto-actual')
    const taken = await createPositionFixture(buId, 'puesto-ocupado')
    const linkId = await linkDepartmentPositionFixture(department.departmentId, current.positionId, buId)
    await linkDepartmentPositionFixture(other.departmentId, taken.positionId, buId)

    const res = await client
      .put(`/api/departments-positions/${linkId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId, positionId: taken.positionId })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body().key, 'puesto-ligado-a-otro-departamento')
    assert.include(res.body().message, taken.positionName)
    assert.include(res.body().message, other.departmentName)
    const row = await db.from('department_position').where('department_position_id', linkId).first()
    assert.equal(Number(row.department_id), department.departmentId)
    assert.equal(Number(row.position_id), current.positionId)
  })

  test('CA-6 — al cambiar el puesto el vínculo queda en la empresa del puesto nuevo', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'depto-ca6')
    const current = await createPositionFixture(buId, 'puesto-ca6-a')
    const next = await createPositionFixture(buId, 'puesto-ca6-b')
    const linkId = await linkDepartmentPositionFixture(department.departmentId, current.positionId, buId)

    const res = await client
      .put(`/api/departments-positions/${linkId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId, positionId: next.positionId })

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    const row = await db.from('department_position').where('department_position_id', linkId).first()
    assert.equal(Number(row.position_id), next.positionId)
    assert.equal(Number(row.business_unit_id), next.businessUnitId)
  })

  test('CA-7 — un departamento de otra empresa no se liga', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const b = required(actorB, 'actorB')
    const position = await createPositionFixture(a.businessUnit.businessUnitId, 'puesto-ca7')
    const foreign = await createDepartmentFixture(b.businessUnit.businessUnitId, 'depto-ajeno')

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: foreign.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 400, JSON.stringify(res.body()))
    assert.notInclude(JSON.stringify(res.body()), foreign.departmentName)
    assert.lengthOf(await liveLinks(position.positionId), 0)

    const service = new DepartmentPositionService(i18nManager.locale(i18nManager.defaultLocale))
    const trx = await db.transaction()
    try {
      const check = await service.verifySingleDepartmentLink(
        { positionId: position.positionId, departmentId: foreign.departmentId },
        trx
      )
      assert.deepEqual(check, { ok: false, reason: 'business-unit-mismatch' })
    } finally {
      await trx.rollback()
    }
  })

  test('CA-8 — un vínculo de otra empresa bloquea con mensaje genérico', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const b = required(actorB, 'actorB')
    const buA = a.businessUnit.businessUnitId
    const buB = b.businessUnit.businessUnitId
    const position = await createPositionFixture(buA, 'puesto-ca8')
    const own = await createDepartmentFixture(buA, 'depto-propio')
    const foreign = await createDepartmentFixture(buB, 'depto-heredado')
    await linkDepartmentPositionFixture(foreign.departmentId, position.positionId, buB)

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: own.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body().key, 'puesto-ligado-a-otro-departamento')
    assert.include(res.body().message, position.positionName)
    assert.notInclude(res.body().message, foreign.departmentName)
    const serialized = JSON.stringify(res.body())
    assert.notInclude(serialized, foreign.departmentName)
    assert.notInclude(serialized, `"departmentId":${foreign.departmentId}`)
    assert.notInclude(serialized, `"department_id":${foreign.departmentId}`)
    assert.lengthOf(await liveLinks(position.positionId), 1)
  })

  test('CA-9 — un vínculo retirado no impide ligar otro departamento', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const retired = await createDepartmentFixture(buId, 'retirado')
    const next = await createDepartmentFixture(buId, 'nuevo')
    const position = await createPositionFixture(buId, 'puesto-ca9')
    const linkId = await linkDepartmentPositionFixture(retired.departmentId, position.positionId, buId)
    await db
      .from('department_position')
      .where('department_position_id', linkId)
      .update({ department_position_deleted_at: new Date() })

    const res = await client
      .post('/api/departments-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: next.departmentId, positionId: position.positionId })

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    const links = await liveLinks(position.positionId)
    assert.lengthOf(links, 1)
    assert.equal(Number(links[0].department_id), next.departmentId)
  })

  test('CA-10 — dos ligas simultáneas dejan un solo vínculo vigente', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const first = await createDepartmentFixture(buId, 'carrera-1')
    const second = await createDepartmentFixture(buId, 'carrera-2')
    const position = await createPositionFixture(buId, 'puesto-carrera')

    const holderTrx = await db.transaction()
    let pending: Promise<{ status: number; body: { key?: string } }> | null = null
    try {
      const holder = await lockHolderOf(holderTrx)
      await holderTrx.from('positions').where('position_id', position.positionId).forUpdate().first()
      await holderTrx.table('department_position').insert({
        department_id: first.departmentId,
        position_id: position.positionId,
        business_unit_id: buId,
        department_position_created_at: new Date(),
        department_position_updated_at: new Date(),
      })

      pending = Promise.resolve(
        client
          .post('/api/departments-positions')
          .loginAs(a.user)
          .headers(businessUnitHeaders(a))
          .json({ departmentId: second.departmentId, positionId: position.positionId })
      ).then(
        (res) => ({ status: res.status(), body: res.body() as { key?: string } }),
        (error: unknown) => ({ status: 500, body: { key: undefined, error: String(error) } })
      )

      await waitForLockWaitOn(holder, 'positions', pending)
      await holderTrx.commit()
      const outcome = await pending
      assert.equal(outcome.status, 422, JSON.stringify(outcome.body))
      assert.equal(outcome.body.key, 'puesto-ligado-a-otro-departamento')
      const links = await liveLinks(position.positionId)
      assert.lengthOf(links, 1)
      assert.equal(Number(links[0].department_id), first.departmentId)
    } finally {
      if (!holderTrx.isCompleted) await holderTrx.rollback()
      if (pending) await pending
    }
  })
})

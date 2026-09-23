import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Shift from '#models/shift'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1783821206521 — un usuario de la unidad A no debe poder ver ni borrar
 * un turno de la unidad B por acceso directo.
 *
 * Antes tomaba usuarios, unidades y turnos de una BD de desarrollo (sae/cima,
 * ids fijos) y en una BD limpia fallaba en el setup. Ahora cada unidad y su
 * usuario nacen aquí con un rol propio. Con la exigencia de `shifts` encendida
 * el gate corre antes que el controller: los casos de escritura siembran la
 * concesión justa para que el 404 que se prueba venga del aislamiento y no de
 * un 403 del permiso.
 */

async function createShiftFixture(actor: TenantActor, prefix: string): Promise<Shift> {
  return Shift.create({
    shiftName: uniqueTestName(prefix),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 1,
    businessUnitId: actor.businessUnit.businessUnitId,
    shiftTemp: 0,
  })
}

test.group('Shift — aislamiento por tenant', (group) => {
  let tenantA: TenantActor | null = null
  let tenantB: TenantActor | null = null
  let shiftA: Shift | null = null
  let shiftB: Shift | null = null

  group.setup(async () => {
    await assertModuleEnforced('shifts')
    tenantA = await createTenantActor('turnos-aislamiento-a')
    tenantB = await createTenantActor('turnos-aislamiento-b')
    shiftA = await createShiftFixture(tenantA, 'Turno unidad A')
    shiftB = await createShiftFixture(tenantB, 'Turno unidad B')
  })

  group.teardown(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (tenant) {
        await db.from('shifts').where('business_unit_id', tenant.businessUnit.businessUnitId).delete()
      }
      await cleanupTenantActor(tenant)
    }
  })

  test('usuario de A puede ver un turno propio de A', async ({ client, assert }) => {
    const tenant = required(tenantA, 'la unidad A')
    const ownShift = required(shiftA, 'el turno de A')

    const response = await client
      .get(`/api/shift/${ownShift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    assert.equal(response.body().data.shiftId, ownShift.shiftId)
  })

  test('usuario de A recibe 404 uniforme al pedir un turno de B por id directo', async ({
    client,
  }) => {
    const tenant = required(tenantA, 'la unidad A')
    const foreignShift = required(shiftB, 'el turno de B')

    const response = await client
      .get(`/api/shift/${foreignShift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })
  })

  test('usuario de B recibe 404 uniforme al pedir un turno de A por id directo', async ({
    client,
  }) => {
    const tenant = required(tenantB, 'la unidad B')
    const foreignShift = required(shiftA, 'el turno de A')

    const response = await client
      .get(`/api/shift/${foreignShift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })
  })

  test('DELETE de un turno ajeno con shifts:delete responde 404 y NO lo borra', async ({
    client,
    assert,
  }) => {
    const tenant = required(tenantA, 'la unidad A')
    const foreignShift = required(shiftB, 'el turno de B')
    await grantModulePermissions(tenant, 'shifts', ['delete'])

    const response = await client
      .delete(`/api/shift/${foreignShift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'turno-no-encontrado', code: 'SFT.NF.001' })

    const stillAlive = await Shift.query()
      .where('shiftId', foreignShift.shiftId)
      .whereNull('shiftDeletedAt')
      .first()
    assert.isNotNull(stillAlive, 'el turno ajeno no debió borrarse')
  })

  test('index (listado) solo devuelve turnos de la unidad seleccionada', async ({
    client,
    assert,
  }) => {
    const tenant = required(tenantB, 'la unidad B')
    const ownShift = required(shiftB, 'el turno de B')
    const foreignShift = required(shiftA, 'el turno de A')

    const response = await client
      .get('/api/shift')
      .qs({ limit: 500 })
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    const ids = (response.body().data.data as { shiftId: number }[]).map((shift) => shift.shiftId)
    assert.include(ids, ownShift.shiftId)
    assert.notInclude(ids, foreignShift.shiftId, 'el listado de B no debe incluir turnos de A')
  })

  test('store (creación) con shifts:create estampa businessUnitId con la unidad seleccionada', async ({
    client,
    assert,
  }) => {
    const tenant = required(tenantB, 'la unidad B')
    await grantModulePermissions(tenant, 'shifts', ['create'])

    const response = await client
      .post('/api/shift')
      .json({
        shiftName: uniqueTestName('TEST-STORE'),
        shiftTimeStart: '09:00',
        shiftActiveHours: 8,
        shiftRestDays: '0',
        shiftAccumulatedFault: 1,
        shiftTemp: 0,
        shiftCalculateFlag: '',
      })
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(201)
    const row = await Shift.query().where('shiftId', response.body().data.shiftId).firstOrFail()
    assert.equal(row.businessUnitId, tenant.businessUnit.businessUnitId)
  })
})

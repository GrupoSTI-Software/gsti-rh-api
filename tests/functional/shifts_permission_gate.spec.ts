import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Shift from '#models/shift'
import {
  assertModuleEnforced,
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Turnos con la exigencia encendida: alta, edición, baja y las dos consultas
 * sin consumidor (`shift-department-position`, `shift-for-employees`) piden su
 * permiso de `shifts`. Listado y detalle quedan abiertos porque los consumen
 * Empleados y REPSE.
 */

const MODULE = 'shifts'

const shiftPayload = (name: string) => ({
  shiftName: name,
  shiftTimeStart: '09:00',
  shiftActiveHours: 8,
  shiftRestDays: '0',
  shiftAccumulatedFault: 1,
  shiftTemp: 0,
  shiftCalculateFlag: '',
})

const SHIFTS_FOR_EMPLOYEES_PAYLOAD = { startDate: '2026-01-01', endDate: '2026-01-31' }

async function createShiftFixture(actor: TenantActor, prefix: string): Promise<Shift> {
  return Shift.create({
    shiftName: uniqueTestName(prefix),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 1,
    shiftBusinessUnits: actor.businessUnit.businessUnitSlug,
    businessUnitId: actor.businessUnit.businessUnitId,
    shiftTemp: 0,
  })
}

const findAliveShift = (shiftId: number) =>
  Shift.query().where('shiftId', shiftId).whereNull('shiftDeletedAt').first()

test.group('Turnos — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('turnos-gate')
    owner = await createBypassActor('owner', 'turnos-owner')
  })

  group.teardown(async () => {
    for (const current of [actor, owner]) {
      if (current) {
        await db.from('shifts').where('business_unit_id', current.businessUnit.businessUnitId).delete()
      }
      await cleanupTenantActor(current)
    }
  })

  test('sin concesiones: escrituras y consultas protegidas responden PERM.DENIED y no tocan el turno', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const shift = await createShiftFixture(tenant, 'Turno sin permiso')
    const deniedName = uniqueTestName('Alta negada')

    const store = await client
      .post('/api/shift')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(deniedName))
    assertPermissionDenied(assert, store)
    assert.isNull(await Shift.query().where('shiftName', deniedName).first())

    const update = await client
      .put(`/api/shift/${shift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(uniqueTestName('Edición negada')))
    assertPermissionDenied(assert, update)

    const destroy = await client
      .delete(`/api/shift/${shift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, destroy)

    const byPositionDepartment = await client
      .get('/api/shift-department-position')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, byPositionDepartment)

    const forEmployees = await client
      .post('/api/shift-for-employees')
      .loginAs(tenant.user)
      .json(SHIFTS_FOR_EMPLOYEES_PAYLOAD)
    assertPermissionDenied(assert, forEmployees)

    const after = await findAliveShift(shift.shiftId)
    assert.equal(after?.shiftName, shift.shiftName)
  })

  test('sin concesiones: listado y detalle siguen abiertos porque los consumen Empleados y REPSE', async ({
    client,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const shift = await createShiftFixture(tenant, 'Turno catálogo')

    const index = await client
      .get('/api/shift')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    index.assertStatus(200)

    const show = await client
      .get(`/api/shift/${shift.shiftId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    show.assertStatus(200)
  })

  test('cada permiso abre solo su operación: create 201, update 200, read consulta y delete 200', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const name = uniqueTestName('Alta con permiso')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const store = await client
      .post('/api/shift')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(name))
    store.assertStatus(201)
    const createdId: number = store.body().data.shiftId
    const updateWithCreateOnly = await client
      .put(`/api/shift/${createdId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(name))
    assertPermissionDenied(assert, updateWithCreateOnly)

    await grantModulePermissions(tenant, MODULE, ['update'])
    const renamed = uniqueTestName('Edición con permiso')
    const update = await client
      .put(`/api/shift/${createdId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(renamed))
    update.assertStatus(200)
    const updated = await findAliveShift(createdId)
    assert.equal(updated?.shiftName, renamed)
    const destroyWithUpdateOnly = await client
      .delete(`/api/shift/${createdId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, destroyWithUpdateOnly)

    await grantModulePermissions(tenant, MODULE, ['read'])
    const byPositionDepartment = await client
      .get('/api/shift-department-position')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    byPositionDepartment.assertStatus(200)
    const forEmployees = await client
      .post('/api/shift-for-employees')
      .loginAs(tenant.user)
      .json(SHIFTS_FOR_EMPLOYEES_PAYLOAD)
    // Sin asignaciones en el rango el servicio responde 400: basta con cruzar el gate.
    assertPassesGate(assert, forEmployees)
    const storeWithReadOnly = await client
      .post('/api/shift')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(shiftPayload(uniqueTestName('Alta solo lectura')))
    assertPermissionDenied(assert, storeWithReadOnly)

    await grantModulePermissions(tenant, MODULE, ['delete'])
    const destroy = await client
      .delete(`/api/shift/${createdId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    destroy.assertStatus(200)
    assert.isNull(await findAliveShift(createdId))
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client }) => {
    const account = required(owner, 'el owner')

    const response = await client
      .post('/api/shift')
      .loginAs(account.user)
      .headers(businessUnitHeaders(account))
      .json(shiftPayload(uniqueTestName('Alta owner')))

    response.assertStatus(201)
  })
})

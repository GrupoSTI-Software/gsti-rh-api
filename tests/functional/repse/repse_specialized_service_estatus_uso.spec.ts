import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupContratoImportFixture,
  createContratoImportFixture,
  createContratoInTenant,
  uniqueStamp,
  type ContratoImportTestFixture,
} from '../helpers/contrato_import_excel_fixture.js'

/**
 * Servicios especializados: estatus `inactive`, filtro `status` y
 * `contratosCount` en el listado (contratos no borrados que cubren el servicio).
 */

const BASE = '/api/repse-specialized-services'

type ListItem = { repseSpecializedServiceId: number; status: string; contratosCount: number }

let actor: TenantActor | null = null
let fixture: ContratoImportTestFixture | null = null
let borradoId: number | null = null

/** Soft delete por SQL: el scope de `SoftDeletes` no lo vería después para limpiarlo. */
async function softDeleteContrato(contratoId: number) {
  await db
    .from('contratos_servicios_especializados')
    .where('contrato_servicio_especializado_id', contratoId)
    .update({ contrato_servicio_especializado_deleted_at: DateTime.now().toSQL({ includeOffset: false }) })
}

/** Borrado físico del contrato soft-deleted, que la limpieza del fixture no alcanza. */
async function hardDeleteContrato(contratoId: number | null) {
  if (!contratoId) return
  await db.from('contrato_servicio_repse').where('contrato_servicio_especializado_id', contratoId).delete()
  await db.from('clausulas_15d').where('contrato_servicio_especializado_id', contratoId).delete()
  await db
    .from('contratos_servicios_especializados')
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
}

test.group('REPSE — servicios especializados con estatus y uso', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'repse-servicios-uso')
    fixture = await createContratoImportFixture(actor.businessUnit)

    // Dos contratos cubren el servicio A; uno está borrado y no debe contar.
    await createContratoInTenant({ fixture, numeroContrato: `CSE-USO-${uniqueStamp()}` })
    borradoId = await createContratoInTenant({
      fixture,
      numeroContrato: `CSE-USO-DEL-${uniqueStamp()}`,
    })
    await softDeleteContrato(borradoId)
  })

  group.teardown(async () => {
    await hardDeleteContrato(borradoId)
    borradoId = null
    await cleanupContratoImportFixture(fixture)
    await cleanupTenantActor(actor)
    fixture = null
    actor = null
  })

  test('el listado agrega contratosCount sin contar contratos borrados', async ({
    client,
    assert,
  }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const response = await client
      .get(BASE)
      .qs({ page: 1, limit: 50, repseRegistrationId: data.repseRegistration.repseRegistrationId })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    response.assertStatus(200)
    const rows: ListItem[] = response.body().data.repseSpecializedServices.data
    const servicioA = rows.find(
      (row) => row.repseSpecializedServiceId === data.servicioA.repseSpecializedServiceId
    )
    const servicioB = rows.find(
      (row) => row.repseSpecializedServiceId === data.servicioB.repseSpecializedServiceId
    )
    assert.equal(servicioA?.contratosCount, 1)
    assert.equal(servicioB?.contratosCount, 0)
  })

  test('update acepta status inactive y el filtro status lo respeta', async ({
    client,
    assert,
  }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const updated = await client
      .put(`${BASE}/${data.servicioB.repseSpecializedServiceId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({ status: 'inactive' })

    updated.assertStatus(200)
    assert.equal(updated.body().data.repseSpecializedService.status, 'inactive')

    const inactivos = await client
      .get(BASE)
      .qs({
        page: 1,
        limit: 50,
        repseRegistrationId: data.repseRegistration.repseRegistrationId,
        status: 'inactive',
      })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    inactivos.assertStatus(200)
    const rows: ListItem[] = inactivos.body().data.repseSpecializedServices.data
    assert.deepEqual(
      rows.map((row) => row.repseSpecializedServiceId),
      [data.servicioB.repseSpecializedServiceId]
    )

    const invalido = await client
      .get(BASE)
      .qs({
        page: 1,
        limit: 50,
        repseRegistrationId: data.repseRegistration.repseRegistrationId,
        status: 'suspendido',
      })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    invalido.assertStatus(400)
  })
})

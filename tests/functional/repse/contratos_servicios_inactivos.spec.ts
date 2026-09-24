import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { RepseSpecializedServiceStatus } from '#models/repse_specialized_service'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  buildContratoCreatePayload,
  cleanupRepseSensitiveMaskFixture,
  createRepseSensitiveMaskFixture,
  type RepseSensitiveMaskFixture,
} from './repse_contratos_asignaciones_sensitive_mask_support.js'
import { uniqueStamp } from '../helpers/contrato_import_excel_fixture.js'

/**
 * Un servicio especializado `inactive` no se puede ligar a un contrato nuevo
 * ni agregarse a uno existente (422 `servicio-registrado-inactivo`); si ya
 * estaba ligado, el contrato lo conserva al editarse.
 */

const BASE = '/api/contratos-servicios-especializados'

let actor: TenantActor | null = null
let fixture: RepseSensitiveMaskFixture | null = null

async function setServicioStatus(servicioId: number, status: RepseSpecializedServiceStatus) {
  await db
    .from('repse_specialized_services')
    .where('repse_specialized_service_id', servicioId)
    .update({ repse_specialized_service_status: status })
}

test.group('REPSE — contratos con servicios especializados inactivos', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'repse-servicio-inactivo')
    // El contrato del fixture ya liga el servicio A (activo al ligarse).
    fixture = await createRepseSensitiveMaskFixture(actor.businessUnit, 'inactivo')
    await setServicioStatus(fixture.servicioA.repseSpecializedServiceId, 'inactive')
    await setServicioStatus(fixture.servicioB.repseSpecializedServiceId, 'inactive')
  })

  group.teardown(async () => {
    await cleanupRepseSensitiveMaskFixture(fixture)
    await cleanupTenantActor(actor)
    fixture = null
    actor = null
  })

  test('crear un contrato con un servicio inactivo responde 422', async ({ client }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')

    const response = await client
      .post(BASE)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json(buildContratoCreatePayload(data, `CSE-INACTIVO-${uniqueStamp()}`))

    response.assertStatus(422)
    response.assertBodyContains({
      key: 'servicio-registrado-inactivo',
      errorCode: 'CSE.VAL.SERVICIO.INACTIVO.001',
    })
  })

  test('editar conserva el inactivo ya ligado y rechaza agregar otro inactivo', async ({
    client,
    assert,
  }) => {
    const owner = required(actor, 'actor')
    const data = required(fixture, 'fixture')
    const servicioA = data.servicioA.repseSpecializedServiceId
    const servicioB = data.servicioB.repseSpecializedServiceId

    const conserva = await client
      .patch(`${BASE}/${data.contratoId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({ serviciosRegistradosIds: [servicioA] })

    conserva.assertStatus(200)
    const servicios = Object.values(conserva.body().data)[0] as {
      serviciosRegistrados: Array<{ id: number }>
    }
    assert.deepEqual(
      servicios.serviciosRegistrados.map((servicio) => servicio.id),
      [servicioA]
    )

    const agrega = await client
      .patch(`${BASE}/${data.contratoId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({ serviciosRegistradosIds: [servicioA, servicioB] })

    agrega.assertStatus(422)
    agrega.assertBodyContains({ key: 'servicio-registrado-inactivo' })
  })
})

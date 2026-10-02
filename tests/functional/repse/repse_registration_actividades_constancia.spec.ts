import { test } from '@japa/runner'
import RepseRegistration from '#models/repse_registration'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Registro REPSE: actividades registradas ante la STPS y constancia (PDF).
 *
 * La subida real de la constancia necesita el bucket de S3; aquí se cubre el
 * contrato que no depende de él: `activities` en alta/edición/listado,
 * `constancia: null` sin archivo, 404 al descargar sin constancia y 422 al
 * subir sin archivo.
 */

const BASE = '/api/repse-registrations'

let actor: TenantActor | null = null

function folioUnico(): string {
  return `TEST-ACT-${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

test.group('REPSE — registro con actividades y constancia', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'repse-actividades')
  })

  group.teardown(async () => {
    if (actor) {
      await RepseRegistration.query()
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .delete()
    }
    await cleanupTenantActor(actor)
    actor = null
  })

  test('alta, edición y listado exponen activities y constancia null', async ({
    client,
    assert,
  }) => {
    const owner = required(actor, 'actor')

    const created = await client
      .post(BASE)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({
        businessUnitId: owner.businessUnit.businessUnitId,
        folio: folioUnico(),
        registeredAt: '2026-01-10',
        expiresAt: '2029-01-10',
        activities: '  Seguridad privada, limpieza y desarrollo de software  ',
      })

    created.assertStatus(201)
    const registro = created.body().data.repseRegistration
    assert.equal(registro.activities, 'Seguridad privada, limpieza y desarrollo de software')
    assert.isNull(registro.constancia)

    const updated = await client
      .put(`${BASE}/${registro.repseRegistrationId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({ activities: '' })

    updated.assertStatus(200)
    assert.isNull(updated.body().data.repseRegistration.activities)

    await client
      .put(`${BASE}/${registro.repseRegistrationId}`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .json({ activities: 'Limpieza' })

    const list = await client
      .get(BASE)
      .qs({ page: 1, limit: 20, businessUnitId: owner.businessUnit.businessUnitId })
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    list.assertStatus(200)
    const fila = list
      .body()
      .data.repseRegistrations.data.find(
        (row: { repseRegistrationId: number }) =>
          row.repseRegistrationId === registro.repseRegistrationId
      )
    assert.exists(fila)
    assert.equal(fila.activities, 'Limpieza')
    assert.isNull(fila.constancia)
  })

  test('descargar la constancia de un registro sin archivo responde 404', async ({ client }) => {
    const owner = required(actor, 'actor')
    const registro = await RepseRegistration.query()
      .where('business_unit_id', owner.businessUnit.businessUnitId)
      .firstOrFail()

    const response = await client
      .get(`${BASE}/${registro.repseRegistrationId}/constancia`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'constancia-no-encontrada' })
  })

  test('subir la constancia sin archivo responde 422 archivo-faltante', async ({ client }) => {
    const owner = required(actor, 'actor')
    const registro = await RepseRegistration.query()
      .where('business_unit_id', owner.businessUnit.businessUnitId)
      .firstOrFail()

    const response = await client
      .post(`${BASE}/${registro.repseRegistrationId}/constancia`)
      .loginAs(owner.user)
      .headers(businessUnitHeaders(owner))
      .fields({ nada: '1' })

    response.assertStatus(422)
    response.assertBodyContains({ key: 'archivo-faltante' })
  })
})

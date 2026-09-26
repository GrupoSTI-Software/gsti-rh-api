import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import MedicalConditionType from '#models/medical_condition_type'
import { TenantContext } from '#utils/tenant_context'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1784259058487 (ampliación) — tipos de condición médica privados por
 * empresa.
 *
 * Antes dependía de datos de desarrollo (sae id 1, cima id 6 y dos usuarios por
 * correo) y fallaba en el setup de una BD recién sembrada. Desde que el
 * catálogo exige las casillas de la pestaña Condición médica, cada empresa usa
 * un actor explícito con `tab-condicion-medica-read` y `-delete`: sin ellas la
 * petición respondería 403 antes de llegar al aislamiento que el caso prueba.
 */

const MODULE = 'employees'
const GRANTS = ['tab-condicion-medica-read', 'tab-condicion-medica-delete'] as const

async function createTypeFor(actor: TenantActor, label: string): Promise<MedicalConditionType> {
  return TenantContext.run([actor.businessUnit.businessUnitId], async () => {
    const type = new MedicalConditionType()
    type.medicalConditionTypeName = uniqueTestName(`TEST-MCT-${label}`).slice(0, 100)
    type.medicalConditionTypeDescription = 'fixture aislamiento'
    type.medicalConditionTypeActive = 1
    await type.save()
    return type
  })
}

test.group('Tipos médicos — aislamiento por tenant', (group) => {
  let previousEnforcement = true
  let companyA: TenantActor | null = null
  let companyB: TenantActor | null = null
  let typeAId = 0
  let typeBId = 0

  group.setup(async () => {
    // Otros specs de Empleados apagan la exigencia y no la restauran.
    previousEnforcement = await setModuleEnforcement(MODULE, true)
    companyA = await createTenantActor('mct-aislamiento-a')
    companyB = await createTenantActor('mct-aislamiento-b')
    await grantModulePermissions(companyA, MODULE, GRANTS)
    await grantModulePermissions(companyB, MODULE, GRANTS)
    const typeA = await createTypeFor(companyA, 'A')
    const typeB = await createTypeFor(companyB, 'B')
    typeAId = typeA.medicalConditionTypeId
    typeBId = typeB.medicalConditionTypeId
  })

  group.teardown(async () => {
    const typeIds = [typeAId, typeBId].filter((id) => id > 0)
    if (typeIds.length > 0) {
      await db.from('medical_condition_types').whereIn('medical_condition_type_id', typeIds).delete()
    }
    await cleanupTenantActor(companyA)
    await cleanupTenantActor(companyB)
    await setModuleEnforcement(MODULE, previousEnforcement)
  })

  test('alta nueva hereda business_unit_id de la unidad activa', async ({ assert }) => {
    const owner = required(companyB, 'la empresa B')
    const row = await TenantContext.runUnscoped(
      () => MedicalConditionType.query().where('medicalConditionTypeId', typeBId).firstOrFail(),
      'lectura fixture'
    )
    assert.equal(row.businessUnitId, owner.businessUnit.businessUnitId)
  })

  test('usuario de A ve sus tipos y no ve el de B', async ({ client, assert }) => {
    const actor = required(companyA, 'la empresa A')

    const response = await client
      .get('/api/medical-condition-types')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(200)
    const rows: { medicalConditionTypeId: number }[] = response.body().data ?? []
    const ids = rows.map((row) => row.medicalConditionTypeId)
    assert.include(ids, typeAId)
    assert.notInclude(ids, typeBId)
  })

  test('usuario de B recibe 404 al pedir el tipo de A por id directo', async ({ client }) => {
    const actor = required(companyB, 'la empresa B')

    const response = await client
      .get(`/api/medical-condition-types/${typeAId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'MCT.NF.001' })
  })

  test('usuario de B sí ve su tipo propio', async ({ client, assert }) => {
    const actor = required(companyB, 'la empresa B')

    const response = await client
      .get(`/api/medical-condition-types/${typeBId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(200)
    assert.equal(response.body().data.showMedicalConditionType.medicalConditionTypeId, typeBId)
  })

  test('DELETE de tipo ajeno responde 404 y no lo borra', async ({ client, assert }) => {
    const actor = required(companyA, 'la empresa A')

    const response = await client
      .delete(`/api/medical-condition-types/${typeBId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'MCT.NF.001' })

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        MedicalConditionType.query()
          .where('medicalConditionTypeId', typeBId)
          .whereNull('medical_condition_type_deleted_at')
          .first(),
      'verificación post-delete'
    )
    assert.isNotNull(stillAlive)
  })
})

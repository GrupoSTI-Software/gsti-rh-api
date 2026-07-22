import { test } from '@japa/runner'
import User from '#models/user'
import MedicalConditionType from '#models/medical_condition_type'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058487 (ampliación) — tipos de condición médica privados por BU.
 * En BD real: tipos 1 y 2 pertenecen a BU1 tras el backfill.
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0' // sae
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef' // cima

const BU1_TYPE_ID = 1 // Tipo Sangre — business_unit_id = 1

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Tipos médicos — aislamiento por tenant (BD real)', (group) => {
  let tempBu6TypeId: number

  group.setup(async () => {
    const created = await TenantContext.run([6], async () => {
      const type = new MedicalConditionType()
      type.medicalConditionTypeName = `TEST-MCT-BU6-${Date.now()}`
      type.medicalConditionTypeDescription = 'fixture aislamiento'
      type.medicalConditionTypeActive = 1
      await type.save()
      return type
    })
    tempBu6TypeId = created.medicalConditionTypeId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (tempBu6TypeId) {
        await MedicalConditionType.query().where('medicalConditionTypeId', tempBu6TypeId).delete()
      }
    }, 'limpieza test tipos médicos')
  })

  test('alta nueva hereda business_unit_id de la unidad activa', async ({ assert }) => {
    const row = await TenantContext.runUnscoped(
      () => MedicalConditionType.query().where('medicalConditionTypeId', tempBu6TypeId).firstOrFail(),
      'lectura fixture'
    )
    assert.equal(row.businessUnitId, 6)
  })

  test('usuario BU1 ve sus tipos y no ve el de BU6', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get('/api/medical-condition-types')
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
    const rows = response.body().data ?? []
    const ids = rows.map((r: { medicalConditionTypeId: number }) => r.medicalConditionTypeId)
    assert.include(ids, BU1_TYPE_ID)
    assert.notInclude(ids, tempBu6TypeId)
  })

  test('usuario BU6 recibe 404 al pedir tipo de BU1 por id directo', async ({ client }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/medical-condition-types/${BU1_TYPE_ID}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'MCT.NF.001' })
  })

  test('usuario BU6 sí ve su tipo propio', async ({ client, assert }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/medical-condition-types/${tempBu6TypeId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
    assert.equal(
      response.body().data.showMedicalConditionType.medicalConditionTypeId,
      tempBu6TypeId
    )
  })

  test('DELETE de tipo ajeno responde 404 y no lo borra', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .delete(`/api/medical-condition-types/${tempBu6TypeId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'MCT.NF.001' })

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        MedicalConditionType.query()
          .where('medicalConditionTypeId', tempBu6TypeId)
          .whereNull('medical_condition_type_deleted_at')
          .first(),
      'verificación post-delete'
    )
    assert.isNotNull(stillAlive)
  })
})

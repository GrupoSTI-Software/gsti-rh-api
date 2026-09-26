import { test } from '@japa/runner'
import { cuid } from '@adonisjs/core/helpers'
import User from '#models/user'
import WorkDisability from '#models/work_disability'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058487 — verificación end-to-end contra BD real: una incapacidad
 * de un empleado de la unidad B no debe ser visible ni mutable para un usuario
 * de la unidad A por acceso directo a su número.
 *
 * BU1 (sae) — empleado 678.
 * BU6 (cima) — empleado 12.
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0' // sae
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef' // cima

const BU1_EMPLOYEE_ID = 678
const BU6_EMPLOYEE_ID = 12

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Incapacidades — aislamiento por tenant (BD real)', (group) => {
  let tempBu6Id: number
  let tempBu1Id: number

  group.setup(async () => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()

    // Crear fuera de request HTTP: el hook beforeCreate hereda del empleado.
    const bu6 = new WorkDisability()
    bu6.workDisabilityUuid = `test-wd-bu6-${cuid()}`
    bu6.employeeId = BU6_EMPLOYEE_ID
    bu6.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await bu6.save()
    tempBu6Id = bu6.workDisabilityId

    const bu1 = new WorkDisability()
    bu1.workDisabilityUuid = `test-wd-bu1-${cuid()}`
    bu1.employeeId = BU1_EMPLOYEE_ID
    bu1.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await bu1.save()
    tempBu1Id = bu1.workDisabilityId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (tempBu6Id) {
        await WorkDisability.query().where('workDisabilityId', tempBu6Id).delete()
      }
      if (tempBu1Id) {
        await WorkDisability.query().where('workDisabilityId', tempBu1Id).delete()
      }
    }, 'limpieza test aislamiento incapacidades')
  })

  test('alta nueva hereda business_unit_id del empleado padre', async ({ assert }) => {
    const bu6 = await TenantContext.runUnscoped(
      () => WorkDisability.query().where('workDisabilityId', tempBu6Id).firstOrFail(),
      'lectura fixture test'
    )
    const bu1 = await TenantContext.runUnscoped(
      () => WorkDisability.query().where('workDisabilityId', tempBu1Id).firstOrFail(),
      'lectura fixture test'
    )

    assert.equal(bu6.businessUnitId, 6)
    assert.equal(bu1.businessUnitId, 1)
  })

  test('usuario de BU1 recibe 404 uniforme al pedir incapacidad de BU6', async ({ client }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/work-disabilities/${tempBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })
  })

  test('usuario de BU6 recibe 404 uniforme al pedir incapacidad de BU1', async ({ client }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/work-disabilities/${tempBu1Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })
  })

  test('usuario de BU6 sí puede ver su incapacidad propia', async ({ client, assert }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/work-disabilities/${tempBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
    assert.equal(response.body().data.workDisability.workDisabilityId, tempBu6Id)
  })

  test('DELETE de incapacidad ajena responde 404 y no la borra', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .delete(`/api/work-disabilities/${tempBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        WorkDisability.query()
          .where('workDisabilityId', tempBu6Id)
          .whereNull('work_disability_deleted_at')
          .first(),
      'verificación post-delete cross-tenant'
    )
    assert.isNotNull(stillAlive, 'la incapacidad ajena no debió borrarse')
  })

  test('index solo devuelve incapacidades in-scope', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get('/api/work-disabilities')
      .qs({ page: 1, limit: 500 })
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
    const paginator = response.body().data?.workDisabilities
    const rows = paginator?.data ?? []
    const ids = rows.map((r: { workDisabilityId: number }) => r.workDisabilityId)
    assert.include(ids, tempBu1Id)
    assert.notInclude(ids, tempBu6Id)
  })
})

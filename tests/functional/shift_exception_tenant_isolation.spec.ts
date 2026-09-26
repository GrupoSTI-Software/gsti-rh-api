import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import ShiftException from '#models/shift_exception'
import ExceptionType from '#models/exception_type'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058577 — cierre de fuga IDOR en excepciones de turno (BD real).
 * BU1 (sae) empleado 678 vs BU6 (cima) empleado 12.
 *
 * Los UUID públicos se resuelven desde `business_units` en setup (no hardcode),
 * porque pueden rotar entre restauraciones de BD.
 */

const BU1_EMPLOYEE_ID = 678
const BU6_EMPLOYEE_ID = 12

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

async function createFixture(
  employeeId: number,
  exceptionTypeId: number,
  label: string
): Promise<ShiftException> {
  // Sin TenantContext: el hook hereda del empleado (fail-open fuera de request).
  const farDate = DateTime.now().plus({ years: 5 }).toFormat('yyyy-LL-dd')
  const row = new ShiftException()
  row.employeeId = employeeId
  row.exceptionTypeId = exceptionTypeId
  row.shiftExceptionsDate = farDate
  row.shiftExceptionsDescription = label
  row.shiftExceptionCheckInTime = null
  row.shiftExceptionCheckOutTime = null
  row.shiftExceptionEnjoymentOfSalary = 1
  row.shiftExceptionTimeByTime = 0
  row.vacationSettingId = null
  row.workDisabilityPeriodId = null
  row.lactationPeriodId = null
  await row.save()
  return row
}

test.group('ShiftException — aislamiento por tenant (BD real)', (group) => {
  let exceptionBu6Id: number
  let exceptionBu1Id: number
  let bu1PublicId: string
  let bu6PublicId: string

  group.setup(async () => {
    const [bu1, bu6] = await Promise.all([
      BusinessUnit.query().where('businessUnitId', 1).firstOrFail(),
      BusinessUnit.query().where('businessUnitId', 6).firstOrFail(),
    ])
    bu1PublicId = bu1.businessUnitPublicId
    bu6PublicId = bu6.businessUnitPublicId

    const type = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .orderBy('exceptionTypeId')
      .firstOrFail()

    const e6 = await createFixture(
      BU6_EMPLOYEE_ID,
      type.exceptionTypeId,
      'TEST-TENANT-ISOLATION-BU6'
    )
    exceptionBu6Id = e6.shiftExceptionId

    const e1 = await createFixture(
      BU1_EMPLOYEE_ID,
      type.exceptionTypeId,
      'TEST-TENANT-ISOLATION-BU1'
    )
    exceptionBu1Id = e1.shiftExceptionId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (exceptionBu6Id) {
        await ShiftException.query().where('shiftExceptionId', exceptionBu6Id).delete()
      }
      if (exceptionBu1Id) {
        await ShiftException.query().where('shiftExceptionId', exceptionBu1Id).delete()
      }
    }, 'limpieza test shift_exception')
  })

  test('alta hereda business_unit_id del empleado padre', async ({ assert }) => {
    const [e6, e1] = await TenantContext.runUnscoped(async () => {
      return Promise.all([
        ShiftException.query().where('shiftExceptionId', exceptionBu6Id).firstOrFail(),
        ShiftException.query().where('shiftExceptionId', exceptionBu1Id).firstOrFail(),
      ])
    }, 'lectura fixtures shift_exception')

    assert.equal(e6.businessUnitId, 6)
    assert.equal(e1.businessUnitId, 1)
  })

  test('GET de excepción ajena responde 404 (nunca 403)', async ({ client }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/shift-exception/${exceptionBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    response.assertStatus(404)
  })

  test('DELETE de excepción ajena responde 404 y no la borra', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .delete(`/api/shift-exception/${exceptionBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    response.assertStatus(404)

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        ShiftException.query()
          .where('shiftExceptionId', exceptionBu6Id)
          .whereNull('shift_exceptions_deleted_at')
          .first(),
      'verificación post-delete shift_exception'
    )
    assert.isNotNull(stillAlive)
  })

  test('mixin filtra excepción ajena por PK con contexto activo', async ({ assert }) => {
    const found = await TenantContext.run([1], () =>
      ShiftException.query().where('shiftExceptionId', exceptionBu6Id).first()
    )
    assert.isNull(found)

    const own = await TenantContext.run([6], () =>
      ShiftException.query().where('shiftExceptionId', exceptionBu6Id).first()
    )
    assert.isNotNull(own)
  })

  test('usuario de BU6 puede ver su propia excepción', async ({ client, assert }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/shift-exception/${exceptionBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu6PublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.shiftExceptionId, exceptionBu6Id)
  })

  test('usuario de BU1 puede ver su propia excepción', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/shift-exception/${exceptionBu1Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', bu1PublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.shiftExceptionId, exceptionBu1Id)
  })
})

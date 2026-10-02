import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import { scopedEmployeeIds } from '#helpers/employee_tenant_scope'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { HttpRequestMarker } from '#utils/http_request_marker'
import {
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

async function countViaScopedEmployeeIds(): Promise<number> {
  const count = await ExceptionRequest.query()
    .whereIn('employee_id', scopedEmployeeIds())
    .count('* as total')
  return Number(count[0].$extras.total)
}

test.group('employee_tenant_scope — D3 (USRH1789600808831 / N11)', (group) => {
  let actorA: TenantActor
  let actorB: TenantActor
  let fixtureA: EmployeeFixture
  let fixtureB: EmployeeFixture
  let exceptionTypeId: number
  let requestAId: number
  let requestBId: number

  group.setup(async () => {
    actorA = await createTenantActor('exc-scope-a')
    actorB = await createTenantActor('exc-scope-b')
    fixtureA = await createEmployeeFixture(actorA.businessUnit.businessUnitId, 'exc-a')
    fixtureB = await createEmployeeFixture(actorB.businessUnit.businessUnitId, 'exc-b')

    const exceptionType = await ExceptionType.query().whereNull('exception_type_deleted_at').firstOrFail()
    exceptionTypeId = exceptionType.exceptionTypeId

    const created = await TenantContext.runUnscoped(
      async () => {
        const reqA = await ExceptionRequest.create({
          employeeId: fixtureA.employee.employeeId,
          exceptionTypeId,
          exceptionRequestStatus: 'pending',
          exceptionRequestDescription: 'n11-scope-a',
          exceptionRequestCheckInTime: null,
          exceptionRequestCheckOutTime: null,
          exceptionRequestPeriodInHours: null,
          requestedDate: new Date(),
          exceptionRequestRhRead: 0,
          exceptionRequestGerencialRead: 0,
          userId: actorA.user.userId,
        })
        const reqB = await ExceptionRequest.create({
          employeeId: fixtureB.employee.employeeId,
          exceptionTypeId,
          exceptionRequestStatus: 'pending',
          exceptionRequestDescription: 'n11-scope-b',
          exceptionRequestCheckInTime: null,
          exceptionRequestCheckOutTime: null,
          exceptionRequestPeriodInHours: null,
          requestedDate: new Date(),
          exceptionRequestRhRead: 0,
          exceptionRequestGerencialRead: 0,
          userId: actorB.user.userId,
        })
        return { reqA, reqB }
      },
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )
    requestAId = created.reqA.exceptionRequestId
    requestBId = created.reqB.exceptionRequestId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await ExceptionRequest.query()
        .whereIn('exception_request_id', [requestAId, requestBId])
        .delete()
      await cleanupEmployeeFixture(fixtureA)
      await cleanupEmployeeFixture(fixtureB)
      await cleanupTenantActor(actorA)
      await cleanupTenantActor(actorB)
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
  })

  test('sin contexto: subquery vacía sin lanzar y Lucid vacío en HTTP (N11.1)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())
    assert.isFalse(HttpRequestMarker.isInHttpRequest())

    const knexCount = await db
      .from('exception_requests')
      .whereIn('employee_id', scopedEmployeeIds())
      .count('* as total')
    assert.equal(Number(knexCount[0].total), 0)

    await HttpRequestMarker.run(async () => {
      assert.equal(await countViaScopedEmployeeIds(), 0)
    })
  })

  test('con run([A]): solo solicitudes de empleados de A (N11.2)', async ({ assert }) => {
    const rows = await TenantContext.run([actorA.businessUnit.businessUnitId], async () =>
      ExceptionRequest.query()
        .whereIn('employee_id', scopedEmployeeIds())
        .select('exception_request_id')
    )
    const ids = rows.map((row) => row.exceptionRequestId)
    assert.include(ids, requestAId)
    assert.notInclude(ids, requestBId)
  })

  test('con runUnscoped: consulta sin guarda ve solicitudes de A y B (N11.2 bypass)', async ({
    assert,
  }) => {
    const rows = await TenantContext.runUnscoped(
      async () =>
        ExceptionRequest.query().whereIn('exception_request_id', [requestAId, requestBId]),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )
    assert.lengthOf(rows, 2)
  })
})

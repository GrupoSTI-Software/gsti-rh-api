import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import SystemModule from '#models/system_module'
import ExceptionType from '#models/exception_type'
import ExceptionRequest from '#models/exception_request'
import {
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  expectAmountMasked,
  expectNeverDenied,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

/**
 * Anexo C (Task 10, USRH1787433076994): `exception_request_routes.ts` no
 * montaba `businessScope`/`sensitiveAccess`, pero `ExceptionRequestsController.index`
 * preload-ea `employee` y devuelve el modelo completo. Sin `SensitiveAccessContext`
 * activo, `canRead('financiero')` fail-closeaba a `false` para TODOS —
 * incluido quien sí tiene `sensitive-financiero-read` — mostrando siempre
 * `dailySalary: •••••` (regresión de usabilidad, nunca fuga del número en claro).
 *
 * Fix: montar `middleware.sensitiveAccess()` en el grupo (mismo patrón que
 * `person_routes.ts`). Este test prueba que,
 * tras el fix, `dailySalary` responde correctamente según el permiso.
 */
const DAILY_SALARY = 777.25

test.group('Anexo C fix — exception-requests abre SensitiveAccessContext', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let exceptionRequest: ExceptionRequest | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actor = await createActor('anexo-c-exc-req')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'anexo-c-exc-req')
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ daily_salary: DAILY_SALARY })

    exceptionType = await ExceptionType.query().whereNull('exception_type_deleted_at').firstOrFail()
    exceptionRequest = await ExceptionRequest.create({
      employeeId: fixture.employee.employeeId,
      exceptionTypeId: exceptionType.exceptionTypeId,
      exceptionRequestStatus: 'pending',
      exceptionRequestDescription: 'Anexo C fix coverage',
      userId: actor.user.userId,
      requestedDate: new Date(),
    })
  })

  group.teardown(async () => {
    try {
      if (exceptionRequest) {
        await ExceptionRequest.query()
          .where('exception_request_id', exceptionRequest.exceptionRequestId)
          .delete()
      }
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('sin sensitive-financiero-read: dailySalary del empleado preloadeado está enmascarado', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read'])
    const response = await client
      .get('/api/exception-requests/')
      .qs({ employeeId: fixture!.employee.employeeId })
      .loginAs(actor!.user)
      // `businessScope` exige el header de empresa desde que se monto en el
      // grupo de rutas (antes el listado cruzaba empresas). Sin el, la peticion
      // muere en 400 BU.VAL.000 y el spec no llegaba a probar dailySalary.
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    expectNeverDenied(response, assert)
    const rows = response.body().data.data as Record<string, unknown>[]
    const row = rows.find(
      (item) => item.exceptionRequestId === exceptionRequest!.exceptionRequestId
    )
    assert.exists(row)
    const employee = row!.employee as Record<string, unknown>
    expectAmountMasked(employee.dailySalary, assert)
  })

  test('con sensitive-financiero-read: dailySalary del empleado preloadeado sigue enmascarado en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-trabajo-read', 'sensitive-financiero-read'])
    const response = await client
      .get('/api/exception-requests/')
      .qs({ employeeId: fixture!.employee.employeeId })
      .loginAs(actor!.user)
      // `businessScope` exige el header de empresa desde que se monto en el
      // grupo de rutas (antes el listado cruzaba empresas). Sin el, la peticion
      // muere en 400 BU.VAL.000 y el spec no llegaba a probar dailySalary.
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    expectNeverDenied(response, assert)
    const rows = response.body().data.data as Record<string, unknown>[]
    const row = rows.find(
      (item) => item.exceptionRequestId === exceptionRequest!.exceptionRequestId
    )
    assert.exists(row)
    const employee = row!.employee as Record<string, unknown>
    expectAmountMasked(employee.dailySalary, assert)
    assert.notEqual(employee.dailySalary, 0)
  })
})

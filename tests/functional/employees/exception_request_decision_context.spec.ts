import { test } from '@japa/runner'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import SystemModule from '#models/system_module'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import {
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

/**
 * HU-5: contexto para decidir.
 *
 * Las señales apoyan la resolución, así que su contrato es tan importante por lo
 * que devuelven como por lo que NO pueden hacer: no exponen datos de terceros,
 * no cruzan empresas y una señal que falla no puede tumbar el bloque completo.
 */
const ruta = (id: number) => `/api/exception-requests/${id}/decision-context`

test.group('HU-5 — contexto para decidir', (group) => {
  let employeesModule: SystemModule
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let fixtureA: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let jefatura: UserResponsibleEmployee | null = null
  let solicitud: ExceptionRequest | null = null
  let previa: ExceptionRequest | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actorA = await createActor('hu5-ctx-a')
    actorB = await createActor('hu5-ctx-b')
    await grantOnly(actorA.role.roleId, [])
    await grantOnly(actorB.role.roleId, [])
    fixtureA = await createSensitiveFixture(actorA.businessUnit.businessUnitId, 'hu5-ctx-a')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()

    jefatura = await UserResponsibleEmployee.create({
      userId: actorA.user.userId,
      employeeId: fixtureA.employee.employeeId,
      businessUnitId: actorA.businessUnit.businessUnitId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 1,
    })

    const base = {
      employeeId: fixtureA.employee.employeeId,
      exceptionTypeId: exceptionType.exceptionTypeId,
      exceptionRequestDescription: 'Solicitud de prueba HU-5',
      exceptionRequestCheckInTime: null,
      exceptionRequestCheckOutTime: null,
      exceptionRequestPeriodInHours: 0,
      exceptionRequestRhRead: 0,
      exceptionRequestGerencialRead: 0,
      userId: actorA.user.userId,
    }

    // Una aceptada previa del mismo tipo alimenta la señal de reincidencia.
    previa = await ExceptionRequest.create({
      ...base,
      exceptionRequestStatus: 'accepted',
      requestedDate: new Date(),
    })
    solicitud = await ExceptionRequest.create({
      ...base,
      exceptionRequestStatus: 'pending',
      requestedDate: new Date(),
    })
  })

  group.teardown(async () => {
    try {
      const ids = [solicitud?.exceptionRequestId, previa?.exceptionRequestId].filter(
        (id): id is number => typeof id === 'number'
      )
      if (ids.length) {
        await ExceptionRequest.query().whereIn('exception_request_id', ids).delete()
      }
      if (jefatura) {
        await UserResponsibleEmployee.query()
          .where('user_responsible_employee_id', jefatura.userResponsibleEmployeeId)
          .delete()
      }
      await cleanupSensitiveFixture(fixtureA)
      await cleanupActor(actorA)
      await cleanupActor(actorB)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('devuelve las señales de la solicitud', async ({ client, assert }) => {
    const response = await client
      .get(ruta(solicitud!.exceptionRequestId))
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 200)

    const signals = response.body()?.data?.signals as Array<Record<string, unknown>>

    assert.isArray(signals, 'el contexto siempre responde con una lista de señales')

    for (const signal of signals) {
      assert.isString(signal.key)
      assert.oneOf(String(signal.tone), ['info', 'warning'])
    }
  })

  test('las señales no exponen datos de otros empleados', async ({ client, assert }) => {
    const response = await client
      .get(ruta(solicitud!.exceptionRequestId))
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)

    const payload = JSON.stringify(response.body()?.data ?? {})

    // El choque de equipo viaja como conteo: ni nombres ni ids de terceros.
    assert.notInclude(payload, 'personFirstname')
    assert.notInclude(payload, 'employeeId')
  })

  test('una empresa no obtiene el contexto de una solicitud ajena', async ({ client, assert }) => {
    const response = await client
      .get(ruta(solicitud!.exceptionRequestId))
      .loginAs(actorB!.user)
      .header('X-Business-Unit-Id', actorB!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 404)
  })
})

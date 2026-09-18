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
 * HU-4: resolución en lote.
 *
 * Resolver de una en una convertía una tanda de veinte solicitudes en veinte
 * ciclos de abrir, decidir y cerrar. El lote es la misma facultad ejercida N
 * veces, así que exige el mismo permiso; lo que no puede hacer es resolver a
 * medias: si un id no pertenece a la empresa activa o ya fue resuelto, la
 * operación completa se rechaza sin escribir una sola fila.
 */
const RUTA = '/api/exception-requests/resolve-batch'

/** Solicitud pendiente del empleado del fixture. */
async function crearPendiente(
  fixture: SensitiveFixture,
  actor: TenantActor,
  exceptionType: ExceptionType,
  requestedDate: string
) {
  return ExceptionRequest.create({
    employeeId: fixture.employee.employeeId,
    exceptionTypeId: exceptionType.exceptionTypeId,
    exceptionRequestStatus: 'pending',
    exceptionRequestDescription: 'Solicitud de prueba HU-4',
    exceptionRequestCheckInTime: null,
    exceptionRequestCheckOutTime: null,
    exceptionRequestPeriodInHours: 0,
    requestedDate,
    exceptionRequestRhRead: 0,
    exceptionRequestGerencialRead: 0,
    userId: actor.user.userId,
  })
}

test.group('HU-4 — resolución en lote', (group) => {
  let employeesModule: SystemModule
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let fixtureA: SensitiveFixture | null = null
  let fixtureB: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let jefaturaA: UserResponsibleEmployee | null = null
  let jefaturaB: UserResponsibleEmployee | null = null
  const creadas: number[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actorA = await createActor('hu4-lote-a')
    actorB = await createActor('hu4-lote-b')
    await grantOnly(actorA.role.roleId, [])
    await grantOnly(actorB.role.roleId, [])
    fixtureA = await createSensitiveFixture(actorA.businessUnit.businessUnitId, 'hu4-lote-a')
    fixtureB = await createSensitiveFixture(actorB.businessUnit.businessUnitId, 'hu4-lote-b')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()

    jefaturaA = await UserResponsibleEmployee.create({
      userId: actorA.user.userId,
      employeeId: fixtureA.employee.employeeId,
      businessUnitId: actorA.businessUnit.businessUnitId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 1,
    })
    jefaturaB = await UserResponsibleEmployee.create({
      userId: actorB.user.userId,
      employeeId: fixtureB.employee.employeeId,
      businessUnitId: actorB.businessUnit.businessUnitId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 1,
    })
  })

  group.teardown(async () => {
    try {
      if (creadas.length) {
        await ExceptionRequest.query().whereIn('exception_request_id', creadas).delete()
      }
      for (const jefatura of [jefaturaA, jefaturaB]) {
        if (jefatura) {
          await UserResponsibleEmployee.query()
            .where('user_responsible_employee_id', jefatura.userResponsibleEmployeeId)
            .delete()
        }
      }
      await cleanupSensitiveFixture(fixtureA)
      await cleanupSensitiveFixture(fixtureB)
      await cleanupActor(actorA)
      await cleanupActor(actorB)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('acepta varias solicitudes en una sola llamada', async ({ client, assert }) => {
    const primera = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-01-05')
    const segunda = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-01-06')
    creadas.push(primera.exceptionRequestId, segunda.exceptionRequestId)

    const response = await client
      .post(RUTA)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .json({
        exceptionRequestIds: [primera.exceptionRequestId, segunda.exceptionRequestId],
        status: 'accepted',
        description: 'Autorizadas en bloque.',
      })

    assert.equal(response.status(), 200)

    const resueltas = await ExceptionRequest.query()
      .whereIn('exception_request_id', [primera.exceptionRequestId, segunda.exceptionRequestId])

    for (const solicitud of resueltas) {
      assert.equal(solicitud.exceptionRequestStatus, 'accepted')
      assert.equal(solicitud.exceptionRequestResolutionNote, 'Autorizadas en bloque.')
      assert.equal(solicitud.resolvedByUserId, actorA!.user.userId)
      assert.isNotNull(solicitud.exceptionRequestResolvedAt)
    }
  })

  test('el rechazo en lote exige nota', async ({ client, assert }) => {
    const solicitud = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-02-01')
    creadas.push(solicitud.exceptionRequestId)

    const response = await client
      .post(RUTA)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .json({ exceptionRequestIds: [solicitud.exceptionRequestId], status: 'refused' })

    assert.equal(response.status(), 400)

    const sinTocar = await ExceptionRequest.query()
      .where('exception_request_id', solicitud.exceptionRequestId)
      .firstOrFail()

    assert.equal(sinTocar.exceptionRequestStatus, 'pending')
  })

  test('un id de otra empresa aborta el lote completo sin escribir nada', async ({
    client,
    assert,
  }) => {
    const propia = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-03-01')
    const ajena = await crearPendiente(fixtureB!, actorB!, exceptionType!, '2031-03-02')
    creadas.push(propia.exceptionRequestId, ajena.exceptionRequestId)

    const response = await client
      .post(RUTA)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .json({
        exceptionRequestIds: [propia.exceptionRequestId, ajena.exceptionRequestId],
        status: 'accepted',
        description: 'Intento mixto.',
      })

    assert.notEqual(response.status(), 200)

    const ambas = await ExceptionRequest.query()
      .whereIn('exception_request_id', [propia.exceptionRequestId, ajena.exceptionRequestId])

    for (const solicitud of ambas) {
      assert.equal(
        solicitud.exceptionRequestStatus,
        'pending',
        'ninguna fila se escribe cuando un id queda fuera del alcance'
      )
    }
  })

  test('un id ya resuelto aborta el lote completo', async ({ client, assert }) => {
    const pendiente = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-04-01')
    const resuelta = await crearPendiente(fixtureA!, actorA!, exceptionType!, '2031-04-02')
    creadas.push(pendiente.exceptionRequestId, resuelta.exceptionRequestId)

    resuelta.exceptionRequestStatus = 'refused'
    await resuelta.save()

    const response = await client
      .post(RUTA)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .json({
        exceptionRequestIds: [pendiente.exceptionRequestId, resuelta.exceptionRequestId],
        status: 'accepted',
        description: 'Intento sobre una ya resuelta.',
      })

    assert.equal(response.status(), 409)

    const sinTocar = await ExceptionRequest.query()
      .where('exception_request_id', pendiente.exceptionRequestId)
      .firstOrFail()

    assert.equal(sinTocar.exceptionRequestStatus, 'pending')
  })

  test('rechaza un lote que excede el tope de solicitudes', async ({ client, assert }) => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1)

    const response = await client
      .post(RUTA)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .json({ exceptionRequestIds: ids, status: 'accepted' })

    assert.equal(response.status(), 400)
  })
})

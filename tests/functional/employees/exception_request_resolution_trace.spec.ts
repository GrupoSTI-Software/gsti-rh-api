import { test } from '@japa/runner'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import SystemModule from '#models/system_module'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import BranchOffice from '#models/branch_office'
import EmployeeBranchOffice from '#models/employee_branch_office'
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
 * HU-1 del rediseno de Solicitudes de permisos: la resolucion deja rastro.
 *
 * Antes de esta HU el motivo del rechazo viajaba solo en el correo al empleado
 * y nunca se guardaba, asi que nadie podia saber despues por que se rechazo una
 * solicitud ni quien la resolvio. El listado tampoco ofrecia los filtros con los
 * que RH agrupa el trabajo (sucursal y tipo) ni los conteos por estatus que las
 * tabs del rediseno necesitan.
 *
 * Spec: `00-brain/04-gsti/03-valanserh/02-plannings/analisis-rediseno-solicitudes-permisos-2026-09-17.md`
 */

/**
 * Hace al actor jefe directo del empleado del fixture.
 *
 * `indexAllExceptionRequests` decide la visibilidad por rol: root y el dueño de
 * la cuenta ven todas las de su empresa, RRHH las de empleados sin jefe, y
 * cualquier otro rol solo las de sus subordinados directos. El rol temporal del
 * fixture cae en el ultimo caso, asi que sin esta fila el listado responde vacio
 * — correcto por diseno, pero inutil para probar el contenido de la respuesta.
 */
async function hacerJefeDirecto(fixture: SensitiveFixture, actor: TenantActor) {
  return UserResponsibleEmployee.create({
    userId: actor.user.userId,
    employeeId: fixture.employee.employeeId,
    businessUnitId: actor.businessUnit.businessUnitId,
    userResponsibleEmployeeReadonly: 0,
    userResponsibleEmployeeDirectBoss: 1,
  })
}

/** Solicitud pendiente del empleado del fixture, lista para resolver. */
async function crearPendiente(
  fixture: SensitiveFixture,
  actor: TenantActor,
  exceptionType: ExceptionType,
  requestedDate = '2030-03-10'
) {
  return ExceptionRequest.create({
    employeeId: fixture.employee.employeeId,
    exceptionTypeId: exceptionType.exceptionTypeId,
    exceptionRequestStatus: 'pending',
    exceptionRequestDescription: 'Solicitud de prueba HU-1',
    exceptionRequestCheckInTime: null,
    exceptionRequestCheckOutTime: null,
    exceptionRequestPeriodInHours: 0,
    requestedDate,
    exceptionRequestRhRead: 0,
    exceptionRequestGerencialRead: 0,
    userId: actor.user.userId,
  })
}

test.group('HU-1 — la resolucion deja rastro', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let jefatura: UserResponsibleEmployee | null = null
  const creadas: number[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actor = await createActor('hu1-resolucion')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'hu1-resolucion')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()
    jefatura = await hacerJefeDirecto(fixture, actor)
  })

  group.teardown(async () => {
    try {
      if (jefatura) {
        await UserResponsibleEmployee.query()
          .where('user_responsible_employee_id', jefatura.userResponsibleEmployeeId)
          .delete()
      }
      if (creadas.length) {
        await ExceptionRequest.query().whereIn('exception_request_id', creadas).delete()
      }
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('rechazar con motivo guarda la nota, el resolutor y la fecha', async ({
    client,
    assert,
  }) => {
    const solicitud = await crearPendiente(fixture!, actor!, exceptionType!)
    creadas.push(solicitud.exceptionRequestId)

    const response = await client
      .post(`/api/exception-requests/${solicitud.exceptionRequestId}/status`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ status: 'refused', description: 'No hay evidencia de la cita medica.' })

    assert.equal(response.status(), 200)

    const guardada = await ExceptionRequest.query()
      .where('exception_request_id', solicitud.exceptionRequestId)
      .firstOrFail()

    assert.equal(guardada.exceptionRequestStatus, 'refused')
    assert.equal(guardada.exceptionRequestResolutionNote, 'No hay evidencia de la cita medica.')
    assert.equal(guardada.resolvedByUserId, actor!.user.userId)
    assert.isNotNull(guardada.exceptionRequestResolvedAt)
  })

  test('la nota de resolucion no pisa la descripcion del empleado', async ({ client, assert }) => {
    const solicitud = await crearPendiente(fixture!, actor!, exceptionType!, '2030-03-11')
    creadas.push(solicitud.exceptionRequestId)

    await client
      .post(`/api/exception-requests/${solicitud.exceptionRequestId}/status`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ status: 'accepted', description: 'Autorizado por direccion.' })

    const guardada = await ExceptionRequest.query()
      .where('exception_request_id', solicitud.exceptionRequestId)
      .firstOrFail()

    assert.equal(guardada.exceptionRequestDescription, 'Solicitud de prueba HU-1')
    assert.equal(guardada.exceptionRequestResolutionNote, 'Autorizado por direccion.')
  })

  test('el listado devuelve los datos de resolucion de cada solicitud', async ({
    client,
    assert,
  }) => {
    const solicitud = await crearPendiente(fixture!, actor!, exceptionType!, '2030-03-12')
    creadas.push(solicitud.exceptionRequestId)

    await client
      .post(`/api/exception-requests/${solicitud.exceptionRequestId}/status`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ status: 'accepted', description: 'Queda autorizada.' })

    const response = await client
      .get('/api/exception-requests/all')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .qs({ limit: 100 })

    assert.equal(response.status(), 200)

    const lista = response.body()?.data?.data as Array<Record<string, any>>
    const enLista = lista.find(
      (item) => item.exceptionRequestId === solicitud.exceptionRequestId
    )

    assert.isDefined(enLista, 'la solicitud resuelta debe seguir en el listado')
    assert.equal(enLista!.exceptionRequestResolutionNote, 'Queda autorizada.')
    assert.equal(enLista!.resolvedByUserId, actor!.user.userId)
    assert.isNotNull(enLista!.exceptionRequestResolvedAt)
  })

  test('el listado filtra por tipo de solicitud', async ({ client, assert }) => {
    const solicitud = await crearPendiente(fixture!, actor!, exceptionType!, '2030-05-01')
    creadas.push(solicitud.exceptionRequestId)

    const otroTipo = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .whereNot('exception_type_id', exceptionType!.exceptionTypeId)
      .firstOrFail()

    const response = await client
      .get('/api/exception-requests/all')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .qs({ exceptionTypeId: otroTipo.exceptionTypeId, limit: 100 })

    const lista = response.body()?.data?.data as Array<Record<string, any>>
    const coincide = lista.some(
      (item) => item.exceptionRequestId === solicitud.exceptionRequestId
    )

    assert.isFalse(coincide, 'filtrar por otro tipo no debe devolver esta solicitud')
  })
})

test.group('HU-1 — aislamiento entre empresas', (group) => {
  let employeesModule: SystemModule
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let fixtureA: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let solicitudDeA: ExceptionRequest | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actorA = await createActor('hu1-empresa-a')
    actorB = await createActor('hu1-empresa-b')
    await grantOnly(actorA.role.roleId, [])
    await grantOnly(actorB.role.roleId, [])
    fixtureA = await createSensitiveFixture(actorA.businessUnit.businessUnitId, 'hu1-empresa-a')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()
    solicitudDeA = await crearPendiente(fixtureA, actorA, exceptionType, '2030-06-01')
  })

  group.teardown(async () => {
    try {
      if (solicitudDeA) {
        await ExceptionRequest.query()
          .where('exception_request_id', solicitudDeA.exceptionRequestId)
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

  test('la empresa B no ve la solicitud de la empresa A', async ({ client, assert }) => {
    const response = await client
      .get('/api/exception-requests/all')
      .loginAs(actorB!.user)
      .header('X-Business-Unit-Id', actorB!.businessUnit.businessUnitPublicId)
      .qs({ limit: 100 })

    const lista = (response.body()?.data?.data ?? []) as Array<Record<string, any>>
    const filtrada = lista.some(
      (item) => item.exceptionRequestId === solicitudDeA!.exceptionRequestId
    )

    assert.isFalse(filtrada, 'una empresa nunca lista las solicitudes de otra')
  })

  test('la empresa B no resuelve la solicitud de la empresa A', async ({ client, assert }) => {
    const response = await client
      .post(`/api/exception-requests/${solicitudDeA!.exceptionRequestId}/status`)
      .loginAs(actorB!.user)
      .header('X-Business-Unit-Id', actorB!.businessUnit.businessUnitPublicId)
      .json({ status: 'accepted', description: 'Intento desde otra empresa.' })

    assert.notEqual(response.status(), 200)

    const sinTocar = await ExceptionRequest.query()
      .where('exception_request_id', solicitudDeA!.exceptionRequestId)
      .firstOrFail()

    assert.equal(sinTocar.exceptionRequestStatus, 'pending')
    assert.isNull(sinTocar.resolvedByUserId)
  })
})

test.group('HU-1 — filtro por sucursal', (group) => {
  let employeesModule: SystemModule
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let fixtureA: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let jefatura: UserResponsibleEmployee | null = null
  let sucursalDeA: BranchOffice | null = null
  let sucursalDeB: BranchOffice | null = null
  let asignacion: EmployeeBranchOffice | null = null
  let solicitud: ExceptionRequest | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actorA = await createActor('hu1-suc-a')
    actorB = await createActor('hu1-suc-b')
    await grantOnly(actorA.role.roleId, [])
    await grantOnly(actorB.role.roleId, [])
    fixtureA = await createSensitiveFixture(actorA.businessUnit.businessUnitId, 'hu1-suc-a')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()
    jefatura = await hacerJefeDirecto(fixtureA, actorA)

    const stamp = `${Date.now()}`
    sucursalDeA = await BranchOffice.create({
      businessUnitId: actorA.businessUnit.businessUnitId,
      branchOfficeName: `Matriz QA ${stamp}`,
      branchOfficeSlug: `matriz-qa-${stamp}`,
    })
    sucursalDeB = await BranchOffice.create({
      businessUnitId: actorB.businessUnit.businessUnitId,
      branchOfficeName: `Ajena QA ${stamp}`,
      branchOfficeSlug: `ajena-qa-${stamp}`,
    })
    asignacion = await EmployeeBranchOffice.create({
      employeeId: fixtureA.employee.employeeId,
      businessUnitId: actorA.businessUnit.businessUnitId,
      branchOfficeId: sucursalDeA.branchOfficeId,
      employeeBranchOfficeActive: 1,
    })
    solicitud = await crearPendiente(fixtureA, actorA, exceptionType, '2030-07-01')
  })

  group.teardown(async () => {
    try {
      if (solicitud) {
        await ExceptionRequest.query()
          .where('exception_request_id', solicitud.exceptionRequestId)
          .delete()
      }
      if (asignacion) {
        await EmployeeBranchOffice.query()
          .where('employee_branch_office_id', asignacion.employeeBranchOfficeId)
          .delete()
      }
      if (jefatura) {
        await UserResponsibleEmployee.query()
          .where('user_responsible_employee_id', jefatura.userResponsibleEmployeeId)
          .delete()
      }
      await cleanupSensitiveFixture(fixtureA)
      for (const sucursal of [sucursalDeA, sucursalDeB]) {
        if (sucursal) {
          await BranchOffice.query().where('branch_office_id', sucursal.branchOfficeId).delete()
        }
      }
      await cleanupActor(actorA)
      await cleanupActor(actorB)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('filtrar por la sucursal del empleado devuelve su solicitud', async ({ client, assert }) => {
    const response = await client
      .get('/api/exception-requests/all')
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .qs({ branchOfficeId: sucursalDeA!.branchOfficeId, limit: 100 })

    const lista = (response.body()?.data?.data ?? []) as Array<Record<string, any>>

    assert.isTrue(
      lista.some((item) => item.exceptionRequestId === solicitud!.exceptionRequestId),
      'la solicitud del empleado asignado a esa sucursal debe aparecer'
    )
  })

  test('una sucursal de otra empresa no filtra nada propio', async ({ client, assert }) => {
    const response = await client
      .get('/api/exception-requests/all')
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)
      .qs({ branchOfficeId: sucursalDeB!.branchOfficeId, limit: 100 })

    const lista = (response.body()?.data?.data ?? []) as Array<Record<string, any>>

    assert.equal(response.status(), 200, 'responde vacio, no error que confirme la sucursal ajena')
    assert.isFalse(
      lista.some((item) => item.exceptionRequestId === solicitud!.exceptionRequestId),
      'pedir una sucursal ajena no puede colar solicitudes propias'
    )
  })
})

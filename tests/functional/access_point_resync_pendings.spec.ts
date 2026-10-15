import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import AccessPointResyncPending from '#models/access_point_resync_pending'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import {
  ACCESS_POINT_RESYNC_REQUIRED_ACTION,
  ACCESS_POINT_RESYNC_RESOLUTION,
} from '#modules/access-point/employee-sync/resync_pending.constants'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1790812613831 — lectura y cierre de los checadores pendientes de
 * sincronizar: la marca se apaga al volver a asignar (CA-5), el nivel de
 * detalle lo decide el servidor por permiso (CA-6, CA-7), la acción sigue al
 * estado actual del vínculo (CA-8), la lectura oculta sin escribir (CA-9), y
 * sin permiso de ficha, de otra empresa o dado de baja responde el error
 * uniforme del canal (CA-11, CA-12). Fixtures por inserción directa; las marcas
 * se siembran como las deja la reactivación.
 */

const TEST_PASSWORD = 'ChecadoresPendientes123!'
const EMPLOYEES_MODULE_SLUG = 'employees'
const PENDINGS_PATH = (employeeId: number) =>
  `/api/v1/employees/${employeeId}/access-point-resync-pendings`

function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

interface Actor {
  user: User
  person: Person
  role: Role | null
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Checadores ${label} ${s}`,
    businessUnitSlug: `checadores-pendientes-${label}-${s}`,
    businessUnitLegalName: `Checadores ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

/** Colaborador activo, o dado de baja (borrado lógico) con `terminated`. */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  terminated = false
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Checador',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `checadores-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `CH-${s}`
  employee.employeeFirstName = 'Checador'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `CH-${s}`
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.employeeTerminatedDate = null
  await employee.save()
  if (terminated) {
    await db
      .from(Employee.table)
      .where('employee_id', employee.employeeId)
      .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
  }
  return { employee, person }
}

async function createRootActor(units: BusinessUnit[]): Promise<Actor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  return createActor(role, units, false)
}

/** Usuario de la empresa con SOLO los permisos indicados del módulo de empleados. */
async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Checadores ${s}`,
    roleSlug: `checadores-pendientes-${s}`,
    roleDescription: 'Rol temporal del spec de checadores pendientes',
    roleActive: 1,
    businessUnitId: unit.businessUnitId,
    roleManagementDays: 10,
  })
  for (const slug of permissionSlugs) {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', slug)
      .whereHas('systemModule', (query) =>
        query
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
      )
      .firstOrFail()
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }
  return createActor(role, [unit], true)
}

async function createActor(role: Role, units: BusinessUnit[], ownsRole: boolean): Promise<Actor> {
  const s = stamp()
  const email = `checadores-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Checadores',
    personSecondLastname: s,
    personEmail: email,
    businessUnitId: units[0].businessUnitId,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach(units.map((unit) => unit.businessUnitId))
  return { user, person, role: ownsRole ? role : null }
}

async function createAccessPoint(unit: BusinessUnit, name: string): Promise<AccessPoint> {
  const accessPoint = new AccessPoint()
  accessPoint.accessPointName = name
  accessPoint.businessUnitId = unit.businessUnitId
  accessPoint.accessPointActive = 1
  accessPoint.accessPointSerialNumber = `RP-${stamp()}`.slice(0, 50)
  accessPoint.accessPointStatus = 0
  await accessPoint.save()
  return accessPoint
}

async function createPivot(
  unit: BusinessUnit,
  accessPoint: AccessPoint,
  fixture: EmployeeFixture,
  status: AccessPointEmployeeSyncStatus,
  pin: string
): Promise<AccessPointEmployee> {
  const pivot = new AccessPointEmployee()
  pivot.accessPointId = accessPoint.accessPointId
  pivot.businessUnitId = unit.businessUnitId
  pivot.employeeId = fixture.employee.employeeId
  pivot.accessPointEmployeePin = pin
  pivot.accessPointEmployeeSyncStatus = status
  await pivot.save()
  return pivot
}

/** Marca abierta como la deja la reactivación. */
async function createMark(
  unit: BusinessUnit,
  fixture: EmployeeFixture,
  pivot: AccessPointEmployee,
  markedByUserId: number | null
): Promise<AccessPointResyncPending> {
  return AccessPointResyncPending.create({
    businessUnitId: unit.businessUnitId,
    employeeId: fixture.employee.employeeId,
    accessPointEmployeeId: pivot.accessPointEmployeeId,
    accessPointResyncPendingStatusAtMark: pivot.accessPointEmployeeSyncStatus,
    accessPointResyncPendingMarkedByUserId: markedByUserId,
    accessPointResyncPendingResolvedAt: null,
    accessPointResyncPendingResolution: null,
  })
}

const setPivotStatus = (pivot: AccessPointEmployee, status: string) =>
  db
    .from(AccessPointEmployee.table)
    .where('access_point_employee_id', pivot.accessPointEmployeeId)
    .update({ access_point_employee_sync_status: status })

const markRow = (markId: number) =>
  db
    .from(AccessPointResyncPending.table)
    .where('access_point_resync_pending_id', markId)
    .select('access_point_resync_pending_resolved_at', 'access_point_resync_pending_resolution')
    .first()

async function destroyFixtures(
  fixtures: EmployeeFixture[],
  actors: Actor[],
  units: BusinessUnit[]
): Promise<void> {
  const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
  if (employeeIds.length > 0) {
    const pivotIds = db
      .from(AccessPointEmployee.table)
      .whereIn('employee_id', employeeIds)
      .select('access_point_employee_id')
    await db.from(AccessPointResyncPending.table).whereIn('employee_id', employeeIds).delete()
    await db
      .from(AccessPointEmployeeEvent.table)
      .whereIn('access_point_employee_id', pivotIds)
      .delete()
    await db.from('device_commands').whereIn('employee_id', employeeIds).delete()
    await db.from(AccessPointEmployee.table).whereIn('employee_id', employeeIds).delete()
    await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
    await db.from(Employee.table).whereIn('employee_id', employeeIds).delete()
    await db
      .from(Person.table)
      .whereIn(
        'person_id',
        fixtures.map((fixture) => fixture.person.personId)
      )
      .delete()
  }
  for (const actor of actors) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await db.from(Person.table).where('person_id', actor.person.personId).delete()
    if (actor.role) {
      await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
      await db.from('roles').where('role_id', actor.role.roleId).delete()
    }
  }
  for (const unit of units) {
    const accessPointIds = db
      .from(AccessPoint.table)
      .where('business_unit_id', unit.businessUnitId)
      .select('access_point_id')
    await db.from('device_commands').whereIn('access_point_id', accessPointIds).delete()
    await db.from(AccessPoint.table).where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group('Checadores pendientes: lectura por nivel y cierre (VLRH-H1790812613831)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let root: Actor
  let fichaOnly: Actor
  let fichaAndBiometrics: Actor
  let noFicha: Actor
  /** E: P1 revoked y P2 revoke_failed, ambos marcados (CA-6, CA-7, CA-8). */
  let e: EmployeeFixture
  let p1: AccessPoint
  let p2: AccessPoint
  let pivotP1: AccessPointEmployee
  let pivotP2: AccessPointEmployee
  /** E5: una marca que se cierra al volver a asignar (CA-5). */
  let e5: EmployeeFixture
  let p5: AccessPoint
  let pivotP5: AccessPointEmployee
  let markP5: AccessPointResyncPending
  /** E9: dos marcas que la lectura oculta sin escribir (CA-9). */
  let e9: EmployeeFixture
  let p9a: AccessPoint
  let p9b: AccessPoint
  let pivotP9a: AccessPointEmployee
  let pivotP9b: AccessPointEmployee
  let markP9a: AccessPointResyncPending
  let markP9b: AccessPointResyncPending
  /** Fuera de alcance: colaborador de B y colaborador de A dado de baja (CA-12). */
  let eB: EmployeeFixture
  let eTerminated: EmployeeFixture
  const fixtures: EmployeeFixture[] = []
  const actors: Actor[] = []

  const getPendings = (client: ApiClient, fixture: EmployeeFixture, actor: Actor) =>
    client
      .get(PENDINGS_PATH(fixture.employee.employeeId))
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })

  const payloadOf = (response: ApiResponse) => response.body().data.employeeResyncPendings

  group.setup(async () => {
    await asFixture(async () => {
      unitA = await createUnit('a')
      unitB = await createUnit('b')
      root = await createRootActor([unitA, unitB])
      fichaOnly = await createTenantActor(unitA, ['tab-trabajo-read'])
      fichaAndBiometrics = await createTenantActor(unitA, [
        'tab-trabajo-read',
        'tab-biometricos-read',
      ])
      noFicha = await createTenantActor(unitA, ['tab-biometricos-read'])
      actors.push(root, fichaOnly, fichaAndBiometrics, noFicha)

      e = await createEmployee(unitA, 'Nivel')
      p1 = await createAccessPoint(unitA, `A Checador uno ${stamp()}`)
      p2 = await createAccessPoint(unitA, `B Checador dos ${stamp()}`)
      pivotP1 = await createPivot(unitA, p1, e, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED, '4001')
      pivotP2 = await createPivot(
        unitA,
        p2,
        e,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
        '4002'
      )
      await createMark(unitA, e, pivotP1, root.user.userId)
      await createMark(unitA, e, pivotP2, root.user.userId)

      e5 = await createEmployee(unitA, 'Asignar')
      p5 = await createAccessPoint(unitA, `Checador cinco ${stamp()}`)
      pivotP5 = await createPivot(unitA, p5, e5, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED, '4005')
      markP5 = await createMark(unitA, e5, pivotP5, root.user.userId)

      e9 = await createEmployee(unitA, 'Oculto')
      p9a = await createAccessPoint(unitA, `Checador nueve A ${stamp()}`)
      p9b = await createAccessPoint(unitA, `Checador nueve B ${stamp()}`)
      pivotP9a = await createPivot(
        unitA,
        p9a,
        e9,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
        '4091'
      )
      pivotP9b = await createPivot(
        unitA,
        p9b,
        e9,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
        '4092'
      )
      markP9a = await createMark(unitA, e9, pivotP9a, null)
      markP9b = await createMark(unitA, e9, pivotP9b, null)

      eB = await createEmployee(unitB, 'Ajeno')
      eTerminated = await createEmployee(unitA, 'Baja', true)
      fixtures.push(e, e5, e9, eB, eTerminated)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unitA, unitB])))

  test('CA-6: con permiso de ficha y sin biométricos solo viaja el conteo', async ({
    client,
    assert,
  }) => {
    const response = await getPendings(client, e, fichaOnly)
    response.assertStatus(200)
    assert.deepEqual(payloadOf(response), {
      employeeId: e.employee.employeeId,
      detail: 'count',
      count: 2,
    })
    const serialized = JSON.stringify(response.body())
    for (const forbidden of ['resyncPending', 'accessPointId', 'accessPointName', 'syncStatus']) {
      assert.notInclude(serialized, `"${forbidden}"`)
    }
  })

  test('CA-7: con biométricos viaja el detalle ordenado por nombre con la acción de cada checador', async ({
    client,
    assert,
  }) => {
    const response = await getPendings(client, e, fichaAndBiometrics)
    response.assertStatus(200)
    const payload = payloadOf(response)
    assert.equal(payload.detail, 'full')
    assert.equal(payload.count, 2)
    assert.deepEqual(
      payload.resyncPending.map((row: Record<string, unknown>) => [
        row.accessPointId,
        row.accessPointName,
        row.syncStatus,
        row.requiredAction,
      ]),
      [
        [
          p1.accessPointId,
          p1.accessPointName,
          ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
          ACCESS_POINT_RESYNC_REQUIRED_ACTION.ASSIGN,
        ],
        [
          p2.accessPointId,
          p2.accessPointName,
          ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
          ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN,
        ],
      ]
    )
    for (const row of payload.resyncPending) {
      assert.isNumber(row.accessPointResyncPendingId)
      assert.isString(row.markedAt)
    }
    // Root también recibe el detalle (bypass)
    const asRoot = await getPendings(client, e, root)
    asRoot.assertStatus(200)
    assert.equal(payloadOf(asRoot).detail, 'full')
  })

  test('CA-8: tras forzar el borrado, la acción del checador pasa a asignar', async ({
    client,
    assert,
  }) => {
    const forced = await client
      .post(`/api/access-points/${p2.accessPointId}/employee/${e.employee.employeeId}/revoke/force`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .json({ reason: 'el equipo no responde (spec)' })
    forced.assertStatus(200)
    const pivotRow = await db
      .from(AccessPointEmployee.table)
      .where('access_point_employee_id', pivotP2.accessPointEmployeeId)
      .select('access_point_employee_sync_status')
      .first()
    assert.equal(
      pivotRow!.access_point_employee_sync_status,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
    )

    const response = await getPendings(client, e, fichaAndBiometrics)
    response.assertStatus(200)
    const p2Row = payloadOf(response).resyncPending.find(
      (row: Record<string, unknown>) => row.accessPointId === p2.accessPointId
    )
    assert.exists(p2Row)
    assert.equal(p2Row.syncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
    assert.equal(p2Row.requiredAction, ACCESS_POINT_RESYNC_REQUIRED_ACTION.ASSIGN)
  })

  test('CA-5: volver a asignar en el checador cierra la marca como assigned y deja de contar', async ({
    client,
    assert,
  }) => {
    const before = await getPendings(client, e5, fichaOnly)
    assert.equal(payloadOf(before).count, 1)

    const assigned = await client
      .post(`/api/access-points/${p5.accessPointId}/employee/${e5.employee.employeeId}`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
    assert.equal(assigned.status(), 201, JSON.stringify(assigned.body()))

    const mark = await markRow(markP5.accessPointResyncPendingId)
    assert.isNotNull(mark!.access_point_resync_pending_resolved_at)
    assert.equal(
      mark!.access_point_resync_pending_resolution,
      ACCESS_POINT_RESYNC_RESOLUTION.ASSIGNED
    )

    const after = await getPendings(client, e5, fichaOnly)
    assert.equal(payloadOf(after).count, 0)
  })

  test('CA-9: un vínculo que salió del camino de baja, uno retirado o un checador dado de baja no se listan, y las marcas siguen abiertas', async ({
    client,
    assert,
  }) => {
    const initial = await getPendings(client, e9, fichaAndBiometrics)
    assert.equal(payloadOf(initial).count, 2)

    await setPivotStatus(pivotP9a, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
    await db
      .from(AccessPointEmployee.table)
      .where('access_point_employee_id', pivotP9b.accessPointEmployeeId)
      .update({ access_point_employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })

    const hidden = await getPendings(client, e9, fichaAndBiometrics)
    assert.deepEqual(payloadOf(hidden), {
      employeeId: e9.employee.employeeId,
      detail: 'full',
      count: 0,
      resyncPending: [],
    })
    // La lectura no escribe: ambas marcas siguen abiertas
    for (const mark of [markP9a, markP9b]) {
      const row = await markRow(mark.accessPointResyncPendingId)
      assert.isNull(row!.access_point_resync_pending_resolved_at)
    }

    // Checador dado de baja: el vínculo vuelve a estar en camino de baja pero el equipo no
    await setPivotStatus(pivotP9a, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
    await db
      .from(AccessPoint.table)
      .where('access_point_id', p9a.accessPointId)
      .update({ access_point_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
    const withoutDevice = await getPendings(client, e9, fichaAndBiometrics)
    assert.equal(payloadOf(withoutDevice).count, 0)
  })

  test('CA-11: sin permiso de ver la ficha responde 403 aunque tenga biométricos', async ({
    client,
    assert,
  }) => {
    const response = await getPendings(client, e, noFicha)
    response.assertStatus(403)
    assert.deepEqual(Object.keys(response.body()).sort(), [
      'code',
      'detail',
      'key',
      'title',
      'type',
    ])
    assert.equal(response.body().type, 'error')
    assert.equal(response.body().key, 'sin-permiso')
    assert.equal(response.body().code, 'ADMS.AUTHZ.002')
  })

  test('CA-12: colaborador de otra empresa, dado de baja o inexistente responde el mismo 404', async ({
    client,
    assert,
  }) => {
    const bodies: Array<Record<string, unknown>> = []
    for (const target of [eB, eTerminated]) {
      const response = await getPendings(client, target, fichaAndBiometrics)
      response.assertStatus(404)
      bodies.push(response.body())
    }
    const missing = await client
      .get(PENDINGS_PATH(999_999_999))
      .loginAs(fichaAndBiometrics.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
    missing.assertStatus(404)
    bodies.push(missing.body())
    for (const body of bodies) {
      assert.equal(body.type, 'error')
      assert.equal(body.key, 'colaborador-no-encontrado')
      assert.equal(body.code, 'ADMS.AUTHZ.001')
    }
    assert.deepEqual(bodies[0], bodies[1])
    assert.deepEqual(bodies[1], bodies[2])
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import SystemSetting from '#models/system_setting'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import SyncAssistsService from '#services/sync_assists_service'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { ASSIST_LOCATION_FLAG, type AssistLocationFlag } from '#constants/assist_location_flag'
import { EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS } from '#constants/employees_attendance_monitor_permission_declarations'
import type { AttendanceMonitorActionSlug } from '#constants/attendance_monitor_permission_catalog'
import {
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  grantRoleModulePermissions,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * VLRH-H1791056345261 — la marca de ubicación viaja en el detalle del día
 * (`GET /api/v1/assists`) solo para quien puede verla: CA-01, CA-03 a CA-08,
 * CA-13 y CA-15.
 *
 * Fixture: el martes 2026-10-06 en `America/Mexico_City` (UTC-6), el empleado E
 * de la empresa A checa 08:02 `simulated`, 14:00 sin marca y 15:00
 * `unverified`. Las checadas se siembran directo en `assists`: la marca solo la
 * escribe la ingesta.
 */

const MONITOR_MODULE = EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS.inactivateAssist.module
const READ = 'read' satisfies AttendanceMonitorActionSlug
const OTHER_ACTION = 'read-time-worked' satisfies AttendanceMonitorActionSlug

const DAY = '2026-10-06'
const SITE_ZONE = 'America/Mexico_City'

interface Tenant {
  actor: TenantActor
  fixture: EmployeeFixture
  employeeId: number
  employeeCode: string
  shiftId: number
  /** assistId → marca sembrada. */
  seeded: Map<number, AssistLocationFlag | null>
}

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createTenant(prefix: string): Promise<Tenant> {
  const actor = await createTenantActor(prefix)
  const businessUnitId = actor.businessUnit.businessUnitId
  const fixture = await createEmployeeFixture(businessUnitId, prefix)
  await SystemSetting.create({
    businessUnitId,
    systemSettingTradeName: `Proyeccion ${prefix} ${Date.now()}`,
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
  })
  // El detalle del día responde 400 a un empleado sin turno.
  const shift = await Shift.create({
    shiftName: `Turno proyeccion ${prefix} ${Date.now()}`,
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00:00',
    shiftActiveHours: 8,
    shiftRestDays: '7',
    shiftAccumulatedFault: 0,
    businessUnitId,
    shiftTemp: 0,
  })
  await EmployeeShift.create({
    employeeId: fixture.employee.employeeId,
    shiftId: shift.shiftId,
    businessUnitId,
    employeShiftsApplySince: '2024-01-01',
  })
  return {
    actor,
    fixture,
    employeeId: fixture.employee.employeeId,
    employeeCode: String(fixture.employee.employeeCode),
    shiftId: shift.shiftId,
    seeded: new Map(),
  }
}

async function cleanupTenant(tenant: Tenant | null) {
  if (!tenant) return
  const businessUnitId = tenant.actor.businessUnit.businessUnitId
  await db.from('assists').where('assist_emp_id', tenant.employeeId).delete()
  await db.from('employee_assist_calendars').where('employee_id', tenant.employeeId).delete()
  await db.from('assist_calendar_recalc_jobs').where('employee_id', tenant.employeeId).delete()
  await db.from('employee_shifts').where('employee_id', tenant.employeeId).delete()
  await db.from('shifts').where('shift_id', tenant.shiftId).delete()
  await db.from('system_settings').where('business_unit_id', businessUnitId).delete()
  await cleanupEmployeeFixture(tenant.fixture)
  await cleanupTenantActor(tenant.actor)
}

let syncId = 0

/** Siembra una checada del martes a la hora local dada, con su marca. */
async function seedPunch(tenant: Tenant, localTime: string, flag: AssistLocationFlag | null) {
  if (syncId === 0) {
    const row = (await db.from('assists').max('assist_sync_id as max').first()) as {
      max: number | null
    }
    syncId = Number(row.max ?? 0) + 1_000
  }
  syncId += 1
  const utc = DateTime.fromISO(`${DAY}T${localTime}`, { zone: SITE_ZONE })
    .toUTC()
    .toFormat('yyyy-LL-dd HH:mm:ss')
  const [assistId] = await db.table('assists').insert({
    assist_emp_code: tenant.employeeCode,
    assist_emp_id: tenant.employeeId,
    business_unit_id: tenant.actor.businessUnit.businessUnitId,
    assist_punch_time: utc,
    assist_punch_time_utc: utc,
    assist_punch_time_origin: utc,
    assist_upload_time: utc,
    assist_sync_id: syncId,
    assist_terminal_sn: 'TEST-LOCATION-FLAG',
    assist_terminal_alias: 'TEST-LOCATION-FLAG',
    assist_area_alias: 'TEST',
    assist_active: 1,
    assist_type: 'check',
    assist_location_flag: flag,
  })
  tenant.seeded.set(Number(assistId), flag)
}

async function addUser(businessUnitId: number, role: Role, label: string): Promise<UnitUser> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: 'Lector',
    personLastname: 'Spec',
    personSecondLastname: label,
    personEmail: `person-${label}-${stamp}@gsti-tests.local`,
    businessUnitId,
  })
  const user = await User.create({
    userEmail: `projection-${label}-${stamp}@gsti-tests.local`,
    userPassword: 'LocationFlag123!',
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [businessUnitId], role.roleId)
  return { user, person }
}

async function createRole(tenant: Tenant, label: string): Promise<Role> {
  const stamp = uniqueStamp()
  return Role.create({
    roleName: `Proyeccion ${label} ${stamp}`,
    roleSlug: `proyeccion-${label}-${stamp}`,
    roleDescription: 'Rol temporal de spec',
    roleActive: 1,
    roleManagementDays: 10,
    businessUnitId: tenant.actor.businessUnit.businessUnitId,
  })
}

function getDay(
  client: ApiClient,
  user: User,
  businessUnitPublicId: string,
  employeeId: number | string | null
) {
  const qs: Record<string, unknown> = { 'date': DAY, 'date-end': DAY }
  if (employeeId !== null) qs.employeeId = employeeId
  return client
    .get('/api/v1/assists')
    .qs(qs)
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnitPublicId)
}

/** Todos los objetos de checada del cuerpo: `assitFlatList` y los cuatro momentos. */
function punchObjects(value: unknown, found: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) punchObjects(item, found)
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.assistId === 'number') found.push(record)
    for (const child of Object.values(record)) punchObjects(child, found)
  }
  return found
}

function assertNoFlag(assert: Assert, label: string, body: unknown) {
  assert.notInclude(JSON.stringify(body), 'assistLocationFlag', label)
}

/** Cada objeto de checada trae la clave, con el valor sembrado. */
function assertFlags(assert: Assert, label: string, tenant: Tenant, body: unknown) {
  const punches = punchObjects(body)
  assert.isAbove(punches.length, 0, `${label}: sin checadas en la respuesta`)
  const seen = new Set<number>()
  for (const punch of punches) {
    assert.property(punch, 'assistLocationFlag', label)
    const assistId = punch.assistId as number
    assert.equal(punch.assistLocationFlag, tenant.seeded.get(assistId), `${label}: ${assistId}`)
    seen.add(assistId)
  }
  assert.sameMembers([...seen], [...tenant.seeded.keys()], label)
}

test.group('Marca de ubicación en el detalle del día (VLRH-H1791056345261)', (group) => {
  let a: Tenant | null = null
  let b: Tenant | null = null
  const users: UnitUser[] = []

  group.setup(async () => {
    a = await createTenant('pry-a')
    b = await createTenant('pry-b')
    await grantModulePermissions(a.actor, MONITOR_MODULE, [READ])
    await seedPunch(a, '08:02:00', ASSIST_LOCATION_FLAG.SIMULATED)
    await seedPunch(a, '14:00:00', null)
    await seedPunch(a, '15:00:00', ASSIST_LOCATION_FLAG.UNVERIFIED)
    await seedPunch(b, '08:05:00', ASSIST_LOCATION_FLAG.SIMULATED)
  })

  group.teardown(async () => {
    for (const user of users.splice(0)) await cleanupUnitUser(user)
    await cleanupTenant(a)
    await cleanupTenant(b)
  })

  const publicId = (tenant: Tenant) => tenant.actor.businessUnit.businessUnitPublicId

  test('CA-01: RH con read del monitor recibe la marca de cada checada', async ({
    client,
    assert,
  }) => {
    const response = await getDay(client, a!.actor.user, publicId(a!), a!.employeeId)
    response.assertStatus(200)
    assertFlags(assert, 'RH de A', a!, response.body())
  })

  test('CA-03: sin read del monitor la clave no viaja', async ({ client, assert }) => {
    const withoutRead = await createRole(a!, 'sin-read')
    await grantRoleModulePermissions(withoutRead, MONITOR_MODULE, [OTHER_ACTION])
    const reader = await addUser(a!.actor.businessUnit.businessUnitId, withoutRead, 'sin-read')
    users.push(reader)

    const response = await getDay(client, reader.user, publicId(a!), a!.employeeId)
    response.assertStatus(200)
    assert.isAbove(punchObjects(response.body()).length, 0)
    assertNoFlag(assert, 'sin read', response.body())
  })

  test('CA-04: el propio empleado no ve su marca, aunque tenga read', async ({
    client,
    assert,
  }) => {
    const self = await addUser(a!.actor.businessUnit.businessUnitId, a!.actor.role, 'propio')
    users.push(self)
    await db
      .from('employees')
      .where('employee_id', a!.employeeId)
      .update({ person_id: self.person.personId })
    try {
      const active = await getDay(client, self.user, publicId(a!), a!.employeeId)
      active.assertStatus(200)
      assertNoFlag(assert, 'propio activo', active.body())

      await db
        .from('employees')
        .where('employee_id', a!.employeeId)
        .update({ employee_deleted_at: new Date() })
      const terminated = await getDay(client, self.user, publicId(a!), a!.employeeId)
      assertNoFlag(assert, 'propio de baja', terminated.body())
    } finally {
      await db
        .from('employees')
        .where('employee_id', a!.employeeId)
        .update({ person_id: a!.fixture.person.personId, employee_deleted_at: null })
    }
  })

  test('CA-05: el permiso se lee con el rol de la empresa activa', async ({ client, assert }) => {
    // El RH de A también es miembro de B, con un rol de B sin read.
    const roleB = await createRole(b!, 'b-sin-read')
    await grantRoleModulePermissions(roleB, MONITOR_MODULE, [OTHER_ACTION])
    await attachBusinessUnitsWithRole(
      a!.actor.user,
      [b!.actor.businessUnit.businessUnitId],
      roleB.roleId
    )

    const inB = await getDay(client, a!.actor.user, publicId(b!), b!.employeeId)
    inB.assertStatus(200)
    assert.isAbove(punchObjects(inB.body()).length, 0)
    assertNoFlag(assert, 'RH de A con B activa', inB.body())

    // Y con A activa la sigue viendo.
    const inA = await getDay(client, a!.actor.user, publicId(a!), a!.employeeId)
    assertFlags(assert, 'RH de A con A activa', a!, inA.body())
  })

  test('CA-05: un usuario de otra empresa no recibe checadas ni marca de E', async ({
    client,
    assert,
  }) => {
    await grantModulePermissions(b!.actor, MONITOR_MODULE, [READ])
    try {
      const response = await getDay(client, b!.actor.user, publicId(b!), a!.employeeId)
      assert.lengthOf(punchObjects(response.body()), 0)
      assertNoFlag(assert, 'X de B', response.body())
    } finally {
      await grantModulePermissions(b!.actor, MONITOR_MODULE, [])
    }
  })

  test('CA-06 y CA-15: el dueño la ve; root y plataforma no', async ({ client, assert }) => {
    const businessUnitId = a!.actor.businessUnit.businessUnitId
    const owner = await createBypassUserInBusinessUnit('owner', 'pry-owner', businessUnitId)
    const root = await createBypassUserInBusinessUnit('root', 'pry-root', businessUnitId)
    const platform = await addUser(businessUnitId, a!.actor.role, 'plataforma')
    await db.from('users').where('user_id', platform.user.userId).update({ is_platform_admin: 1 })
    users.push(owner, root, platform)

    const asOwner = await getDay(client, owner.user, publicId(a!), a!.employeeId)
    asOwner.assertStatus(200)
    assertFlags(assert, 'owner', a!, asOwner.body())

    for (const [label, unitUser] of [
      ['root', root],
      ['plataforma', platform],
    ] as const) {
      const response = await getDay(client, unitUser.user, publicId(a!), a!.employeeId)
      response.assertStatus(200)
      assertNoFlag(assert, label, response.body())
    }
  })

  test('CA-07: id no entero estricto: misma respuesta y sin marca ({value})')
    .with([{ value: '12abc' }, { value: '0' }, { value: '-3' }])
    .run(async ({ client, assert }, row) => {
      const response = await getDay(client, a!.actor.user, publicId(a!), row.value)
      assert.notEqual(response.status(), 500)
      assertNoFlag(assert, row.value, response.body())
    })

  test('CA-07: con el módulo inactivo la clave no viaja', async ({ client, assert }) => {
    await db
      .from('system_modules')
      .where('system_module_slug', MONITOR_MODULE)
      .update({ system_module_active: 0 })
    try {
      const response = await getDay(client, a!.actor.user, publicId(a!), a!.employeeId)
      response.assertStatus(200)
      assertNoFlag(assert, 'módulo inactivo', response.body())
    } finally {
      await db
        .from('system_modules')
        .where('system_module_slug', MONITOR_MODULE)
        .update({ system_module_active: 1 })
    }
  })

  test('CA-08: los demás llamadores no reciben la marca y los cálculos no cambian', async ({
    client,
    assert,
  }) => {
    const params = { date: DAY, dateEnd: DAY, employeeID: a!.employeeId }
    const scope = [a!.actor.businessUnit.businessUnitId]
    const plain = await TenantContext.run(scope, () => new SyncAssistsService().index(params))
    const flagged = await TenantContext.run(scope, () =>
      new SyncAssistsService().index(params, undefined, { includeAssistLocationFlag: true })
    )
    assertNoFlag(assert, 'index sin opción', plain)
    assertFlags(assert, 'index con opción', a!, flagged)

    // Quitando la marca, la respuesta es idéntica: tiempos, retardos y faltas.
    const stripped = JSON.parse(JSON.stringify(flagged), (key, value) =>
      key === 'assistLocationFlag' ? undefined : value
    )
    assert.deepEqual(stripped, JSON.parse(JSON.stringify(plain)))

    const flat = await client
      .get('/api/v1/assists/get-flat-list')
      .qs({ employeeId: a!.employeeId, dateStart: DAY, dateEnd: DAY })
      .loginAs(a!.actor.user)
      .header('X-Business-Unit-Id', publicId(a!))
    flat.assertStatus(200)
    assertNoFlag(assert, 'get-flat-list', flat.body())
  })

  test('CA-13: sin employeeId responde 400 como hoy', async ({ client, assert }) => {
    const response = await getDay(client, a!.actor.user, publicId(a!), null)
    response.assertStatus(400)
    assert.equal(response.body().type, 'warning')
    assertNoFlag(assert, 'sin employeeId', response.body())
  })
})

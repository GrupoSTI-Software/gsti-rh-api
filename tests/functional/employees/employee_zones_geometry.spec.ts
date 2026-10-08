import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeZone from '#models/employee_zone'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/**
 * Lectura de las zonas en el expediente (VLRH-H1791056339679).
 *
 * `GET /api/employees/:employeeId/zones` lee el dibujo de cada zona con el mismo
 * parser que la comprobación de zona: responde 200 aunque una zona tenga el dibujo
 * dañado, entrega un anillo cerrado `[lng, lat][]` por área y solo de las zonas de
 * la empresa del empleado. Fixtures espejados de
 * `employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`.
 */

const TEST_PASSWORD = 'EmployeeZonesGeometry123!'

type Position = [number, number]

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
}

interface ZonesBody {
  type: string
  title: string
  data: {
    data: { data: unknown[] }
    coordinates: Position[][]
  }
}

const POLY_RING: Position[] = [
  [-103.355, 20.673],
  [-103.353, 20.673],
  [-103.353, 20.675],
  [-103.355, 20.675],
  [-103.355, 20.673],
]
const LINE: Position[] = [
  [-103.365, 20.683],
  [-103.363, 20.683],
  [-103.363, 20.685],
  [-103.365, 20.685],
]
const shift = (ring: Position[], lng: number): Position[] =>
  ring.map(([x, y]): Position => [Number((x + lng).toFixed(3)), y])
const RING_A = shift(POLY_RING, 0.01)
const RING_B = shift(POLY_RING, 0.02)

const feature = (geometry: object) => ({ type: 'Feature', properties: {}, geometry })
const collection = (...geometries: object[]) =>
  JSON.stringify({ type: 'FeatureCollection', features: geometries.map(feature) })

const Z_POLY = collection({ type: 'Polygon', coordinates: [POLY_RING] })
const Z_LINE = collection({ type: 'LineString', coordinates: LINE })
const Z_MIXED = collection(
  { type: 'Point', coordinates: [-103.3, 20.7] },
  { type: 'Polygon', coordinates: [RING_A] },
  { type: 'Polygon', coordinates: [RING_B] }
)
const Z_MULTI = JSON.stringify(feature({ type: 'MultiPolygon', coordinates: [[RING_A], [RING_B]] }))
const Z_BROKEN = '{"type":"FeatureCollection","features":['
const Z_EMPTY_ARRAY = '[]'

async function uniqueStamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "employees:${permissionSlug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({ roleId, systemPermissionId: await permissionId(slug) })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Zonas geometria pruebas ${stamp}`,
    businessUnitSlug: `zonas-geometria-pruebas-${stamp}`,
    businessUnitLegalName: `Zonas geometria pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Zonas geometria pruebas ${stamp}`,
    roleSlug: `zonas-geometria-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para la lectura de zonas del expediente',
    roleActive: 1,
    businessUnitId: businessUnit.businessUnitId,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'EmployeeZonesGeometry',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, role }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'ZonasGeometria',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
  })
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const employeeInsert = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'ZonasGeometria',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: Number(departmentInsert[0]),
    position_id: Number(positionInsert[0]),
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  return {
    employee: await TenantContext.runUnscoped(
      () => Employee.findOrFail(Number(employeeInsert[0])),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    ),
    person,
    departmentId: Number(departmentInsert[0]),
    positionId: Number(positionInsert[0]),
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  await db.from('employee_zones').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

/**
 * Zona con el dibujo indicado. Se inserta directo en la tabla porque el hook de
 * `Zone` exige una empresa activa en el alcance y aquí hace falta también la zona
 * que sigue sin empresa (`businessUnitId` nulo).
 */
async function createZone(zonePolygon: string, businessUnitId: number | null): Promise<number> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const [zoneId] = await db.table('zones').insert({
    business_unit_id: businessUnitId,
    zone_name: `Zona geometria ${stamp}`,
    zone_address: 'Calle de prueba',
    zone_polygon: zonePolygon,
    zone_created_at: now,
    zone_updated_at: now,
  })
  return Number(zoneId)
}

/** Deja al empleado exactamente con estas zonas asignadas, en este orden. */
async function assignOnly(employee: Employee, zoneIds: number[]) {
  await db.from('employee_zones').where('employee_id', employee.employeeId).delete()
  await TenantContext.runUnscoped(async () => {
    for (const zoneId of zoneIds) {
      await EmployeeZone.create({
        employeeId: employee.employeeId,
        businessUnitId: employee.businessUnitId,
        zoneId,
      })
    }
  }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function buHeader(actor: TenantActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

async function tableCounts() {
  const [zones] = await db.from('zones').count('* as total')
  const [assignments] = await db.from('employee_zones').count('* as total')
  return { zones: Number(zones.total), assignments: Number(assignments.total) }
}

test.group('Expediente - lectura de las zonas del empleado', (group) => {
  let actor: TenantActor | null = null
  let otherActor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let otherFixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let previousEnforcement: boolean
  const zoneIds: number[] = []

  const zone = async (zonePolygon: string, businessUnitId: number | null) => {
    const zoneId = await createZone(zonePolygon, businessUnitId)
    zoneIds.push(zoneId)
    return zoneId
  }

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    previousEnforcement = employeesModule.systemModulePermissionEnforcementActive
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('zg-a')
    otherActor = await createActor('zg-b')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'zg-a')
    otherFixture = await createEmployeeFixture(otherActor.businessUnit.businessUnitId, 'zg-b')
    await grantOnly(actor.role.roleId, ['tab-zonas-read'])
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupEmployeeFixture(otherFixture)
      if (zoneIds.length) await db.from('zones').whereIn('zone_id', zoneIds).delete()
      await cleanupActor(actor)
      await cleanupActor(otherActor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = previousEnforcement
      await employeesModule.save()
    }
  })

  const getZones = (client: ApiClient, employeeId: number) =>
    client.get(`/api/employees/${employeeId}/zones`).loginAs(actor!.user).headers(buHeader(actor!))

  test('CA-01: una zona dañada sigue listada y no tumba la consulta', async ({ client, assert }) => {
    const businessUnitId = actor!.businessUnit.businessUnitId
    const poly = await zone(Z_POLY, businessUnitId)
    const line = await zone(Z_LINE, businessUnitId)

    for (const damaged of [Z_BROKEN, Z_EMPTY_ARRAY]) {
      await assignOnly(fixture!.employee, [poly, line, await zone(damaged, businessUnitId)])
      const response = await getZones(client, fixture!.employee.employeeId)

      response.assertStatus(200)
      const body = response.body() as ZonesBody
      assert.equal(body.type, 'success')
      assert.lengthOf(body.data.data.data, 3)
      assert.lengthOf(body.data.coordinates, 2)
    }
  })

  test('CA-02: polígono y línea se entregan con la misma forma, cerrados', async ({ client, assert }) => {
    const businessUnitId = actor!.businessUnit.businessUnitId
    await assignOnly(fixture!.employee, [await zone(Z_POLY, businessUnitId), await zone(Z_LINE, businessUnitId)])

    const response = await getZones(client, fixture!.employee.employeeId)

    response.assertStatus(200)
    const [polyRing, lineRing] = (response.body() as ZonesBody).data.coordinates
    for (const ring of [polyRing, lineRing]) {
      for (const point of ring) {
        assert.lengthOf(point, 2)
        assert.isTrue(point.every((value) => typeof value === 'number'))
      }
    }
    assert.deepEqual(polyRing, POLY_RING)
    assert.deepEqual(lineRing, [...LINE, LINE[0]])
  })

  test('CA-03: se leen todas las piezas del dibujo y el punto no es un área', async ({ client, assert }) => {
    const businessUnitId = actor!.businessUnit.businessUnitId
    for (const drawing of [Z_MIXED, Z_MULTI]) {
      await assignOnly(fixture!.employee, [await zone(drawing, businessUnitId)])
      const response = await getZones(client, fixture!.employee.employeeId)

      response.assertStatus(200)
      assert.deepEqual((response.body() as ZonesBody).data.coordinates, [RING_A, RING_B])
    }
  })

  test('CA-04: las zonas de otra empresa o sin empresa no entregan su dibujo', async ({ client, assert }) => {
    await assignOnly(fixture!.employee, [
      await zone(Z_POLY, actor!.businessUnit.businessUnitId),
      await zone(Z_POLY, otherActor!.businessUnit.businessUnitId),
      await zone(Z_POLY, null),
    ])

    const response = await getZones(client, fixture!.employee.employeeId)

    response.assertStatus(200)
    const body = response.body() as ZonesBody
    assert.lengthOf(body.data.data.data, 3)
    assert.deepEqual(body.data.coordinates, [POLY_RING])
  })

  test('CA-05: empleado de otra empresa da 404 y sin permiso da 403', async ({ client, assert }) => {
    const notFound = await getZones(client, otherFixture!.employee.employeeId)

    notFound.assertStatus(404)
    assert.deepEqual(notFound.body(), {
      type: 'warning',
      title: 'The employee was not found',
      message: 'The employee was not found with the entered ID',
      data: { employeeId: String(otherFixture!.employee.employeeId) },
    })

    await grantOnly(actor!.role.roleId, [])
    try {
      const denied = await getZones(client, fixture!.employee.employeeId)
      denied.assertStatus(403)
      assert.equal(denied.body()?.key, 'PERM.DENIED')
      assert.equal(denied.body()?.title, 'Sin permiso')
    } finally {
      await grantOnly(actor!.role.roleId, ['tab-zonas-read'])
    }
  })

  test('CA-06: la consulta no escribe zonas ni asignaciones', async ({ client, assert }) => {
    const businessUnitId = actor!.businessUnit.businessUnitId
    await assignOnly(fixture!.employee, [
      await zone(Z_POLY, businessUnitId),
      await zone(Z_BROKEN, businessUnitId),
      await zone(Z_POLY, null),
    ])
    const before = await tableCounts()

    const response = await getZones(client, fixture!.employee.employeeId)

    response.assertStatus(200)
    assert.deepEqual(await tableCounts(), before)
  })
})

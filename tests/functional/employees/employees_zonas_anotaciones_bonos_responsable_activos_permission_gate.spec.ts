import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeZone from '#models/employee_zone'
import EmployeeAnnotation from '#models/employee_annotation'
import EmployeeBonus from '#models/employee_bonus'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import Zone from '#models/zone'
import SupplyType from '#models/supply_type'
import Supply from '#models/supplie'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'

const TEST_PASSWORD = 'ZonasActivosPermissionGate123!'
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface SystemActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  roleId: number
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
}

interface SupplyFixture {
  supplyType: SupplyType
  supply: Supply
}

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

async function activeEmployeesGrants(roleId: number) {
  return RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery
        .whereNull('system_permission_deleted_at')
        .whereHas('systemModule', (moduleQuery) =>
          moduleQuery.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
        )
    )
}

async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await activeEmployeesGrants(roleId)
  for (const grant of grants) await grant.delete()
  return grants
}

async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Zonas activos pruebas ${stamp}`,
    businessUnitSlug: `zonas-activos-pruebas-${stamp}`,
    businessUnitLegalName: `Zonas activos pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Zonas activos pruebas ${stamp}`,
    roleSlug: `zonas-activos-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para la matriz de permisos de zonas y activos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'ZonasActivosPermissionGate',
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

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Zonas activos sistema ${stamp}`,
    businessUnitSlug: `zonas-activos-sistema-${stamp}`,
    businessUnitLegalName: `Zonas activos sistema legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const person = await Person.create({
    personFirstname: 'ZonasActivosSystem',
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
  return { user, person, businessUnit, roleId: role.roleId }
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

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'ZonasActivos',
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
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'ZonasActivos',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: Number(departmentInsert[0]),
    position_id: Number(positionInsert[0]),
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  return {
    employee: await Employee.findOrFail(Number(employeeInsert[0])),
    person,
    departmentId: Number(departmentInsert[0]),
    positionId: Number(positionInsert[0]),
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  const employeeSupplies = await db
    .from('employee_supplies')
    .where('employee_id', employeeId)
    .select('employee_supply_id')
  const supplyIds = employeeSupplies.map((supply) => supply.employee_supply_id)
  if (supplyIds.length) {
    await db.from('employee_supplie_assignation_photos').whereIn('employee_supply_id', supplyIds).delete()
    await db.from('employee_supplies_response_contracts').whereIn('employee_supply_id', supplyIds).delete()
  }
  await db.from('employee_supplies').where('employee_id', employeeId).delete()
  await db.from('employee_zones').where('employee_id', employeeId).delete()
  await db.from('employee_annotations').where('employee_id', employeeId).delete()
  await db.from('employee_bonuses').where('employee_id', employeeId).delete()
  await db.from('user_responsible_employees').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createZoneFixture(prefix: string) {
  const stamp = await uniqueStamp()
  return Zone.create({
    zoneName: `Zona ${prefix} ${stamp}`,
    zoneAddress: 'Calle de prueba',
    zonePolygon: '[]',
  })
}

async function cleanupZone(zone: Zone | null) {
  if (zone) await Zone.query().where('zone_id', zone.zoneId).delete()
}

async function createSupplyFixture(prefix: string): Promise<SupplyFixture> {
  const stamp = await uniqueStamp()
  const supplyType = await SupplyType.create({
    supplyTypeName: `Tipo ${prefix} ${stamp}`,
    supplyTypeSlug: `tipo-${prefix}-${stamp}`,
  })
  const supply = await Supply.create({
    supplyFileNumber: Number(`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-9)),
    supplyName: `Herramienta ${prefix} ${stamp}`,
    supplyTypeId: supplyType.supplyTypeId,
    supplyStatus: 'active',
  })
  return { supplyType, supply }
}

async function cleanupSupplyFixture(fixture: SupplyFixture | null) {
  if (!fixture) return
  await Supply.query().where('supply_id', fixture.supply.supplyId).delete()
  await SupplyType.query().where('supply_type_id', fixture.supplyType.supplyTypeId).delete()
}

function bonusPayload(employeeId: number) {
  return {
    employeeId,
    employeeBonusConcept: 'Bono de asistencia',
    employeeBonusQuantity: 1,
    employeeBonusUnitAmount: 100,
    employeeBonusTotal: 100,
    employeeBonusAssignmentDate: '2026-08-01',
    employeeBonusPaymentDate: '2026-08-15',
  }
}

function assertNotPermissionDenied(assert: any, response: any) {
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

function assertPermissionDenied(assert: any, response: any) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
}

function buHeader(actor: TenantActor | SystemActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

async function disableEnforcementAndVerify(employeesModule: SystemModule) {
  employeesModule.systemModulePermissionEnforcementActive = false
  await employeesModule.save()
  const reloaded = await SystemModule.findOrFail(employeesModule.systemModuleId)
  if (reloaded.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
  }
}

test.group('Zonas/Anotaciones/Bonos/Responsable/Activos - soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  const zones: Zone[] = []
  const supplies: SupplyFixture[] = []

  group.setup(async () => {
    await new SystemPermissionCatalogSyncService().sync()
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('za-off')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'off')
    await grantOnly(actor.role.roleId, [])
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
      for (const supply of supplies) await cleanupSupplyFixture(supply)
      for (const zone of zones) await cleanupZone(zone)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('sin grants: las escrituras representativas no responden PERM.DENIED', async ({ client, assert }) => {
    const employeeId = fixture!.employee.employeeId
    const zone = await createZoneFixture('off')
    const supplyFixture = await createSupplyFixture('off')
    zones.push(zone)
    supplies.push(supplyFixture)
    const assignment = await EmployeeSupplie.create({
      employeeId,
      supplyId: supplyFixture.supply.supplyId,
      employeeSupplyStatus: 'active',
      employeeSupplyAssignamentDate: DateTime.now(),
    })
    const ops = [
      client.post('/api/employee-zones').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId, zoneId: zone.zoneId }),
      client.post('/api/employee-annotations').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId, employeeAnnotationContent: 'Nota de prueba' }),
      client.post('/api/employee-bonuses').loginAs(actor!.user).headers(buHeader(actor!)).json(bonusPayload(employeeId)),
      client.post('/api/user-responsible-employees').loginAs(actor!.user).headers(buHeader(actor!)).json({ userId: actor!.user.userId, employeeId }),
      client.post('/api/employee-supplies').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId, supplyId: supplyFixture.supply.supplyId, employeeSupplyAssignamentDate: '2026-08-01' }),
      client.post(`/api/employee-supply-assignation-photos/${assignment.employeeSupplyId}/assignation`).loginAs(actor!.user).file('photos', VALID_PNG_BUFFER, { filename: 'evidencia.png', contentType: 'image/png' }),
    ]
    for (const pending of ops) assertNotPermissionDenied(assert, await pending)
  })
})

test.group('Zonas/Anotaciones/Bonos/Responsable/Activos - matriz con exigencia ON', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  const zones: Zone[] = []
  const supplies: SupplyFixture[] = []

  group.setup(async () => {
    await new SystemPermissionCatalogSyncService().sync()
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('za-on')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'on')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
      for (const supply of supplies) await cleanupSupplyFixture(supply)
      for (const zone of zones) await cleanupZone(zone)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('zonas sí y bonificaciones no: la zona queda y la bonificación no se registra', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-zonas-write'])
    const zone = await createZoneFixture('sep')
    zones.push(zone)
    const zoneRes = await client.post('/api/employee-zones').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId: fixture!.employee.employeeId, zoneId: zone.zoneId })
    assertNotPermissionDenied(assert, zoneRes)
    const storedZone = await EmployeeZone.query().where('employee_id', fixture!.employee.employeeId).where('zone_id', zone.zoneId).whereNull('employee_zone_deleted_at').first()
    assert.isNotNull(storedZone)
    const bonusRes = await client.post('/api/employee-bonuses').loginAs(actor!.user).headers(buHeader(actor!)).json(bonusPayload(fixture!.employee.employeeId))
    assertPermissionDenied(assert, bonusRes)
    const bonusCount = await EmployeeBonus.query().where('employee_id', fixture!.employee.employeeId).whereNull('employee_bonus_deleted_at')
    assert.equal(bonusCount.length, 0)
  })

  test('anotaciones separa escritura y borrado', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-anotaciones-write'])
    const created = await client.post('/api/employee-annotations').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId: fixture!.employee.employeeId, employeeAnnotationContent: 'Nota inicial' })
    assertNotPermissionDenied(assert, created)
    const annotation = await EmployeeAnnotation.query().where('employee_id', fixture!.employee.employeeId).whereNull('employee_annotation_deleted_at').firstOrFail()
    const updated = await client.put(`/api/employee-annotations/${annotation.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeAnnotationContent: 'Nota corregida' })
    assertNotPermissionDenied(assert, updated)
    const denied = await client.delete(`/api/employee-annotations/${annotation.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    const stillThere = await EmployeeAnnotation.query().where('employee_annotation_id', annotation.employeeAnnotationId).whereNull('employee_annotation_deleted_at').first()
    assert.isNotNull(stillThere)
    await grantOnly(actor!.role.roleId, ['tab-anotaciones-delete'])
    const deleted = await client.delete(`/api/employee-annotations/${annotation.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!))
    assertNotPermissionDenied(assert, deleted)
  })

  test('corregir anotación ajena conserva el mensaje de autoría, no PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-anotaciones-write'])
    const other = await createActor('za-other')
    await grantOnly(other.role.roleId, ['tab-anotaciones-write'])
    await other.user.related('businessUnits').attach([actor!.businessUnit.businessUnitId])
    try {
      const created = await EmployeeAnnotation.create({
        employeeId: fixture!.employee.employeeId,
        employeeAnnotationContent: 'Nota del autor original',
        employeeAnnotationActive: true,
        userId: actor!.user.userId,
      })
      const denied = await client.put(`/api/employee-annotations/${created.employeeAnnotationId}`).loginAs(other.user).headers(buHeader(actor!)).json({ employeeAnnotationContent: 'Intento ajeno' })
      assert.equal(denied.status(), 403)
      assert.equal(denied.body()?.message, 'Only the original creator can update this annotation')
      assert.notEqual(denied.body()?.key, 'PERM.DENIED')
      const own = await client.put(`/api/employee-annotations/${created.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeAnnotationContent: 'Corrección propia' })
      assertNotPermissionDenied(assert, own)
    } finally {
      await cleanupActor(other)
    }
  })

  test('borrar anotación ajena no aplica regla de autoría', async ({ client, assert }) => {
    const other = await createActor('za-delete-other')
    await grantOnly(actor!.role.roleId, ['tab-anotaciones-delete'])
    try {
      const annotation = await EmployeeAnnotation.create({
        employeeId: fixture!.employee.employeeId,
        employeeAnnotationContent: 'Nota ajena',
        employeeAnnotationActive: true,
        userId: other.user.userId,
      })
      const deleted = await client.delete(`/api/employee-annotations/${annotation.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!))
      assertNotPermissionDenied(assert, deleted)
    } finally {
      await cleanupActor(other)
    }
  })

  test('basta manage-responsible-edit o manage-assigned-edit; sin ninguno se niega', async ({ client, assert }) => {
    const employeeId = fixture!.employee.employeeId
    await grantOnly(actor!.role.roleId, ['manage-responsible-edit'])
    const withResponsible = await client.post('/api/user-responsible-employees').loginAs(actor!.user).headers(buHeader(actor!)).json({ userId: actor!.user.userId, employeeId })
    assertNotPermissionDenied(assert, withResponsible)
    await grantOnly(actor!.role.roleId, ['manage-assigned-edit'])
    const assignment = await UserResponsibleEmployee.create({ userId: actor!.user.userId, employeeId, userResponsibleEmployeeReadonly: 0, userResponsibleEmployeeDirectBoss: 1 })
    const withAssigned = await client.put(`/api/user-responsible-employees/${assignment.userResponsibleEmployeeId}`).loginAs(actor!.user).headers(buHeader(actor!)).json({ userId: actor!.user.userId, employeeId, userResponsibleEmployeeReadonly: 0, userResponsibleEmployeeDirectBoss: 0 })
    assertNotPermissionDenied(assert, withAssigned)
    await grantOnly(actor!.role.roleId, [])
    const denied = await client.delete(`/api/user-responsible-employees/${assignment.userResponsibleEmployeeId}`).loginAs(actor!.user).headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    const still = await UserResponsibleEmployee.query().where('user_responsible_employee_id', assignment.userResponsibleEmployeeId).whereNull('user_responsible_employee_deleted_at').first()
    assert.isNotNull(still)
  })

  test('sin manage-employee-supplies la foto no se almacena y no se crea la asignación', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write', 'manage-files'])
    const supplyFixture = await createSupplyFixture('deny-photo')
    supplies.push(supplyFixture)
    const photosBefore = await EmployeeSupplieAssignationPhoto.query()
    const suppliesBefore = await EmployeeSupplie.query().where('employee_id', fixture!.employee.employeeId)
    const createDenied = await client.post('/api/employee-supplies').loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeId: fixture!.employee.employeeId, supplyId: supplyFixture.supply.supplyId, employeeSupplyAssignamentDate: '2026-08-01' })
    assertPermissionDenied(assert, createDenied)
    const orphan = await EmployeeSupplie.create({ employeeId: fixture!.employee.employeeId, supplyId: supplyFixture.supply.supplyId, employeeSupplyStatus: 'active', employeeSupplyAssignamentDate: DateTime.now() })
    const photoDenied = await client.post(`/api/employee-supply-assignation-photos/${orphan.employeeSupplyId}/assignation`).loginAs(actor!.user).file('photos', VALID_PNG_BUFFER, { filename: 'evidencia.png', contentType: 'image/png' })
    assertPermissionDenied(assert, photoDenied)
    const photosAfter = await EmployeeSupplieAssignationPhoto.query()
    assert.equal(photosAfter.length, photosBefore.length)
    const suppliesAfter = await EmployeeSupplie.query().where('employee_id', fixture!.employee.employeeId).whereNull('employee_supply_deleted_at')
    assert.equal(suppliesAfter.length, suppliesBefore.length + 1)
  })

  test('manage-employee-supplies permite las nueve operaciones del ciclo del activo', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['manage-employee-supplies'])
    const supplyFixture = await createSupplyFixture('cycle')
    supplies.push(supplyFixture)
    const assignment = await EmployeeSupplie.create({ employeeId: fixture!.employee.employeeId, supplyId: supplyFixture.supply.supplyId, employeeSupplyStatus: 'active', employeeSupplyAssignamentDate: DateTime.now() })
    const update = await client.put(`/api/employee-supplies/${assignment.employeeSupplyId}`).loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeSupplyAdditions: 'Actualización' })
    assertNotPermissionDenied(assert, update)
    const retire = await client.post(`/api/employee-supplies/${assignment.employeeSupplyId}/retire`).loginAs(actor!.user).headers(buHeader(actor!)).json({ employeeSupplyRetirementReason: 'Prueba funcional' })
    assertNotPermissionDenied(assert, retire)
    const contract = await client.post('/api/employee-supplies-response-contracts').loginAs(actor!.user).headers(buHeader(actor!)).field('employeeSupplyIds', JSON.stringify([assignment.employeeSupplyId])).file('file', VALID_PNG_BUFFER, { filename: 'contrato.png', contentType: 'image/png' })
    assertNotPermissionDenied(assert, contract)
    const assignationPhoto = await client.post(`/api/employee-supply-assignation-photos/${assignment.employeeSupplyId}/assignation`).loginAs(actor!.user).file('photos', VALID_PNG_BUFFER, { filename: 'entrega.png', contentType: 'image/png' })
    assertNotPermissionDenied(assert, assignationPhoto)
    const returnPhoto = await client.post(`/api/employee-supply-assignation-photos/${assignment.employeeSupplyId}/return`).loginAs(actor!.user).file('photos', VALID_PNG_BUFFER, { filename: 'devolucion.png', contentType: 'image/png' })
    assertNotPermissionDenied(assert, returnPhoto)
    const storedContract = await db.from('employee_supplies_response_contracts').where('employee_supply_id', assignment.employeeSupplyId).first()
    assert.isNotNull(storedContract)
    const deleteContract = await client.delete(`/api/employee-supplies-response-contracts/${storedContract.employee_supply_response_contract_id}`).loginAs(actor!.user).headers(buHeader(actor!))
    assertNotPermissionDenied(assert, deleteContract)
    const storedPhoto = await EmployeeSupplieAssignationPhoto.query().where('employee_supply_id', assignment.employeeSupplyId).whereNull('employee_supplie_assignation_photo_deleted_at').first()
    assert.isNotNull(storedPhoto)
    const deletePhoto = await client.delete(`/api/employee-supply-assignation-photos/${storedPhoto!.employeeSupplieAssignationPhotoId}`).loginAs(actor!.user)
    assertNotPermissionDenied(assert, deletePhoto)
    const deleted = await client.delete(`/api/employee-supplies/${assignment.employeeSupplyId}`).loginAs(actor!.user).headers(buHeader(actor!))
    assertNotPermissionDenied(assert, deleted)
  })
})

test.group('Zonas/Anotaciones/Bonos/Responsable/Activos - bypass standard', (group) => {
  let ownerActor: SystemActor | null = null
  let rootActor: SystemActor | null = null
  let ownerFixture: EmployeeFixture | null = null
  let rootFixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let ownerGrants: RoleSystemPermission[] = []
  let rootGrants: RoleSystemPermission[] = []
  const zones: Zone[] = []

  group.setup(async () => {
    await new SystemPermissionCatalogSyncService().sync()
    employeesModule = await SystemModule.query().whereNull('system_module_deleted_at').where('system_module_slug', 'employees').firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    ownerActor = await createSystemActor('owner', 'za-owner')
    rootActor = await createSystemActor('root', 'za-root')
    ownerFixture = await createEmployeeFixture(ownerActor.businessUnit.businessUnitId, 'owner')
    rootFixture = await createEmployeeFixture(rootActor.businessUnit.businessUnitId, 'root')
  })

  group.teardown(async () => {
    try {
      await restoreEmployeesGrants(rootGrants)
      await restoreEmployeesGrants(ownerGrants)
      await cleanupEmployeeFixture(rootFixture)
      await cleanupEmployeeFixture(ownerFixture)
      await cleanupSystemActor(rootActor)
      await cleanupSystemActor(ownerActor)
      for (const zone of zones) await cleanupZone(zone)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('owner y root sin grants no reciben PERM.DENIED en POST zona y POST bono', async ({ client, assert }) => {
    ownerGrants = await snapshotAndClearEmployeesGrants(ownerActor!.roleId)
    rootGrants = await snapshotAndClearEmployeesGrants(rootActor!.roleId)
    const zone = await createZoneFixture('bypass')
    zones.push(zone)
    for (const systemActor of [
      { actor: ownerActor!, fixture: ownerFixture! },
      { actor: rootActor!, fixture: rootFixture! },
    ]) {
      const zoneRes = await client.post('/api/employee-zones').loginAs(systemActor.actor.user).headers(buHeader(systemActor.actor)).json({ employeeId: systemActor.fixture.employee.employeeId, zoneId: zone.zoneId })
      assertNotPermissionDenied(assert, zoneRes)
      const bonusRes = await client.post('/api/employee-bonuses').loginAs(systemActor.actor.user).headers(buHeader(systemActor.actor)).json(bonusPayload(systemActor.fixture.employee.employeeId))
      assertNotPermissionDenied(assert, bonusRes)
    }
  })

  test('super-administrador sin grants recibe PERM.DENIED', async ({ client, assert }) => {
    const direccion = await createSystemActor('super-administrador', 'za-dg')
    const dgGrants = await snapshotAndClearEmployeesGrants(direccion.roleId)
    const dgFixture = await createEmployeeFixture(direccion.businessUnit.businessUnitId, 'dg')
    const zone = await createZoneFixture('dg')
    zones.push(zone)
    try {
      const denied = await client.post('/api/employee-zones').loginAs(direccion.user).headers(buHeader(direccion)).json({ employeeId: dgFixture.employee.employeeId, zoneId: zone.zoneId })
      assertPermissionDenied(assert, denied)
    } finally {
      await cleanupEmployeeFixture(dgFixture)
      await restoreEmployeesGrants(dgGrants)
      await cleanupSystemActor(direccion)
    }
  })
})

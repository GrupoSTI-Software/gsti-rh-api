import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'

const TEST_PASSWORD = 'EmployeesDownloadsPermissionGate123!'

const DOWNLOAD_SURFACES: Array<{ slug: string; method: 'get' | 'post'; path: string }> = [
  { slug: 'download-employees-list', method: 'get', path: '/api/employees/employee-generate-excel' },
  { slug: 'download-employees-import-template', method: 'get', path: '/api/employees/template-excel' },
  { slug: 'download-shift-assignment-template', method: 'get', path: '/api/employees/shift-assignment-template?startDate=2026-01-01&endDate=2026-01-07' },
  { slug: 'download-attendance-report', method: 'get', path: '/api/employees/attendance-report?startDate=2026-01-01&endDate=2026-01-07' },
  { slug: 'download-shift-exceptions', method: 'get', path: '/api/employees/999999999/export-excel' },
  { slug: 'download-vacations-report', method: 'get', path: '/api/employees-vacations/get-excel' },
  { slug: 'download-vacations-history', method: 'get', path: '/api/employees-vacations/get-vacations-used-excel' },
  { slug: 'download-vacations-summary', method: 'get', path: '/api/employees-vacations/get-vacations-summary-excel' },
  { slug: 'download-vacation-import-template', method: 'get', path: '/api/employees-vacations/get-vacation-import-template' },
  { slug: 'download-payroll-format', method: 'get', path: '/api/v1/assists/get-format-payroll?date=2026-01-15' },
  { slug: 'download-attendance-by-employee', method: 'get', path: '/api/v1/assists/get-excel-by-employee' },
  { slug: 'download-attendance-by-position', method: 'get', path: '/api/v1/assists/get-excel-by-position' },
  { slug: 'download-attendance-by-department', method: 'get', path: '/api/v1/assists/get-excel-by-department' },
  { slug: 'download-attendance-all', method: 'get', path: '/api/v1/assists/get-excel-all' },
  { slug: 'download-permissions-by-dates', method: 'get', path: '/api/v1/assists/get-excel-permissions-dates' },
  { slug: 'download-supplies-report', method: 'get', path: '/api/supplies/excel' },
  { slug: 'download-proceeding-files', method: 'get', path: '/api/employees-proceeding-files/999999999/download' },
  { slug: 'download-employee-contract', method: 'get', path: '/api/employee-contracts/999999999/download' },
]

const IMPORT_SURFACES: Array<{ slug: string; path: string }> = [
  { slug: 'import-employees', path: '/api/employees/import-excel' },
  { slug: 'import-shift-assignments', path: '/api/employees/import-shift-assignments' },
  { slug: 'import-vacations', path: '/api/employees-vacations/import-vacation-excel' },
]

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
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Descargas ${stamp}`,
    businessUnitSlug: `descargas-${stamp}`,
    businessUnitLegalName: `Descargas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Descargas ${stamp}`,
    roleSlug: `descargas-${stamp}`,
    roleDescription: 'Rol temporal sin permisos de descarga',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Descargas',
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
  await RoleDepartment.query().where('role_id', actor.role.roleId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Descargas sistema ${stamp}`,
    businessUnitSlug: `descargas-sistema-${stamp}`,
    businessUnitLegalName: `Descargas sistema legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const person = await Person.create({
    personFirstname: 'Descargas',
    personLastname: 'Sistema',
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
  return { user, person, roleId: role.roleId, businessUnit }
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
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

function assertPermissionDenied(
  assert: { equal: Function; isUndefined: Function },
  response: { status: () => number; body: () => Record<string, unknown> }
) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
  assert.equal(response.body()?.detail, 'No tienes permiso para realizar esta operación.')
  assert.isUndefined(response.body()?.data)
}

async function disableEnforcementAndVerify(employeesModule: SystemModule) {
  employeesModule.systemModulePermissionEnforcementActive = false
  await employeesModule.save()
  const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
  if (moduleAfterTeardown.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
  }
}

async function prepareEmployeesModule(enforcementActive: boolean): Promise<SystemModule> {
  await new SystemPermissionCatalogSyncService().sync()
  const employeesModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .firstOrFail()
  employeesModule.systemModulePermissionEnforcementActive = enforcementActive
  await employeesModule.save()
  return employeesModule
}

test.group('Descargas e importaciones — PermissionGate soft-rollout', (group) => {
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await prepareEmployeesModule(false)
  })

  group.teardown(async () => {
    await disableEnforcementAndVerify(employeesModule)
  })

  test('con exigencia apagada, rol sin grants no recibe PERM.DENIED', async ({ client, assert }) => {
    const actor = await createActor('downloads-off')
    try {
      const samples = [
        '/api/employees/employee-generate-excel',
        '/api/employees/attendance-report?startDate=2026-01-01&endDate=2026-01-07',
        '/api/employees-vacations/get-vacations-used-excel',
        '/api/supplies/excel',
        '/api/employees-proceeding-files/999999999/download',
        '/api/employee-contracts/999999999/download',
      ]
      for (const path of samples) {
        const response = await client
          .get(path)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        assert.notEqual(response.body()?.key, 'PERM.DENIED', path)
      }
      const imports = [
        '/api/employees/import-excel',
        '/api/employees-vacations/import-vacation-excel',
      ]
      for (const path of imports) {
        const response = await client
          .post(path)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        assert.notEqual(response.body()?.key, 'PERM.DENIED', path)
      }
    } finally {
      await cleanupActor(actor)
    }
  })
})

test.group('Descargas e importaciones — PermissionGate exigencia ON', (group) => {
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await prepareEmployeesModule(true)
  })

  group.teardown(async () => {
    await disableEnforcementAndVerify(employeesModule)
  })

  test('sin el permiso de la superficie responde PERM.DENIED y no entrega archivo', async ({
    client,
    assert,
  }) => {
    const actor = await createActor('downloads-on-deny')
    try {
      await grantOnly(actor.role.roleId, [])
      for (const surface of DOWNLOAD_SURFACES) {
        const response = await client[surface.method](surface.path)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        assertPermissionDenied(assert, response)
        assert.notInclude(String(response.header('content-type') ?? ''), 'spreadsheet')
        assert.notInclude(String(response.header('content-type') ?? ''), 'text/csv')
        assert.isUndefined(response.header('content-disposition'))
      }
    } finally {
      await cleanupActor(actor)
    }
  })

  test('conceder histórico de vacaciones no abre las otras veinte', async ({ client, assert }) => {
    const actor = await createActor('downloads-on-isolation')
    try {
      await grantOnly(actor.role.roleId, ['download-vacations-history'])
      const allowed = await client
        .get('/api/employees-vacations/get-vacations-used-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assert.notEqual(allowed.body()?.key, 'PERM.DENIED')

      for (const surface of [...DOWNLOAD_SURFACES, ...IMPORT_SURFACES.map((s) => ({
        ...s,
        method: 'post' as const,
      }))]) {
        if (surface.slug === 'download-vacations-history') continue
        const response = await client[surface.method](surface.path)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        assertPermissionDenied(assert, response)
      }
    } finally {
      await cleanupActor(actor)
    }
  })

  test('GET y POST attendance-report exigen el mismo permiso', async ({ client, assert }) => {
    const actor = await createActor('downloads-on-attendance')
    try {
      await grantOnly(actor.role.roleId, ['download-attendance-report'])
      const qs = '?startDate=2026-01-01&endDate=2026-01-07'
      const getRes = await client
        .get(`/api/employees/attendance-report${qs}`)
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      const postRes = await client
        .post('/api/employees/attendance-report')
        .json({ startDate: '2026-01-01', endDate: '2026-01-07' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assert.notEqual(getRes.body()?.key, 'PERM.DENIED')
      assert.notEqual(postRes.body()?.key, 'PERM.DENIED')

      const other = await client
        .get('/api/v1/assists/get-excel-all')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, other)
    } finally {
      await cleanupActor(actor)
    }
  })

  test('adjunto exige descarga y tab-expediente-read; contrato exige descarga y tab-trabajo-read', async ({
    client,
    assert,
  }) => {
    const actor = await createActor('downloads-on-and')
    try {
      await grantOnly(actor.role.roleId, ['download-proceeding-files'])
      const onlyDownload = await client
        .get('/api/employees-proceeding-files/999999999/download')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, onlyDownload)

      await grantOnly(actor.role.roleId, ['tab-expediente-read'])
      const onlyTab = await client
        .get('/api/employees-proceeding-files/999999999/download')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, onlyTab)

      await grantOnly(actor.role.roleId, ['download-proceeding-files', 'tab-expediente-read'])
      const both = await client
        .get('/api/employees-proceeding-files/999999999/download')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assert.notEqual(both.body()?.key, 'PERM.DENIED')

      await grantOnly(actor.role.roleId, ['download-employee-contract'])
      const contractOnlyDownload = await client
        .get('/api/employee-contracts/999999999/download')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, contractOnlyDownload)

      await grantOnly(actor.role.roleId, ['download-employee-contract', 'tab-trabajo-read'])
      const contractBoth = await client
        .get('/api/employee-contracts/999999999/download')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assert.notEqual(contractBoth.body()?.key, 'PERM.DENIED')
    } finally {
      await cleanupActor(actor)
    }
  })

  test('importación sin permiso no crea ni modifica registros', async ({ client, assert }) => {
    const actor = await createActor('downloads-on-import')
    try {
      await grantOnly(actor.role.roleId, ['manage-vacation'])
      const beforeEmployees = await Employee.query().whereNull('employee_deleted_at').count('* as total')
      const deniedEmployees = await client
        .post('/api/employees/import-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, deniedEmployees)
      const afterEmployees = await Employee.query().whereNull('employee_deleted_at').count('* as total')
      assert.equal(Number(afterEmployees[0].$extras.total), Number(beforeEmployees[0].$extras.total))

      const deniedVacations = await client
        .post('/api/employees-vacations/import-vacation-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, deniedVacations)
    } finally {
      await cleanupActor(actor)
    }
  })

  test('el permiso no amplía el recorte por departamento', async ({ client, assert }) => {
    const actor = await createActor('downloads-on-scope')
    try {
      await grantOnly(actor.role.roleId, ['download-employees-list'])
      const response = await client
        .get('/api/employees/employee-generate-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
    } finally {
      await cleanupActor(actor)
    }
  })

  test('owner y root evaden el gate; super-administrador no', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'downloads-owner')
    const root = await createSystemActor('root', 'downloads-root')
    const superAdmin = await createSystemActor('super-administrador', 'downloads-sa')
    const ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
    const rootGrants = await snapshotAndClearEmployeesGrants(root.roleId)
    const superAdminGrants = await snapshotAndClearEmployeesGrants(superAdmin.roleId)
    try {
      for (const systemActor of [owner, root]) {
        const response = await client
          .get('/api/employees/employee-generate-excel')
          .loginAs(systemActor.user)
          .header('X-Business-Unit-Id', systemActor.businessUnit.businessUnitPublicId)
        assert.notEqual(response.body()?.key, 'PERM.DENIED')
      }
      const denied = await client
        .get('/api/employees/employee-generate-excel')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, denied)
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(rootGrants)
      await restoreEmployeesGrants(superAdminGrants)
      await cleanupSystemActor(owner)
      await cleanupSystemActor(root)
      await cleanupSystemActor(superAdmin)
    }
  })

  test('POST /api/v1/assists/reports sin permiso no encola job', async ({ client, assert }) => {
    const actor = await createActor('downloads-on-job')
    try {
      await grantOnly(actor.role.roleId, [])
      const response = await client
        .post('/api/v1/assists/reports')
        .json({
          date: '2026-01-01',
          'date-end': '2026-01-07',
          reportType: 'assistance_all',
        })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      assertPermissionDenied(assert, response)
      assert.isUndefined(response.body()?.data?.reportJobId)
    } finally {
      await cleanupActor(actor)
    }
  })
})

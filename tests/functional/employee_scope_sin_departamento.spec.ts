import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import Employee from '#models/employee'
import Notice from '#models/notice'
import NoticeFile from '#models/notice_file'
import NoticeRecipient from '#models/notice_recipient'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import NoticeService from '#services/notice_service'
import { TenantContext } from '#utils/tenant_context'
import { grantNoticePermissions, revokeNoticePermissions } from './helpers/notice_permissions.js'

/**
 * USRH1788466831247 — quien ve toda la plantilla (`root` o un rol con
 * `full-employee-assigned`) ve también a los empleados sin departamento en
 * Empleados, en la lista para asignar colaboradores y entre los destinatarios
 * de un aviso a toda la empresa. El acceso restringido no cambia y nunca se
 * asoma un empleado de otra empresa.
 *
 * Corre sobre la base de desarrollo: todo lo que crea lo borra en teardown.
 */

const TEST_PASSWORD = 'AlcanceSinDepto123!'

interface EmployeeFixture {
  employee: Employee
  person: Person
}

interface Actor {
  user: User
  person: Person
  /** Rol temporal creado por el spec; `null` cuando usa el rol `root` del sistema. */
  role: Role | null
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Alcance ${label} ${s}`,
    businessUnitSlug: `alcance-${label}-${s}`,
    businessUnitLegalName: `Alcance ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `ALC-${s}`.slice(0, 50),
    departmentName: `Alcance ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: 1,
  })
}

/**
 * Empleado activo de la empresa. `departmentId: null` es el caso de la HU.
 * Lleva correo de trabajo para que cuente como destinatario de un aviso.
 */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  departmentId: number | null
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Alcance',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `alcance-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `ALC-${s}`
  employee.employeeFirstName = 'Alcance'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `ALC-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.departmentId = departmentId
  employee.employeeTerminatedDate = null
  await employee.save()
  return { employee, person }
}

async function createRoleActor(unit: BusinessUnit, label: string): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Alcance ${label} ${s}`,
    roleSlug: `alcance-${label}-${s}`,
    roleDescription: 'Rol temporal para el alcance de empleados sin departamento',
    roleActive: 1,
    roleManagementDays: 10,
  })
  return createUser(unit, label, role, s)
}

/** El usuario principal: rol `root` del sistema, ve toda la plantilla sin permiso. */
async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const actor = await createUser(unit, 'root', role, stamp())
  return { ...actor, role: null }
}

async function createUser(unit: BusinessUnit, label: string, role: Role, s: string): Promise<Actor> {
  const email = `alcance-${label}-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: label,
    personSecondLastname: s,
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
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person, role }
}

/** Concede acciones del módulo `employees` (`read`, `full-employee-assigned`, …). */
async function grantEmployeesPermissions(
  roleId: number,
  slugs: string[]
): Promise<RoleSystemPermission[]> {
  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .whereIn('system_permission_slug', slugs)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
  if (permissions.length !== slugs.length) {
    throw new Error(`Se requieren los permisos employees:${slugs.join(', ')} en BD para este test.`)
  }
  const grants: RoleSystemPermission[] = []
  for (const permission of permissions) {
    grants.push(
      await RoleSystemPermission.create({ roleId, systemPermissionId: permission.systemPermissionId })
    )
  }
  return grants
}

async function cleanupEmployees(fixtures: EmployeeFixture[]): Promise<void> {
  for (const { employee, person } of fixtures) {
    await UserResponsibleEmployee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await NoticeRecipient.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Person.query().where('person_id', person.personId).delete()
  }
}

async function cleanupActor(actor: Actor | null): Promise<void> {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  if (actor.role) {
    await RoleSystemPermission.query().withTrashed().where('role_id', actor.role.roleId).delete()
    await Role.query().where('role_id', actor.role.roleId).delete()
  }
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    // Borrado físico, incluidos los departamentos dados de baja lógica.
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

function header(unit: BusinessUnit): string {
  return unit.businessUnitPublicId
}

/** Lee el paginador Lucid de GET /api/employees/ y /to-assigned (data.employees.data). */
function employeeIds(body: Record<string, unknown> | null | undefined): number[] {
  const payload = (body?.data ?? {}) as Record<string, unknown>
  const employees = payload.employees
  let rows: unknown[] = []
  if (Array.isArray(employees)) {
    rows = employees
  } else if (employees && typeof employees === 'object') {
    const nested = (employees as { data?: unknown }).data
    if (Array.isArray(nested)) {
      rows = nested
    }
  }
  return rows
    .map((row) => Number((row as Record<string, unknown>).employeeId))
    .filter((id) => Number.isFinite(id) && id > 0)
}

test.group('Alcance sin departamento — Empleados y lista para asignar (USRH1788466831247)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let emptyUnit: BusinessUnit
  let root: Actor | null = null
  let completo: Actor | null = null
  let restringido: Actor | null = null
  let conDepto: EmployeeFixture
  let sinDepto: EmployeeFixture
  let deptoBaja: EmployeeFixture
  let sinDeptoBaja: EmployeeFixture
  let aCargoSinDepto: EmployeeFixture
  let ajenoSinDepto: EmployeeFixture
  let plantillaSinDeptos: EmployeeFixture[] = []

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    emptyUnit = await createUnit('nueva')

    const activo = await createDepartment(unit, 'Activo')
    const eliminado = await createDepartment(unit, 'Eliminado')

    conDepto = await createEmployee(unit, 'ConDepto', activo.departmentId)
    sinDepto = await createEmployee(unit, 'SinDepto', null)
    deptoBaja = await createEmployee(unit, 'DeptoBaja', eliminado.departmentId)
    sinDeptoBaja = await createEmployee(unit, 'SinDeptoBaja', null)
    aCargoSinDepto = await createEmployee(unit, 'ACargo', null)
    ajenoSinDepto = await createEmployee(foreignUnit, 'Ajeno', null)
    plantillaSinDeptos = [
      await createEmployee(emptyUnit, 'Nueva1', null),
      await createEmployee(emptyUnit, 'Nueva2', null),
      await createEmployee(emptyUnit, 'Nueva3', null),
    ]

    // Regla 8: el departamento dado de baja deja al empleado fuera, como hoy.
    await eliminado.delete()
    // Regla 5: un empleado dado de baja no entra aunque no tenga departamento.
    await sinDeptoBaja.employee.delete()

    root = await createRootActor(unit)
    completo = await createRoleActor(unit, 'completo')
    await grantEmployeesPermissions(completo.role!.roleId, ['read', 'full-employee-assigned'])
    restringido = await createRoleActor(unit, 'restringido')
    await grantEmployeesPermissions(restringido.role!.roleId, ['read'])
    await UserResponsibleEmployee.create({
      userId: restringido.user.userId,
      employeeId: aCargoSinDepto.employee.employeeId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 0,
    })
  })

  group.teardown(async () => {
    await cleanupEmployees([
      conDepto,
      sinDepto,
      deptoBaja,
      sinDeptoBaja,
      aCargoSinDepto,
      ajenoSinDepto,
      ...plantillaSinDeptos,
    ])
    await cleanupActor(root)
    await cleanupActor(completo)
    await cleanupActor(restringido)
    await cleanupUnits([unit, foreignUnit, emptyUnit])
  })

  test('el usuario principal ve al empleado sin departamento junto a los demás', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId, 'departamento dado de baja: regla 8')
    assert.notInclude(ids, sinDeptoBaja.employee.employeeId, 'empleado dado de baja: regla 5')
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa: regla 5')
  })

  test('el empleado sin departamento sale con department nulo, sin texto de relleno', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const rows = ((response.body().data.employees as { data: Array<Record<string, unknown>> }).data)
    const row = rows.find((r) => Number(r.employeeId) === sinDepto.employee.employeeId)
    assert.isDefined(row)
    assert.isNull(row!.departmentId)
    assert.isNull(row!.department ?? null)
  })

  test('el permiso de acceso completo ve lo mismo que el usuario principal', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId)
  })

  test('la búsqueda sigue aplicando al empleado sin departamento', async ({ client, assert }) => {
    const match = await client
      .get(`/api/employees/?page=1&limit=100&search=${sinDepto.employee.employeeSecondLastName}`)
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))
    const miss = await client
      .get('/api/employees/?page=1&limit=100&search=NADIE-SE-LLAMA-ASI')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    match.assertStatus(200)
    miss.assertStatus(200)
    assert.deepEqual(employeeIds(match.body()), [sinDepto.employee.employeeId])
    assert.deepEqual(employeeIds(miss.body()), [])
  })

  test('en una empresa sin departamentos, el usuario principal ve a toda su plantilla', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(emptyUnit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.sameMembers(
      ids,
      plantillaSinDeptos.map((f) => f.employee.employeeId)
    )
  })

  test('la lista para asignar colaboradores incluye al empleado sin departamento', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/to-assigned?page=1&limit=100')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, sinDeptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId)
  })

  test('el acceso restringido sigue viendo solo a sus colaboradores a cargo, tengan o no departamento', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(restringido!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    assert.deepEqual(employeeIds(response.body()), [aCargoSinDepto.employee.employeeId])
  })
})

test.group('Alcance sin departamento — avisos a toda la empresa (USRH1788466831247)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let completo: Actor | null = null
  let conDepto: EmployeeFixture
  let sinDepto: EmployeeFixture
  let deptoBaja: EmployeeFixture
  let ajenoSinDepto: EmployeeFixture
  let sinDeptoNuevo: EmployeeFixture | null = null
  let noticeGrants: RoleSystemPermission[] = []
  const createdNotices: number[] = []

  group.setup(async () => {
    unit = await createUnit('avisos')
    foreignUnit = await createUnit('avisos-ajena')
    const activo = await createDepartment(unit, 'Avisos')
    const eliminado = await createDepartment(unit, 'AvisosEliminado')
    conDepto = await createEmployee(unit, 'AvisoConDepto', activo.departmentId)
    sinDepto = await createEmployee(unit, 'AvisoSinDepto', null)
    deptoBaja = await createEmployee(unit, 'AvisoDeptoBaja', eliminado.departmentId)
    ajenoSinDepto = await createEmployee(foreignUnit, 'AvisoAjeno', null)
    await eliminado.delete()

    completo = await createRoleActor(unit, 'avisos-completo')
    await grantEmployeesPermissions(completo.role!.roleId, ['read', 'full-employee-assigned'])
    noticeGrants = await grantNoticePermissions(completo.role!.roleId, ['read', 'create'])
  })

  group.teardown(async () => {
    if (createdNotices.length > 0) {
      await NoticeRecipient.query().withTrashed().whereIn('notice_id', createdNotices).delete()
      await NoticeFile.query().withTrashed().whereIn('notice_id', createdNotices).delete()
      await Notice.query().withTrashed().whereIn('notice_id', createdNotices).delete()
    }
    await revokeNoticePermissions(noticeGrants)
    await cleanupEmployees(
      [conDepto, sinDepto, deptoBaja, ajenoSinDepto, sinDeptoNuevo].filter(
        (f): f is EmployeeFixture => f !== null
      )
    )
    await cleanupActor(completo)
    await cleanupUnits([unit, foreignUnit])
  })

  test('al guardar un programado para toda la empresa, el sin departamento es destinatario', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/notices')
      .json({
        noticeSubject: 'Toda la plantilla',
        noticeDescription: '<p>Mensaje</p>',
        noticeAudience: 'company',
        noticeSendMode: 'scheduled',
        noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
      })
      .header('X-Business-Unit-Id', header(unit))
      .loginAs(completo!.user)

    response.assertStatus(201)
    const notice = response.body().data.notice
    createdNotices.push(notice.noticeId)
    const ids = (notice.recipients as Array<{ employeeId: number }>).map((r) => r.employeeId)
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId, 'departamento dado de baja: regla 8')
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa: regla 5')
  })

  test('al salir el programado, se vuelve a resolver con el mismo criterio y sin mezclar empresas', async ({
    assert,
  }) => {
    assert.isAbove(createdNotices.length, 0, 'depende del aviso guardado en el test anterior')
    const noticeId = createdNotices[0]
    // Entró a la empresa después de programar el aviso y sigue sin departamento:
    // al salir, cuenta hoy, no entonces.
    sinDeptoNuevo = await createEmployee(unit, 'AvisoSinDeptoNuevo', null)

    // El comando corre fuera de una request y con el tenant en bypass: es el
    // caso en el que solo el business_unit_id explícito acota.
    const service = new NoticeService(i18nManager.locale(i18nManager.defaultLocale))
    const notice = await Notice.findOrFail(noticeId)
    await TenantContext.runUnscoped(
      () => service.refreshCriteriaRecipients(notice),
      'test USRH1788466831247: envío programado'
    )

    const rows = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', noticeId)
    const ids = rows.map((r) => r.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.include(ids, sinDeptoNuevo.employee.employeeId)
    assert.include(ids, conDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa con el tenant en bypass')
  })
})

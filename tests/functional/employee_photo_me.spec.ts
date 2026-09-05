import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'

/**
 * `GET /api/employees/me/photo` — la foto propia del colaborador
 * (ESB-04-02-08-01 §9.3, fase B2).
 *
 * Convenciones espejo de `employee_badge.spec.ts` (fixtures con timestamp
 * único, sin transacciones, cleanup explícito en `group.teardown`) y de
 * `employees/employees_expediente_read_permission_gate.spec.ts` para encender
 * temporalmente la exigencia de permisos del módulo `employees`.
 *
 * Lo que fija esta suite:
 *  1. `/me/photo` NO cae en `/:employeeId/photo`. Adonis resuelve por orden de
 *     registro; si la ruta nueva quedara después, `Number('me')` sería `NaN` y
 *     la respuesta un 400 `empleado-id-invalido` (o un 403 antes, con la
 *     exigencia encendida). Los tests que esperan 404 son el detector.
 *  2. La foto propia no pasa por `permissionGate`; la ajena sí.
 *  3. El candado de empresa lo sigue poniendo `businessScope()`: con el header
 *     de otra unidad, el propio empleado deja de resolver.
 */

const TEST_PASSWORD = 'EmployeePhotoMeTest123!'

/**
 * Referencia guardada que NO resuelve a ninguna key del bucket: el host no es
 * el del almacenamiento ni el del checador, así que `UploadService.resolveS3Ref`
 * la descarta sin salir a la red (`upload_service.ts:500`). Permite ejercitar
 * el tramo de streaming completo sin depender de S3 ni de conectividad.
 */
const FOTO_QUE_NO_RESUELVE = 'https://origen-ajeno.gsti-tests.local/foto.jpg'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  return BusinessUnit.create({
    businessUnitName: `Foto propia ${prefix} ${stamp}`,
    businessUnitSlug: `foto-propia-${prefix}-${stamp}`,
    businessUnitLegalName: `Foto propia ${prefix} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

/** Actor con rol propio SIN ningún permiso del módulo employees. */
async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await createBusinessUnit(emailPrefix)
  const role = await Role.create({
    roleName: `Foto propia ${stamp}`,
    roleSlug: `foto-propia-${stamp}`,
    roleDescription: 'Rol temporal sin permisos del módulo employees',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'FotoPropia',
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

interface CreateEmployeeOverrides {
  employeePhoto?: string | null
}

async function createEmployee(
  person: Person,
  businessUnit: BusinessUnit,
  overrides: CreateEmployeeOverrides = {}
): Promise<Employee> {
  const stamp = uniqueStamp()
  const employee = new Employee()
  employee.employeeSyncId = Date.now()
  employee.employeeCode = `PHOTO-ME-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `PHOTO-ME-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTerminatedDate = null
  employee.employeePhoto = overrides.employeePhoto ?? null
  await employee.save()
  return employee
}

async function cleanupEmployee(employeeId: number | null) {
  if (!employeeId) return
  await Employee.query().where('employee_id', employeeId).delete()
}

function buHeader(actor: TenantActor): string {
  return actor.businessUnit.businessUnitPublicId
}

test.group('Foto propia (/me/photo) — sin sesión', () => {
  test('GET /api/employees/me/photo responde 401', async ({ client }) => {
    const response = await client.get('/api/employees/me/photo')
    response.assertStatus(401)
  })
})

test.group('Foto propia (/me/photo) — contrato del endpoint', (group) => {
  let sinEmpleado: TenantActor | null = null
  let sinFoto: TenantActor | null = null
  let conFoto: TenantActor | null = null
  let eliminado: TenantActor | null = null
  let unidadAjena: BusinessUnit | null = null
  let empleadoSinFoto: Employee | null = null
  let empleadoConFoto: Employee | null = null
  let empleadoEliminado: Employee | null = null

  group.setup(async () => {
    sinEmpleado = await createActor('foto-me-sin-empleado')
    sinFoto = await createActor('foto-me-sin-foto')
    conFoto = await createActor('foto-me-con-foto')
    eliminado = await createActor('foto-me-eliminado')

    // Segunda unidad EN el scope del usuario: sin esto el header ajeno daría
    // 404 `BU.NOT.001` del middleware y no probaría el filtro del controlador.
    unidadAjena = await createBusinessUnit('ajena')
    await sinFoto.user.related('businessUnits').attach([unidadAjena.businessUnitId])

    empleadoSinFoto = await createEmployee(sinFoto.person, sinFoto.businessUnit)
    empleadoConFoto = await createEmployee(conFoto.person, conFoto.businessUnit, {
      employeePhoto: FOTO_QUE_NO_RESUELVE,
    })
    empleadoEliminado = await createEmployee(eliminado.person, eliminado.businessUnit, {
      employeePhoto: FOTO_QUE_NO_RESUELVE,
    })
    await empleadoEliminado.delete() // soft delete (mixin SoftDeletes)
  })

  group.teardown(async () => {
    await cleanupEmployee(empleadoSinFoto?.employeeId ?? null)
    await cleanupEmployee(empleadoConFoto?.employeeId ?? null)
    await cleanupEmployee(empleadoEliminado?.employeeId ?? null)
    await cleanupActor(sinEmpleado)
    await cleanupActor(sinFoto)
    await cleanupActor(conFoto)
    await cleanupActor(eliminado)
    if (unidadAjena) {
      await BusinessUnit.query().where('business_unit_id', unidadAjena.businessUnitId).delete()
    }
  })

  test('sin header X-Business-Unit-Id responde 400 BU.VAL.000', async ({ client, assert }) => {
    const response = await client.get('/api/employees/me/photo').loginAs(sinFoto!.user)

    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
  })

  test('usuario sin empleado responde 404 foto-no-encontrada, nunca 400 empleado-id-invalido', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(sinEmpleado!.user)
      .header('X-Business-Unit-Id', buHeader(sinEmpleado!))

    // Un 400 `empleado-id-invalido` sería la firma de haber caído en
    // `/:employeeId/photo` con `Number('me') === NaN`: la ruta habría quedado
    // registrada DESPUÉS y Adonis resuelve por orden.
    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-encontrada')
    assert.notEqual(response.body().key, 'empleado-id-invalido')
  })

  test('empleado propio sin foto responde 404 foto-no-encontrada', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(sinFoto!.user)
      .header('X-Business-Unit-Id', buHeader(sinFoto!))

    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-encontrada')
  })

  test('foto propia que no resuelve en el almacenamiento responde 404 foto-no-disponible', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(conFoto!.user)
      .header('X-Business-Unit-Id', buHeader(conFoto!))

    // Llegó hasta `streamPhotoOf`: resolvió al empleado propio y su referencia.
    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-disponible')
  })

  test('con el header de otra unidad el empleado propio deja de resolver', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(sinFoto!.user)
      .header('X-Business-Unit-Id', unidadAjena!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-encontrada')
  })

  test('un empleado propio eliminado no entrega foto', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(eliminado!.user)
      .header('X-Business-Unit-Id', buHeader(eliminado!))

    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-encontrada')
  })
})

test.group('Foto propia (/me/photo) — exigencia de permisos encendida', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let empleadoPropio: Employee | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    actor = await createActor('foto-me-gate')
    empleadoPropio = await createEmployee(actor.person, actor.businessUnit, {
      employeePhoto: FOTO_QUE_NO_RESUELVE,
    })
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      await cleanupEmployee(empleadoPropio?.employeeId ?? null)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled =
        moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('sin tab-trabajo-read, la foto por id responde 403 PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employees/${empleadoPropio!.employeeId}/photo`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(403)
    assert.equal(response.body().key, 'PERM.DENIED')
    assert.equal(response.body().title, 'Sin permiso')
  })

  test('la misma foto por /me/photo no pasa por el gate y llega al controlador', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/me/photo')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(response.body().key, 'PERM.DENIED')
    response.assertStatus(404)
    assert.equal(response.body().key, 'foto-no-disponible')
  })
})

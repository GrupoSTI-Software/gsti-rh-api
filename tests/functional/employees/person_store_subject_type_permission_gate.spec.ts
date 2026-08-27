import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { blindIndex } from '#utils/blind_index'

const TEST_PASSWORD = 'PersonSubjectTypeGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

async function permissionId(moduleSlug: string, permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`)
  }
  return permission.systemPermissionId
}

async function grantEmployeesOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId('employees', slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Persona Subject ${stamp}`,
    businessUnitSlug: `persona-subject-${stamp}`,
    businessUnitLegalName: `Persona Subject Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Persona Subject ${stamp}`,
    roleSlug: `persona-subject-${stamp}`,
    roleDescription: 'Rol temporal QA alta persona',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Actor',
    personLastname: 'Subject',
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
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

function personPayload(suffix: string, subjectType?: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return {
    ...(subjectType !== undefined ? { personSubjectType: subjectType } : {}),
    personFirstname: 'Alta',
    personLastname: 'QA',
    personSecondLastname: suffix,
    personEmail: `alta-${suffix}-${stamp}@gsti-tests.local`,
  }
}

async function countByEmail(email: string): Promise<number> {
  const row = await Person.query().where('person_email_hash', blindIndex(email)).first()
  return row ? 1 : 0
}

async function deleteByEmail(email: string): Promise<void> {
  await Person.query().where('person_email_hash', blindIndex(email)).delete()
}

test.group('Alta/listado persona — exigencia OFF', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  const createdEmails: string[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('person-subject-off')
    // Aísla tab-persona-write de EMP.SENS.WRITE.FORBIDDEN sobre personEmail.
    await grantEmployeesOnly(actor.role.roleId, ['sensitive-contacto-write'])
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      for (const email of createdEmails) {
        await deleteByEmail(email)
      }
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const after = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de employees debe quedar apagada tras el suite.')
    }
  })

  test('sin personSubjectType y sin permiso no responde PERM.DENIED', async ({ client, assert }) => {
    const payload = personPayload('off-ausente')
    createdEmails.push(payload.personEmail)
    const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('GET /api/persons sin tab-persona-read no responde PERM.DENIED', async ({ client, assert }) => {
    const response = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})

test.group('Alta/listado persona — exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  const createdEmails: string[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('person-subject-on')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      for (const email of createdEmails) {
        await deleteByEmail(email)
      }
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const after = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de employees debe quedar apagada tras el suite.')
    }
  })

  test('ausente, collaborator y valor-invalido sin write dan 403 y no crean fila', async ({
    client,
    assert,
  }) => {
    await grantEmployeesOnly(actor!.role.roleId, [])
    for (const subject of [undefined, 'collaborator', 'valor-invalido'] as const) {
      const payload = personPayload(`on-${String(subject)}`, subject)
      const before = await countByEmail(payload.personEmail)
      const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
      assert.equal(response.status(), 403)
      assert.equal(response.body()?.key, 'PERM.DENIED')
      assert.equal(await countByEmail(payload.personEmail), before)
    }
  })

  test('valor-invalido con write llega al validador y responde 422', async ({ client, assert }) => {
    await grantEmployeesOnly(actor!.role.roleId, ['tab-persona-write'])
    const payload = personPayload('on-invalid-with-write', 'valor-invalido')
    const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
    assert.equal(response.status(), 422)
    assert.equal(await countByEmail(payload.personEmail), 0)
  })

  test('destinos no colaborador no exigen tab-persona-write', async ({ client, assert }) => {
    // Aísla tab-persona-write de EMP.SENS.WRITE.FORBIDDEN sobre personEmail.
    await grantEmployeesOnly(actor!.role.roleId, ['sensitive-contacto-write'])
    for (const subject of ['customer', 'flight-attendant', 'pilot', 'system-user'] as const) {
      const payload = personPayload(`on-${subject}`, subject)
      createdEmails.push(payload.personEmail)
      const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
    }
  })

  test('GET /api/persons sin tab-persona-read da 403; con el permiso no', async ({
    client,
    assert,
  }) => {
    await grantEmployeesOnly(actor!.role.roleId, [])
    const denied = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.equal(denied.status(), 403)
    assert.equal(denied.body()?.key, 'PERM.DENIED')

    await grantEmployeesOnly(actor!.role.roleId, ['tab-persona-read'])
    const allowed = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.notEqual(allowed.status(), 403)
    assert.notEqual(allowed.body()?.key, 'PERM.DENIED')
  })
})

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import PositionSalaryRangeService from '#services/position_salary_range_service'

const TEST_PASSWORD = 'PositionsSalaryRangeGate123!'

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

async function grantModuleOnly(
  roleId: number,
  moduleSlug: string,
  permissionSlugs: string[]
) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(moduleSlug, slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Rangos Gate ${stamp}`,
    businessUnitSlug: `rangos-gate-${stamp}`,
    businessUnitLegalName: `Rangos Gate Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Rangos Gate ${stamp}`,
    roleSlug: `rangos-gate-${stamp}`,
    roleDescription: 'Rol temporal de QA rangos salariales',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Rangos',
    personLastname: 'Gate',
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

async function createPosition(businessUnitId: number, prefix: string): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const insert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: new Date(),
  })
  return Number(insert[0])
}

function todayIso(): string {
  return DateTime.now().setZone('America/Mexico_City').toISODate() as string
}

function createPayload(businessUnitId: number, positionId: number) {
  return {
    businessUnitId,
    positionId,
    minSalaryDaily: 320.5,
    maxSalaryDaily: 480.75,
    validFrom: todayIso(),
    reason: 'qa-gate',
  }
}

function expectDenied(response: { status: () => number; body: () => { key?: string } }, assert: {
  equal: (a: unknown, b: unknown) => void
}) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
}

function expectNotDenied(response: { status: () => number; body: () => { key?: string } }, assert: {
  notEqual: (a: unknown, b: unknown) => void
}) {
  assert.notEqual(response.status(), 403)
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

test.group('Rangos salariales — PermissionGate soft-rollout', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  const createdRangeIds: number[] = []

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()
    actor = await createActor('positions-ranges-off')
    await grantModuleOnly(actor.role.roleId, 'positions', [])
    positionId = await createPosition(actor.businessUnit.businessUnitId, 'off')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (createdRangeIds.length > 0) {
        await db.from('position_salary_range_audit').whereIn('range_id', createdRangeIds).delete()
        await db.from('position_salary_ranges').whereIn('position_salary_range_id', createdRangeIds).delete()
      }
      if (positionId) {
        await db.from('positions').where('position_id', positionId).delete()
      }
      await cleanupActor(actor)
    } finally {
      positionsModule.systemModulePermissionEnforcementActive = false
      await positionsModule.save()
      const after = await SystemModule.findOrFail(positionsModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de positions debe quedar apagada tras el suite.')
    }
  })

  test('con exigencia apagada, las 7 rutas no responden PERM.DENIED', async ({ client, assert }) => {
    const header = actor!.businessUnit.businessUnitPublicId
    const buId = actor!.businessUnit.businessUnitId

    const store = await client
      .post('/api/position-salary-ranges')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json(createPayload(buId, positionId!))
    expectNotDenied(store, assert)
    const rangeId = store.body()?.data?.positionSalaryRange?.positionSalaryRangeId as number | undefined
    if (rangeId) createdRangeIds.push(rangeId)

    const index = await client
      .get('/api/position-salary-ranges')
      .qs({ razon_social_id: buId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(index, assert)

    const current = await client
      .get('/api/position-salary-ranges/current')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(current, assert)

    const history = await client
      .get('/api/position-salary-ranges/history')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(history, assert)

    if (!rangeId) return

    const audit = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(audit, assert)

    const update = await client
      .patch(`/api/position-salary-ranges/${rangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json({ minSalaryDaily: 330, maxSalaryDaily: 490, reason: 'qa-update' })
    expectNotDenied(update, assert)
    const newRangeId = update.body()?.data?.positionSalaryRange?.positionSalaryRangeId as
      | number
      | undefined
    if (newRangeId) createdRangeIds.push(newRangeId)

    const closeTarget = newRangeId ?? rangeId
    const close = await client
      .delete(`/api/position-salary-ranges/${closeTarget}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .json({ reason: 'qa-close' })
    expectNotDenied(close, assert)
  })
})

test.group('Rangos salariales — PermissionGate exigencia ON', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  let seededRangeId: number | null = null

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    actor = await createActor('positions-ranges-on')
    const createdPositionId = await createPosition(actor.businessUnit.businessUnitId, 'on')
    positionId = createdPositionId

    // Sembrar un rango con exigencia apagada (el rol no tiene write).
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()
    const service = new PositionSalaryRangeService()
    const seed = await service.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      positionId: createdPositionId,
      minSalaryDaily: 300,
      maxSalaryDaily: 450,
      validFrom: DateTime.now().setZone('America/Mexico_City').startOf('day'),
      timeZone: 'America/Mexico_City',
      reason: 'seed-on',
      createdBy: actor.user.userId,
    })
    if (seed.status !== 201) {
      throw new Error(`No se pudo sembrar el rango de prueba: ${JSON.stringify(seed)}`)
    }
    seededRangeId = seed.range.positionSalaryRangeId

    positionsModule.systemModulePermissionEnforcementActive = true
    await positionsModule.save()
    await grantModuleOnly(actor.role.roleId, 'positions', ['salary-ranges-read'])
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (seededRangeId) {
        await db.from('position_salary_range_audit').where('range_id', seededRangeId).delete()
        await db.from('position_salary_ranges').where('position_salary_range_id', seededRangeId).delete()
      }
      if (positionId) {
        await db.from('positions').where('position_id', positionId).delete()
      }
      await cleanupActor(actor)
    } finally {
      positionsModule.systemModulePermissionEnforcementActive = false
      await positionsModule.save()
      const after = await SystemModule.findOrFail(positionsModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de positions debe quedar apagada tras el suite.')
    }
  })

  test('solo salary-ranges-read: lecturas 200-ish, write/delete/audit 403 PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const header = actor!.businessUnit.businessUnitPublicId
    const buId = actor!.businessUnit.businessUnitId

    const index = await client
      .get('/api/position-salary-ranges')
      .qs({ razon_social_id: buId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(index, assert)

    const current = await client
      .get('/api/position-salary-ranges/current')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(current, assert)

    const history = await client
      .get('/api/position-salary-ranges/history')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(history, assert)

    const store = await client
      .post('/api/position-salary-ranges')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json(createPayload(buId, positionId!))
    expectDenied(store, assert)

    const update = await client
      .patch(`/api/position-salary-ranges/${seededRangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json({ minSalaryDaily: 310, maxSalaryDaily: 460, reason: 'denied' })
    expectDenied(update, assert)

    const close = await client
      .delete(`/api/position-salary-ranges/${seededRangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .json({ reason: 'denied' })
    expectDenied(close, assert)

    const audit = await client
      .get(`/api/position-salary-ranges/${seededRangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectDenied(audit, assert)

    const stillOpen = await db
      .from('position_salary_ranges')
      .where('position_salary_range_id', seededRangeId)
      .whereNull('valid_to')
      .first()
    assert.isNotNull(stillOpen)
  })
})

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
import PositionSalaryRangeAudit from '#models/position_salary_range_audit'

const TEST_PASSWORD = 'PositionsSalaryRangeGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface AuditRow {
  action?: string
  actorId?: number
  reason?: string | null
  oldMinSalaryDaily?: number | null
  oldMaxSalaryDaily?: number | null
  newMinSalaryDaily?: number | null
  newMaxSalaryDaily?: number | null
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

test.group('Bitácora de rango — lectura financiera (interruptor OFF)', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  let rangeId: number | null = null

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()

    actor = await createActor('positions-audit-mask')
    positionId = await createPosition(actor.businessUnit.businessUnitId, 'audit')
    const service = new PositionSalaryRangeService()
    const created = await service.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      positionId,
      minSalaryDaily: 275.25,
      maxSalaryDaily: 410.5,
      validFrom: DateTime.now().setZone('America/Mexico_City').startOf('day'),
      timeZone: 'America/Mexico_City',
      reason: 'motivo-visible',
      createdBy: actor.user.userId,
    })
    if (created.status !== 201) {
      throw new Error(`No se pudo sembrar el rango de bitácora: ${JSON.stringify(created)}`)
    }
    if (!('range' in created)) {
      throw new Error(`No se pudo sembrar el rango de bitácora: ${JSON.stringify(created)}`)
    }
    rangeId = created.range.positionSalaryRangeId

    // updateVersion escribe el audit 'update' sobre el rango nuevo dentro del trx;
    // assignBusinessUnitId consulta el padre fuera de esa transacción y falla.
    // Se siembra la fila update sobre el rango ya confirmado para cubrir old+new.
    await PositionSalaryRangeAudit.create({
      rangeId,
      action: 'update',
      oldMinSalaryDaily: 275.25,
      oldMaxSalaryDaily: 410.5,
      newMinSalaryDaily: 290.75,
      newMaxSalaryDaily: 425,
      actorId: actor.user.userId,
      reason: 'motivo-actualizacion',
    })
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (rangeId) {
        await db.from('position_salary_range_audit').where('range_id', rangeId).delete()
        await db.from('position_salary_ranges').where('position_salary_range_id', rangeId).delete()
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

  test('sin sensitive-financiero-read los 4 importes salen null y el resto intacto', async ({
    client,
    assert,
  }) => {
    await grantModuleOnly(actor!.role.roleId, 'employees', [])
    const response = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    assert.notEqual(response.status(), 403)
    const rows = (response.body()?.data ?? []) as AuditRow[]
    assert.isAtLeast(rows.length, 1)
    const createRow = rows.find((row) => row.action === 'create')
    assert.exists(createRow)
    assert.equal(createRow!.actorId, actor!.user.userId)
    assert.equal(createRow!.reason, 'motivo-visible')
    assert.isNull(createRow!.oldMinSalaryDaily)
    assert.isNull(createRow!.oldMaxSalaryDaily)
    assert.isNull(createRow!.newMinSalaryDaily)
    assert.isNull(createRow!.newMaxSalaryDaily)

    const updateRow = rows.find((row) => row.action === 'update')
    assert.exists(updateRow)
    assert.equal(updateRow!.actorId, actor!.user.userId)
    assert.equal(updateRow!.reason, 'motivo-actualizacion')
    assert.isNull(updateRow!.oldMinSalaryDaily)
    assert.isNull(updateRow!.oldMaxSalaryDaily)
    assert.isNull(updateRow!.newMinSalaryDaily)
    assert.isNull(updateRow!.newMaxSalaryDaily)
  })

  test('con sensitive-financiero-read los importes nuevos de create son numéricos', async ({
    client,
    assert,
  }) => {
    await grantModuleOnly(actor!.role.roleId, 'employees', ['sensitive-financiero-read'])
    const response = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    assert.notEqual(response.status(), 403)
    const rows = (response.body()?.data ?? []) as AuditRow[]
    const createRow = rows.find((row) => row.action === 'create')
    assert.exists(createRow)
    assert.equal(createRow!.newMinSalaryDaily, 275.25)
    assert.equal(createRow!.newMaxSalaryDaily, 410.5)
    assert.isNull(createRow!.oldMinSalaryDaily)
    assert.isNull(createRow!.oldMaxSalaryDaily)
    assert.equal(createRow!.reason, 'motivo-visible')

    const updateRow = rows.find((row) => row.action === 'update')
    assert.exists(updateRow)
    assert.equal(updateRow!.oldMinSalaryDaily, 275.25)
    assert.equal(updateRow!.oldMaxSalaryDaily, 410.5)
    assert.equal(updateRow!.newMinSalaryDaily, 290.75)
    assert.equal(updateRow!.newMaxSalaryDaily, 425)
    assert.equal(updateRow!.reason, 'motivo-actualizacion')
  })
})

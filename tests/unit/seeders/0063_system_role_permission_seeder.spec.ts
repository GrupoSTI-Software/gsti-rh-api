import { test } from '@japa/runner'
import RolePermissionSeeder from '#database/seeders/0063_system_role_permission_seeder'
import BusinessUnit from '#models/business_unit'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

/**
 * VLRH-H1790812613828 — siembra de una sola vez por empresa del permiso de
 * reactivar (CA-6 a CA-11): quien tiene `employees:delete` lo recibe; lo que
 * la administración quitó no vuelve mientras otro rol de la empresa lo
 * conserve; cada empresa decide por su cuenta; sin la fila de 0062 el seeder
 * lanza.
 *
 * El `run()` completo también ejecuta los bloques de `consent-evidence` y
 * `credential-change`, idempotentes en `sae_pruebas`. Se afirma solo sobre los
 * roles de las dos empresas del caso, nunca sobre conteos globales.
 */

const FIXTURE_PREFIX = 'seed-reactivar-'

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function employeesPermission(slug: string): Promise<SystemPermission> {
  return SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) => query.where('system_module_slug', 'employees'))
    .firstOrFail()
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Seed reactivar ${label} ${s}`,
    businessUnitSlug: `${FIXTURE_PREFIX}${label}-${s}`,
    businessUnitLegalName: `Seed reactivar ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createRole(unit: BusinessUnit, label: string, grants: string[]): Promise<Role> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Seed reactivar ${label} ${s}`,
    roleSlug: `${FIXTURE_PREFIX}${label}-${s}`,
    roleDescription: 'Rol temporal del spec de la siembra de reactivar',
    roleActive: 1,
    businessUnitId: unit.businessUnitId,
    roleManagementDays: 10,
  })
  for (const slug of grants) {
    const permission = await employeesPermission(slug)
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }
  return role
}

/** Concesiones VIVAS de reactivar del rol. */
async function liveReactivateGrants(role: Role): Promise<RoleSystemPermission[]> {
  const target = await employeesPermission('reactivate-employees')
  return RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', role.roleId)
    .where('system_permission_id', target.systemPermissionId)
}

/** Quita la concesión como lo hace Roles y permisos: borrado lógico. */
async function revokeReactivate(role: Role): Promise<void> {
  for (const grant of await liveReactivateGrants(role)) {
    await grant.delete()
  }
}

async function runSeeder(): Promise<void> {
  await new RolePermissionSeeder({} as never).run()
}

async function destroy(units: BusinessUnit[], roles: Role[]): Promise<void> {
  const roleIds = roles.map((role) => role.roleId)
  if (roleIds.length > 0) {
    await RoleSystemPermission.query().withTrashed().whereIn('role_id', roleIds).delete()
    await Role.query().withTrashed().whereIn('role_id', roleIds).delete()
  }
  for (const unit of units) {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group(
  '0063 — siembra de reactivate-employees una sola vez por empresa (VLRH-H1790812613828)',
  (group) => {
    let unitA: BusinessUnit
    let unitB: BusinessUnit
    let ra1: Role
    let ra2: Role
    let ra3: Role
    let rb1: Role
    const units: BusinessUnit[] = []
    const roles: Role[] = []

    group.setup(async () => {
      unitA = await createUnit('a')
      unitB = await createUnit('b')
      units.push(unitA, unitB)
      ra1 = await createRole(unitA, 'ra1', ['delete'])
      ra2 = await createRole(unitA, 'ra2', ['delete', 'tab-trabajo-write'])
      ra3 = await createRole(unitA, 'ra3', ['tab-trabajo-write'])
      roles.push(ra1, ra2, ra3)
    })

    group.teardown(async () => {
      await destroy(units, roles)
    })

    test('CA-6: en una empresa sin el permiso, lo reciben los roles con delete y nadie más', async ({
      assert,
    }) => {
      await runSeeder()
      assert.lengthOf(await liveReactivateGrants(ra1), 1)
      assert.lengthOf(await liveReactivateGrants(ra2), 1)
      assert.lengthOf(await liveReactivateGrants(ra3), 0)
    })

    test('CA-7: idempotente — una segunda corrida no duplica la concesión', async ({ assert }) => {
      await runSeeder()
      assert.lengthOf(await liveReactivateGrants(ra1), 1)
      assert.lengthOf(await liveReactivateGrants(ra2), 1)
      assert.lengthOf(await liveReactivateGrants(ra3), 0)
    })

    test('CA-8: lo que la administración quitó no vuelve mientras otro rol lo conserve', async ({
      assert,
    }) => {
      await revokeReactivate(ra1)
      await runSeeder()
      assert.lengthOf(await liveReactivateGrants(ra1), 0)
      assert.lengthOf(await liveReactivateGrants(ra2), 1)
    })

    test('CA-9: cada empresa decide por su cuenta', async ({ assert }) => {
      rb1 = await createRole(unitB, 'rb1', ['delete'])
      roles.push(rb1)
      await runSeeder()
      assert.lengthOf(await liveReactivateGrants(rb1), 1)
      assert.lengthOf(await liveReactivateGrants(ra1), 0)
      assert.lengthOf(await liveReactivateGrants(ra2), 1)
    })

    test('CA-10: caso borde declarado — si se quita a todos los roles de la empresa, vuelve', async ({
      assert,
    }) => {
      await revokeReactivate(ra2)
      assert.lengthOf(await liveReactivateGrants(ra1), 0)
      assert.lengthOf(await liveReactivateGrants(ra2), 0)
      await runSeeder()
      assert.lengthOf(await liveReactivateGrants(ra1), 1)
      assert.lengthOf(await liveReactivateGrants(ra2), 1)
      assert.lengthOf(await liveReactivateGrants(ra3), 0)
    })

    test('CA-11: sin la fila de 0062 el seeder lanza y no concede reactivar', async ({
      assert,
    }) => {
      const target = await employeesPermission('reactivate-employees')
      const fresh = await createRole(unitB, 'rb2', ['delete'])
      roles.push(fresh)
      await target.delete()
      try {
        let thrown: unknown = null
        try {
          await runSeeder()
        } catch (error: unknown) {
          thrown = error
        }
        assert.instanceOf(thrown, Error)
        assert.equal(
          (thrown as Error).message,
          '0063: employees:reactivate-employees no existe. Corre 0062 primero.'
        )
      } finally {
        await SystemPermission.query()
          .withTrashed()
          .where('system_permission_id', target.systemPermissionId)
          .update({ system_permission_deleted_at: null })
      }
      const grants = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', fresh.roleId)
        .where('system_permission_id', target.systemPermissionId)
      assert.lengthOf(grants, 0)
    })
  }
)

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import TenantRoleProvisioningService from '#services/tenant_role_provisioning_service'
import { TENANT_ROLE_SLUGS } from '#constants/tenant_provisioned_roles'

/**
 * Siembra del juego de roles de una empresa.
 *
 * Lo que se afirma es lo que sostiene el modelo: que la empresa nace con sus
 * tres roles propios, que el administrador nace con permisos REALES (no con
 * salvoconducto) y que reejecutar no duplica ni pisa lo que el cliente haya
 * cambiado, porque de esa idempotencia depende que el backfill pueda reusar
 * este mismo servicio sobre empresas ya sembradas.
 */

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createBusinessUnit(): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Provisioning ${token}`,
    businessUnitSlug: `provisioning-${token}`,
    businessUnitLegalName: `Provisioning legal ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function cleanup(businessUnitId: number): Promise<void> {
  const roles = await Role.query().withTrashed().where('business_unit_id', businessUnitId)
  for (const role of roles) {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
  }
  await Role.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

test.group('TenantRoleProvisioningService', () => {
  test('siembra dueño, administrador y colaborador ligados a la empresa', async ({ assert }) => {
    const businessUnit = await createBusinessUnit()

    try {
      await db.transaction(async (trx) => {
        await new TenantRoleProvisioningService().provision(businessUnit.businessUnitId, trx)
      })

      const roles = await Role.query()
        .whereNull('role_deleted_at')
        .where('business_unit_id', businessUnit.businessUnitId)

      assert.lengthOf(roles, TENANT_ROLE_SLUGS.length)
      assert.sameMembers(
        roles.map((role) => role.roleSlug),
        [...TENANT_ROLE_SLUGS]
      )
      assert.isTrue(
        roles.every((role) => role.businessUnitId === businessUnit.businessUnitId),
        'todo rol sembrado pertenece a la empresa que lo estrena'
      )
      assert.isTrue(
        roles.every((role) => role.roleBusinessAccess === ''),
        'la pertenencia la dice la llave, no el CSV'
      )
    } finally {
      await cleanup(businessUnit.businessUnitId)
    }
  })

  test('el administrador nace con permisos explícitos y el dueño sin ninguno', async ({
    assert,
  }) => {
    const businessUnit = await createBusinessUnit()

    try {
      await db.transaction(async (trx) => {
        await new TenantRoleProvisioningService().provision(businessUnit.businessUnitId, trx)
      })

      const admin = await Role.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .where('role_slug', 'admin')
        .firstOrFail()
      const owner = await Role.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .where('role_slug', 'owner')
        .firstOrFail()

      const adminGrants = await RoleSystemPermission.query().where('role_id', admin.roleId)
      const ownerGrants = await RoleSystemPermission.query().where('role_id', owner.roleId)

      assert.isAbove(
        adminGrants.length,
        0,
        'el administrador se sostiene en permisos revocables, no en un salvoconducto por slug'
      )
      assert.lengthOf(
        ownerGrants,
        0,
        'el dueño pasa por salvoconducto: darle además una matriz duplicaría la fuente de la decisión'
      )
    } finally {
      await cleanup(businessUnit.businessUnitId)
    }
  })

  test('reejecutar no duplica roles ni repone lo que el cliente quitó', async ({ assert }) => {
    const businessUnit = await createBusinessUnit()

    try {
      await db.transaction(async (trx) => {
        await new TenantRoleProvisioningService().provision(businessUnit.businessUnitId, trx)
      })

      const admin = await Role.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .where('role_slug', 'admin')
        .firstOrFail()

      const revoked = await RoleSystemPermission.query().where('role_id', admin.roleId).firstOrFail()
      const revokedPermissionId = revoked.systemPermissionId
      await RoleSystemPermission.query()
        .where('role_id', admin.roleId)
        .where('system_permission_id', revokedPermissionId)
        .delete()

      const grantsAfterRevoke = await RoleSystemPermission.query().where('role_id', admin.roleId)

      await db.transaction(async (trx) => {
        await new TenantRoleProvisioningService().provision(businessUnit.businessUnitId, trx)
      })

      const roles = await Role.query()
        .whereNull('role_deleted_at')
        .where('business_unit_id', businessUnit.businessUnitId)
      const grantsAfterRerun = await RoleSystemPermission.query().where('role_id', admin.roleId)

      assert.lengthOf(roles, TENANT_ROLE_SLUGS.length, 'la segunda corrida no crea roles nuevos')
      assert.lengthOf(
        grantsAfterRerun,
        grantsAfterRevoke.length,
        'un permiso que el cliente le quitó al administrador no vuelve solo'
      )
    } finally {
      await cleanup(businessUnit.businessUnitId)
    }
  })
})

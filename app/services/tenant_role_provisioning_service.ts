import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import {
  TENANT_PROVISIONED_ROLES,
  buildTenantAdminGrants,
  type TenantRoleDefinition,
  type TenantRoleSlug,
} from '#constants/tenant_provisioned_roles'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Siembra el juego de roles propio de una empresa: dueño, administrador y
 * colaborador, ligados por `roles.business_unit_id`.
 *
 * Corre DENTRO de la transacción que crea la empresa —la del alta self-service
 * y la del alta desde configuración—, nunca por su cuenta: una empresa sin sus
 * roles es una empresa en la que nadie puede entrar, así que o entran los dos
 * o no entra ninguno.
 *
 * Idempotente por el par (empresa, slug), que es justo el candado que puso la
 * migración `1789528501204`: reejecutarlo sobre una empresa ya sembrada no
 * duplica filas ni reescribe lo que el cliente haya cambiado desde entonces.
 * Esa propiedad es la que deja al backfill reusar este mismo servicio.
 */
export default class TenantRoleProvisioningService {
  /**
   * @param businessUnitId Empresa dueña de los roles.
   * @param trx Transacción en curso del alta.
   * @returns Los roles de la empresa indexados por slug, sembrados o ya existentes.
   */
  async provision(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<Record<TenantRoleSlug, Role>> {
    const provisioned = {} as Record<TenantRoleSlug, Role>

    for (const definition of TENANT_PROVISIONED_ROLES) {
      const { role, created } = await this.ensureRole(definition, businessUnitId, trx)

      // La matriz se reparte SOLO al nacer el rol. Un rol que ya existía es del
      // cliente: si le quitó permisos al administrador, fue a propósito, y
      // reponerlos en la siguiente corrida sería devolverle un acceso que él
      // cerró. Llevar permisos nuevos del catálogo a los administradores ya
      // creados es otro trabajo, con su propia decisión explícita.
      if (created && definition.grants === 'fullCatalog') {
        await this.grantFullCatalog(role, trx)
      }

      provisioned[definition.slug] = role
    }

    return provisioned
  }

  /**
   * Crea el rol de la empresa si no existe y lo devuelve, diciendo si lo acaba
   * de crear. Un rol ya presente se respeta tal cual: el nombre, la descripción
   * y la matriz son del cliente desde el momento en que puede editarlos.
   *
   * `withTrashed()` a propósito: una fila dada de baja sigue ocupando el par
   * (empresa, slug) en el candado, así que insertar encima chocaría contra el
   * UNIQUE. Nunca se revive un rol retirado; se devuelve como está y el
   * llamador decide (mismo criterio que `0006_role_seeder`).
   */
  private async ensureRole(
    definition: TenantRoleDefinition,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<{ role: Role; created: boolean }> {
    const existing = await Role.query({ client: trx })
      .withTrashed()
      .where('role_slug', definition.slug)
      .where('business_unit_id', businessUnitId)
      .first()

    if (existing) {
      return { role: existing, created: false }
    }

    const role = new Role()
    role.roleName = definition.name
    role.roleSlug = definition.slug
    role.roleDescription = definition.description
    role.businessUnitId = businessUnitId
    role.roleActive = 1
    role.useTransaction(trx)
    await role.save()

    return { role, created: true }
  }

  /**
   * Concede al administrador todos los permisos vivos de los módulos vivos y
   * activos, resueltos por slug contra el catálogo fuente y nunca por ids fijos.
   *
   * Corre una sola vez, al nacer el rol. El filtro contra lo ya concedido se
   * queda porque un rol recién creado puede traer filas si la empresa se sembró
   * a medias en una corrida anterior interrumpida.
   */
  private async grantFullCatalog(role: Role, trx: TransactionClientContract): Promise<void> {
    const permissionIds = await this.resolveFullCatalogPermissionIds(trx)
    if (permissionIds.length === 0) {
      return
    }

    const current = await RoleSystemPermission.query({ client: trx })
      .where('role_id', role.roleId)
      .select('system_permission_id')

    const alreadyGranted = new Set(current.map((grant) => grant.systemPermissionId))
    const delta = permissionIds.filter((id) => !alreadyGranted.has(id))

    if (delta.length === 0) {
      return
    }

    await RoleSystemPermission.createMany(
      delta.map((systemPermissionId) => ({ roleId: role.roleId, systemPermissionId })),
      { client: trx }
    )
  }

  /**
   * Ids de los permisos que le tocan al administrador.
   *
   * Se parte del catálogo fuente (pares módulo/permiso) y se resuelve contra
   * las filas vivas: lo que el catálogo declara pero la BD todavía no sembró
   * simplemente no se concede, en lugar de reventar el alta de la empresa por
   * una siembra de permisos atrasada.
   */
  private async resolveFullCatalogPermissionIds(
    trx: TransactionClientContract
  ): Promise<number[]> {
    const grants = buildTenantAdminGrants()
    if (grants.length === 0) {
      return []
    }

    const moduleSlugs = [...new Set(grants.map((grant) => grant.moduleSlug))]

    const modules = await SystemModule.query({ client: trx })
      .whereNull('system_module_deleted_at')
      .where('system_module_active', 1)
      .whereIn('system_module_slug', moduleSlugs)
      .select('system_module_id', 'system_module_slug')

    const moduleIdBySlug = new Map(
      modules.map((systemModule) => [systemModule.systemModuleSlug, systemModule.systemModuleId])
    )

    const permissions = await SystemPermission.query({ client: trx })
      .whereNull('system_permission_deleted_at')
      .whereIn('system_module_id', [...moduleIdBySlug.values()])
      .select('system_permission_id', 'system_permission_slug', 'system_module_id')

    const permissionIdByKey = new Map(
      permissions.map((permission) => [
        `${permission.systemModuleId}:${permission.systemPermissionSlug}`,
        permission.systemPermissionId,
      ])
    )

    const ids: number[] = []
    for (const grant of grants) {
      const moduleId = moduleIdBySlug.get(grant.moduleSlug)
      if (moduleId === undefined) {
        continue
      }

      const permissionId = permissionIdByKey.get(`${moduleId}:${grant.permissionSlug}`)
      if (permissionId !== undefined) {
        ids.push(permissionId)
      }
    }

    return [...new Set(ids)]
  }
}

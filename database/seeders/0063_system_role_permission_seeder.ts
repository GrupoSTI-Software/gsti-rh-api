import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import {
  resolveRoleIdsBySlug,
  resolveSystemModuleIdsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Concede los permisos que ningún atajo por rol cubre y que nadie puede darse
 * desde la pantalla de Roles y permisos. Tres bloques:
 *
 * 1. `consent-evidence:reveal` para `root`. El API lo verifica con
 *    `RoleService.hasExplicitAccess`, que a propósito no tiene el atajo de
 *    root (revelar la evidencia de un consentimiento debe ser una concesión
 *    real, auditable y revocable), y el backoffice oculta a root en la
 *    pantalla de roles. Sin esta fila, en una base nueva nadie puede revelar.
 * 2. `users:credential-change` para todo rol que tenga `users:update`
 *    (re-concede en cada corrida: deuda conocida, no se toca aquí).
 * 3. `employees:reactivate-employees` para los roles con `employees:delete`,
 *    una sola vez por empresa (VLRH-H1790812613828).
 *
 * Corre después de `0006_role_seeder` (crea root) y de
 * `0062_system_module_seeder` (crea el módulo y su permiso).
 * Idempotente: `firstOrCreate` por el par (rol, permiso).
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores de los resolvers digan quién falló. */
  private readonly seederName = 'system_role_permission_seeder'

  private readonly grants = [
    { roleSlug: 'root', systemModuleSlug: 'consent-evidence', systemPermissionSlug: 'reveal' },
  ]

  async run() {
    const roleIdBySlug = await resolveRoleIdsBySlug(
      this.grants.map((grant) => grant.roleSlug),
      this.seederName
    )
    const systemModuleIdBySlug = await resolveSystemModuleIdsBySlug(
      this.grants.map((grant) => grant.systemModuleSlug),
      this.seederName
    )

    for (const grant of this.grants) {
      const systemPermission = await SystemPermission.query()
        .where('systemModuleId', systemModuleIdBySlug.get(grant.systemModuleSlug)!)
        .where('systemPermissionSlug', grant.systemPermissionSlug)
        .first()

      if (!systemPermission) {
        throw new Error(
          `[${this.seederName}] Permiso no encontrado: ${grant.systemModuleSlug}:${grant.systemPermissionSlug}. ` +
            'Verifica que 0062_system_module_seeder haya corrido antes.'
        )
      }

      const roleId = roleIdBySlug.get(grant.roleSlug)!
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId: systemPermission.systemPermissionId },
        { roleId, systemPermissionId: systemPermission.systemPermissionId }
      )
    }

    // 1. Resolver el permiso nuevo. Si no existe, THROW: 0062 va antes.
    const target = await SystemPermission.query()
      .where('system_permission_slug', 'credential-change')
      .andWhereHas('systemModule', (q) => q.where('system_module_slug', 'users'))
      .first()
    if (!target) throw new Error('0063: users:credential-change no existe. Corre 0062 primero.')

    // 2. Permiso origen (users:update) y roles que YA lo tienen.
    const source = await SystemPermission.query()
      .where('system_permission_slug', 'update')
      .andWhereHas('systemModule', (q) => q.where('system_module_slug', 'users'))
      .firstOrFail()

    const roleIds = await RoleSystemPermission.query()
      .where('system_permission_id', source.systemPermissionId)
      .select('role_id')

    // 3. firstOrCreate por rol. Idempotente, re-ejecutable en cada base de cliente.
    for (const { roleId } of roleIds) {
      await RoleSystemPermission.firstOrCreate(
        { roleId, systemPermissionId: target.systemPermissionId },
        { roleId, systemPermissionId: target.systemPermissionId }
      )
    }

    await this.seedReactivateEmployeesOncePerBusinessUnit()
  }

  /** Permiso vivo del módulo Empleados por slug; `null` si 0062 no lo ha creado. */
  private async employeesPermission(slug: string): Promise<SystemPermission | null> {
    return SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', slug)
      .whereHas('systemModule', (query) => query.where('system_module_slug', 'employees'))
      .first()
  }

  /**
   * Siembra de una sola vez por empresa del permiso de reactivación
   * (VLRH-H1790812613828, decisión de Wilvardo 2026-10-03): en cada empresa
   * donde ningún rol vivo tiene `employees:reactivate-employees`, lo reciben los
   * roles vivos con `employees:delete`. Si la empresa ya lo tiene en algún rol,
   * no se toca: así no se devuelve lo que un administrador quitó. Caso borde
   * aceptado: si lo quitan de todos los roles de la empresa, vuelve.
   * Se ignoran roles sin empresa (solo `root`, que pasa el gate por bypass).
   * Solo cuentan concesiones vivas de roles vivos: una fila borrada
   * lógicamente desde Roles y permisos es una decisión, no un hueco.
   */
  private async seedReactivateEmployeesOncePerBusinessUnit() {
    const target = await this.employeesPermission('reactivate-employees')
    if (!target) {
      throw new Error('0063: employees:reactivate-employees no existe. Corre 0062 primero.')
    }
    const source = await this.employeesPermission('delete')
    if (!source) throw new Error('0063: employees:delete no existe. Corre 0062 primero.')

    const businessUnitByRole = async (systemPermissionId: number): Promise<Role[]> => {
      const grants = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('system_permission_id', systemPermissionId)
        .select('role_id')
      if (grants.length === 0) return []
      return Role.query()
        .whereNull('role_deleted_at')
        .whereNotNull('business_unit_id')
        .whereIn(
          'role_id',
          grants.map((grant) => grant.roleId)
        )
        .select('role_id', 'business_unit_id')
    }

    const rolesWithTarget = await businessUnitByRole(target.systemPermissionId)
    const seededBusinessUnits = new Set(rolesWithTarget.map((role) => role.businessUnitId))
    for (const role of await businessUnitByRole(source.systemPermissionId)) {
      if (seededBusinessUnits.has(role.businessUnitId)) continue
      await RoleSystemPermission.firstOrCreate(
        { roleId: role.roleId, systemPermissionId: target.systemPermissionId },
        { roleId: role.roleId, systemPermissionId: target.systemPermissionId }
      )
    }
  }
}

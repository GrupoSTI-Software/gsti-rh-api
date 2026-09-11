import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import { NOTICE_PERMISSION_MODULE_SLUG } from '#constants/notice'

/**
 * Apoyo para las suites de avisos: concesiones del módulo `avisos-y-noticias`
 * y su bandera de exigencia. Todo lo que se crea o cambia aquí se revierte con
 * la función pareja, porque las pruebas corren sobre la base de desarrollo.
 */

/** Fila del módulo de avisos en `system_modules`; el gate es fail-closed si falta. */
export async function findNoticeModule(): Promise<SystemModule> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', NOTICE_PERMISSION_MODULE_SLUG)
    .first()
  if (!systemModule) {
    throw new Error(`Se requiere el módulo "${NOTICE_PERMISSION_MODULE_SLUG}" en BD para este test.`)
  }
  return systemModule
}

/**
 * Concede al rol las acciones sembradas del módulo (`read`, `create`,
 * `update`, `delete`). Devuelve las filas para retirarlas al terminar.
 */
export async function grantNoticePermissions(
  roleId: number,
  actions: readonly string[]
): Promise<RoleSystemPermission[]> {
  const systemModule = await findNoticeModule()
  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', systemModule.systemModuleId)
    .whereIn('system_permission_slug', [...actions])

  const grants: RoleSystemPermission[] = []
  for (const permission of permissions) {
    const grant = new RoleSystemPermission()
    grant.roleId = roleId
    grant.systemPermissionId = permission.systemPermissionId
    await grant.save()
    grants.push(grant)
  }
  return grants
}

/**
 * Acceso completo a la plantilla (`full-employee-assigned`): el permiso con el
 * que el listado de empleados —y con él el público `company` de un aviso—
 * deja de recortarse a los colaboradores a cargo del usuario. Se revoca con
 * `revokeNoticePermissions`.
 */
export async function grantFullEmployeeAccess(roleId: number): Promise<RoleSystemPermission[]> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', 'full-employee-assigned')
    .first()
  if (!permission) {
    throw new Error('Se requiere el permiso "full-employee-assigned" en BD para este test.')
  }
  const grant = new RoleSystemPermission()
  grant.roleId = roleId
  grant.systemPermissionId = permission.systemPermissionId
  await grant.save()
  return [grant]
}

export async function revokeNoticePermissions(grants: RoleSystemPermission[]): Promise<void> {
  if (grants.length === 0) return
  await RoleSystemPermission.query()
    .whereIn(
      'role_system_permission_id',
      grants.map((grant) => grant.roleSystemPermissionId)
    )
    .delete()
}

/**
 * Enciende o apaga la exigencia de permisos del módulo y devuelve el valor
 * anterior para restaurarlo en `finally`.
 */
export async function setNoticeModuleEnforcement(active: boolean): Promise<boolean> {
  const systemModule = await findNoticeModule()
  const previous = Boolean(systemModule.systemModulePermissionEnforcementActive)
  systemModule.systemModulePermissionEnforcementActive = active
  await systemModule.save()
  return previous
}

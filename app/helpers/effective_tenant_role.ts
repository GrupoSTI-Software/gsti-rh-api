import BusinessUnitUser from '#models/business_unit_user'
import Role from '#models/role'
import type User from '#models/user'

/**
 * Rol efectivo de una cuenta DENTRO de la empresa activa de la petición.
 *
 * Por qué existe: `users.role_id` es uno solo por cuenta, pero desde que los
 * roles tienen dueño (`roles.business_unit_id`) el rol vive en el par
 * (empresa, cuenta) y se guarda en `business_unit_users.role_id`. Sin esta
 * resolución, una cuenta con acceso a dos empresas entraría a la segunda con
 * el rol de la primera —un rol que allí ni siquiera existe—.
 *
 * Devuelve `null` cuando la pivote todavía no tiene rol escrito para ese par:
 * es el estado de los entornos donde el backfill no ha corrido, y ahí manda el
 * respaldo `users.role_id`. Fail-open a propósito y solo aquí: negar el acceso
 * a todas las cuentas de un entorno sin backfill dejaría al cliente fuera de su
 * propio sistema; el aislamiento real lo sostienen el scope de empresa y el
 * gate, no esta caída.
 */
export async function resolveEffectiveTenantRole(
  user: User,
  businessUnitId: number
): Promise<Role | null> {
  const membership = await BusinessUnitUser.query()
    .where('user_id', user.userId)
    .where('business_unit_id', businessUnitId)
    .whereNotNull('role_id')
    .first()

  if (!membership || membership.roleId === null) {
    return null
  }

  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_id', membership.roleId)
    .first()

  return role ?? null
}

/**
 * Deja el rol efectivo puesto en la instancia de usuario de la petición, que es
 * de donde lo leen el gate (`PermissionGateService.resolveIdentity`), los
 * guards que comparan `user.role.roleSlug` y las decenas de llamadas a
 * `RoleService.hasAccess(user.roleId, ...)`.
 *
 * Se escriben `$attributes` y `$original` a la vez, en lugar de asignar la
 * propiedad a secas, para que el modelo NO quede marcado como sucio: cualquier
 * `user.save()` que ocurra después en la misma petición —hay flujos que tocan
 * el token o el PIN— persistiría en `users.role_id` el rol de la empresa que se
 * estaba mirando, y eso es justo lo que se está retirando.
 */
export function applyEffectiveTenantRole(user: User, role: Role): void {
  user.$attributes.roleId = role.roleId
  user.$original.roleId = role.roleId
  user.$setRelated('role', role)
}

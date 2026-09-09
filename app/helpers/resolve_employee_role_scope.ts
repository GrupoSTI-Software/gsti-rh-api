import type { I18n } from '@adonisjs/i18n'
import User from '#models/user'
import RoleService from '#services/role_service'
import UserService from '#services/user_service'

/**
 * Alcance de colaboradores que un usuario puede ver, con la misma regla que
 * aplica el listado de empleados (`EmployeeController.index`).
 */
export interface EmployeeRoleScope {
  /** Departamentos visibles para el rol. `root` y `full-employee-assigned` ven todos. */
  departmentsList: number[]
  /**
   * Con valor, el usuario NO tiene acceso completo a la plantilla: solo ve a
   * los colaboradores que tiene a cargo (`user_responsible_employees`) y a sí
   * mismo. Es el mismo candado que `filters.userResponsibleId` del listado.
   */
  userResponsibleId: number | null
}

/**
 * Resuelve el alcance con la regla del listado de empleados, para que un
 * público resuelto en el servidor (`company`, `department`) nunca alcance a
 * quien el compositor del backoffice no muestra: el conteo y la lista del
 * compositor salen de ese listado, así que "N colaboradores recibirán el
 * aviso" tiene que ser el mismo N que el API usa al enviar.
 *
 * @returns `null` si el usuario ya no existe (por ejemplo, el autor de un
 *   programado dado de baja). El llamador decide qué hacer sin alcance.
 */
export async function resolveEmployeeRoleScope(
  userId: number,
  i18n: I18n
): Promise<EmployeeRoleScope | null> {
  const user = await User.query()
    .whereNull('user_deleted_at')
    .where('user_id', userId)
    .preload('role')
    .first()
  if (!user) return null

  const isRoot = user.role.roleSlug === 'root'
  const hasAccessToFullEmployees = isRoot
    ? false
    : await new RoleService().hasAccessToFullEmployees(user.roleId)
  const departmentsList = await new UserService(i18n).getRoleDepartments(
    user.userId,
    hasAccessToFullEmployees
  )

  return {
    departmentsList,
    userResponsibleId: !isRoot && !hasAccessToFullEmployees ? user.userId : null,
  }
}

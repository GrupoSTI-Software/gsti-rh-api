import type { I18n } from '@adonisjs/i18n'
import User from '#models/user'
import RoleService from '#services/role_service'
import UserService from '#services/user_service'
import { resolveResponsibleUserId } from '#helpers/responsible_employee_scope'

/**
 * Alcance de colaboradores que un usuario puede ver, con la misma regla que
 * aplica el listado de empleados (`EmployeeController.index`).
 */
export interface EmployeeRoleScope {
  /**
   * Departamentos activos visibles para el rol. `root` y `full-employee-assigned`
   * ven todos; para ellos las listas y los avisos agregan además a los empleados
   * sin departamento con `applyVisibleDepartmentsScope` (USRH1788466831247).
   */
  departmentsList: number[]
  /**
   * `true` para `root`, `owner` y roles con `full-employee-assigned`; `false` para
   * el acceso restringido. Cuando es `true`, las salidas incluyen a los empleados
   * con `department_id IS NULL` además de los departamentos de la lista.
   * Extensión de USRH1788466831312.
   */
  includeUnassigned: boolean
  /**
   * Con valor, el usuario NO tiene acceso completo a la plantilla: solo ve a
   * los colaboradores que tiene a cargo (`user_responsible_employees`) y a sí
   * mismo. Es el mismo candado que `filters.userResponsibleId` del listado.
   */
  userResponsibleId: number | null
}

/**
 * Subconjunto del alcance relevante para aplicar el filtro de departamento
 * en queries de `Employee`. Extensión de USRH1788466831312.
 */
export type EmployeeDepartmentScope = Pick<EmployeeRoleScope, 'departmentsList' | 'includeUnassigned'>

/**
 * Alcance cerrado para cuando el usuario no está autenticado o no puede
 * resolverse. Con `includeUnassigned: false` y lista vacía, las queries
 * de empleados devuelven cero filas (`1 = 0`). USRH1788466831312.
 */
export function emptyEmployeeRoleScope(): EmployeeRoleScope {
  return { departmentsList: [], includeUnassigned: false, userResponsibleId: null }
}

/**
 * Resuelve el alcance a partir del usuario ya cargado en el controlador.
 * A diferencia de `resolveEmployeeRoleScope`, no recarga el usuario desde
 * la BD: asume que `user.role` ya fue cargado por el caller (con `preload`
 * o `load`). USRH1788466831312.
 *
 * @param user - Usuario autenticado con `role` ya cargado.
 * @param i18n - Instancia i18n del request.
 * @returns Alcance nunca nulo: si el permiso lanza, se propaga al catch del
 *   controlador (regla 7 de USRH1788466831312).
 */
export async function resolveEmployeeRoleScopeForUser(user: User, i18n: I18n): Promise<EmployeeRoleScope> {
  const isRoot = user.role.roleSlug === 'root'
  const hasAccessToFullEmployees = isRoot
    ? false
    : await new RoleService().hasAccessToFullEmployees(user.roleId)
  // Root y owner ven toda la plantilla (regla única de `resolveResponsibleUserId`):
  // sin candado de colaboradores a cargo y con los empleados sin departamento.
  const userResponsibleId = hasAccessToFullEmployees ? null : resolveResponsibleUserId(user)
  const includeUnassigned = userResponsibleId === null
  // El segundo argumento es solo `full-employee-assigned`: con `true` la consulta
  // no acota por empresa, y el owner resuelve sus departamentos por su propia rama.
  const departmentsList = await new UserService(i18n).getRoleDepartments(
    user.userId,
    hasAccessToFullEmployees
  )

  return {
    departmentsList,
    includeUnassigned,
    userResponsibleId,
  }
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

  return resolveEmployeeRoleScopeForUser(user, i18n)
}

import logger from '@adonisjs/core/services/logger'
import type User from '#models/user'
import RoleService from '#services/role_service'
import { PLATFORM_ROLE_SLUG } from '#constants/system_roles'
import { EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS } from '#constants/employees_attendance_monitor_permission_declarations'
import type { AttendanceMonitorActionSlug } from '#constants/attendance_monitor_permission_catalog'
import {
  sessionUserEmployeeOwnership,
  type SessionEmployeeOwnership,
} from '#helpers/session_user_owns_employee'

/** Módulo y acción que habilitan ver la marca: "Ver el monitor de asistencia". */
const LOCATION_FLAG_MODULE =
  EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS.inactivateAssist.module
const LOCATION_FLAG_ACTION = 'read' satisfies AttendanceMonitorActionSlug

/** Id de empleado como entero positivo estricto: `"12abc"` no es `12`. */
const STRICT_EMPLOYEE_ID = /^[1-9]\d*$/

export interface AssistLocationFlagVisibilityDeps {
  ownership: (user: User, employeeId: number) => Promise<SessionEmployeeOwnership>
  hasAccess: (roleId: number, moduleSlug: string, action: string) => Promise<boolean>
}

const DEFAULT_DEPS: AssistLocationFlagVisibilityDeps = {
  ownership: sessionUserEmployeeOwnership,
  hasAccess: (roleId, moduleSlug, action) =>
    new RoleService().hasAccess(roleId, moduleSlug, action),
}

/**
 * Decide si la marca de ubicación de las checadas de un empleado viaja en la
 * respuesta del detalle del día (VLRH-H1791056345261, R6 de VLRH-C0014).
 *
 * Solo la ve quien tiene "Ver el monitor de asistencia" con el rol de la
 * empresa activa (que `businessScope` ya dejó en `user.role`), o el dueño de
 * esa empresa. Nunca el propio empleado, ni las cuentas de plataforma o con
 * rol `root`, aunque el atajo de `RoleService.hasAccess` les dé acceso: dan
 * soporte, no son RH del cliente, igual que no reciben el correo de
 * VLRH-H1791056340278.
 *
 * Fail-closed: cualquier duda o excepción devuelve `false` y la respuesta
 * queda como hoy.
 */
export async function canSeeAssistLocationFlag(
  user: User | null | undefined,
  rawEmployeeId: unknown,
  deps: AssistLocationFlagVisibilityDeps = DEFAULT_DEPS
): Promise<boolean> {
  try {
    if (!user) return false
    if (
      (typeof rawEmployeeId !== 'string' && typeof rawEmployeeId !== 'number') ||
      !STRICT_EMPLOYEE_ID.test(String(rawEmployeeId))
    ) {
      return false
    }
    // Desde la BD llega como 0/1, no como booleano: cualquier valor verdadero excluye.
    if (user.isPlatformAdmin) return false
    const roleSlug: unknown = user.role?.roleSlug
    if (typeof roleSlug !== 'string') return false
    if (roleSlug === PLATFORM_ROLE_SLUG) return false

    const employeeId = Number(rawEmployeeId)
    if ((await deps.ownership(user, employeeId)) !== 'none') return false

    return await deps.hasAccess(user.roleId, LOCATION_FLAG_MODULE, LOCATION_FLAG_ACTION)
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : typeof error },
      'no se pudo evaluar la visibilidad de la marca de ubicación'
    )
    return false
  }
}

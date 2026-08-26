import type User from '#models/user'
import { sessionUserOwnsEmployee } from '#helpers/session_user_owns_employee'
import RoleService from '#services/role_service'

const ATTENDANCE_MONITOR_MODULE_SLUG = 'employees-attendance-monitor'
const ADD_ASSIST_MANUAL_PERMISSION = 'add-assist-manual'

/**
 * Escritura de asistencia: autoservicio sin permiso, captura ajena con add-assist-manual.
 * USRH1787157820192 — reglas 1-3.
 */
export async function ensureEmployeeAssistWrite(
  user: User | null | undefined,
  employeeId: number
): Promise<{ allowed: boolean; isOwner: boolean }> {
  if (await sessionUserOwnsEmployee(user, employeeId)) {
    return { allowed: true, isOwner: true }
  }
  if (!user) {
    return { allowed: false, isOwner: false }
  }
  const roleService = new RoleService()
  const allowed = await roleService.hasAccess(
    user.roleId,
    ATTENDANCE_MONITOR_MODULE_SLUG,
    ADD_ASSIST_MANUAL_PERMISSION
  )
  return { allowed, isOwner: false }
}

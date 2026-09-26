import type User from '#models/user'
import { sessionUserEmployeeOwnership } from '#helpers/session_user_owns_employee'
import RoleService from '#services/role_service'

const ATTENDANCE_MONITOR_MODULE_SLUG = 'employees-attendance-monitor'
const ADD_ASSIST_MANUAL_PERMISSION = 'add-assist-manual'

/**
 * Escritura de asistencia: autoservicio sin permiso, captura ajena con add-assist-manual.
 * USRH1787157820192 — reglas 1-3.
 *
 * `ownerTerminated` distingue el caso que antes salía como captura ajena: la
 * propia checada de alguien dado de baja. Se sigue negando, pero por su motivo
 * real, porque los dos desenlaces son opuestos — uno se arregla dando un permiso
 * y el otro no se arregla nunca.
 */
export async function ensureEmployeeAssistWrite(
  user: User | null | undefined,
  employeeId: number
): Promise<{ allowed: boolean; isOwner: boolean; ownerTerminated: boolean }> {
  const ownership = await sessionUserEmployeeOwnership(user, employeeId)
  if (ownership === 'active') {
    return { allowed: true, isOwner: true, ownerTerminated: false }
  }
  if (ownership === 'terminated') {
    return { allowed: false, isOwner: true, ownerTerminated: true }
  }
  if (!user) {
    return { allowed: false, isOwner: false, ownerTerminated: false }
  }
  const roleService = new RoleService()
  const allowed = await roleService.hasAccess(
    user.roleId,
    ATTENDANCE_MONITOR_MODULE_SLUG,
    ADD_ASSIST_MANUAL_PERMISSION
  )
  return { allowed, isOwner: false, ownerTerminated: false }
}

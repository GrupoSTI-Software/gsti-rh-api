import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { sessionUserOwnsEmployee } from '#helpers/session_user_owns_employee'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'

/**
 * Lectura de pestaña en URL compartida con la app del colaborador.
 * Si la sesión es ese colaborador, no exige permiso de backoffice (regla 7).
 * Si no, evalúa el PermissionGate (mismo interruptor, mismo bypass, misma 403).
 */
export async function ensureEmployeeTabRead(
  ctx: HttpContext,
  employeeId: number,
  options: PermissionGateOptions
): Promise<boolean> {
  if (await sessionUserOwnsEmployee(ctx.auth.user, employeeId)) {
    return true
  }
  return ensureSecondaryPermission(ctx, options)
}

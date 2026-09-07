import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { sessionUserOwnsEmployee } from '#helpers/session_user_owns_employee'
import { respondPermissionGateDenial } from '#helpers/permission_gate_http'
import PermissionGateService from '#services/permission_gate_service'

/**
 * Lectura de la foto biométrica de un colaborador.
 *
 * La sesión que es ese colaborador pasa sin permiso de backoffice: la app del
 * empleado necesita su propia foto para checar y no puede depender de un permiso
 * de administración. Cualquier otra sesión —backoffice de RH, kiosco— sí lo
 * exige.
 *
 * A diferencia de `ensureEmployeeTabRead`, resuelve con `evaluateEnforced`: el
 * dato es biométrico y el interruptor de exigencia del módulo `employees` está
 * apagado, así que honrarlo dejaría la foto de cualquiera al alcance de
 * cualquier sesión autenticada de la misma unidad.
 *
 * [employeeId] dueño de la foto que se pide, tal como viene en la ruta.
 * [options] permiso de administración que se exige a quien no es el dueño.
 */
export async function ensureEmployeeBiometricRead(
  ctx: HttpContext,
  employeeId: number,
  options: PermissionGateOptions
): Promise<boolean> {
  if (await sessionUserOwnsEmployee(ctx.auth.user, employeeId)) {
    return true
  }
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluateEnforced(ctx.auth.user, options)
  if (decision.allowed) {
    return true
  }
  respondPermissionGateDenial(ctx, decision)
  return false
}

import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import PermissionGateService from '#services/permission_gate_service'
import { respondPermissionGateDenial } from '#helpers/permission_gate_http'

/**
 * Evalúa un permiso con la misma regla del gate (exigencia, bypass,
 * concesiones) sin responder. Sirve cuando el permiso no decide si la
 * operación procede sino qué parte de la respuesta se entrega.
 *
 * @returns `true` si el gate dejaría pasar al usuario de la sesión.
 */
export async function evaluateSecondaryPermission(
  ctx: HttpContext,
  options: PermissionGateOptions
): Promise<boolean> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluate(ctx.auth.user, options)
  return decision.allowed
}

/**
 * Segundo permiso de una operación de doble asunto (convención órdenes 8–14).
 * Debe llamarse solo cuando el segundo asunto realmente cambia.
 */
export async function ensureSecondaryPermission(
  ctx: HttpContext,
  options: PermissionGateOptions
): Promise<boolean> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluate(ctx.auth.user, options)
  if (decision.allowed) {
    return true
  }
  respondPermissionGateDenial(ctx, decision)
  return false
}

import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
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
 * Igual que `evaluateSecondaryPermission`, pero devuelve la DECISIÓN y sin
 * consultar la exigencia del módulo (`evaluateEnforced`).
 *
 * Las dos diferencias existen por la misma operación: una lectura que acepta
 * cualquiera de DOS módulos (convención de doble asunto). Con `evaluate`, basta
 * con que uno de los dos tenga la exigencia apagada en BD para que la rama
 * devuelva `module-not-enforced` y la lectura quede abierta a cualquier
 * autenticado del tenant — incluso si el módulo apagado es ajeno a la pantalla
 * que la dispara. Y devolver la decisión, y no un booleano, permite distinguir
 * "no tienes permiso" de "no se pudo determinar", que es lo que el cliente
 * necesita para saber si reintentar.
 */
export async function evaluateSecondaryEnforcedDecision(
  ctx: HttpContext,
  options: PermissionGateOptions
): Promise<PermissionGateDecision> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  return service.evaluateEnforced(ctx.auth.user, options)
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

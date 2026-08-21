import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import { EMPLOYEES_SENSITIVE_READ_PERMISSIONS } from '#constants/employees_read_permission_declarations'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

export function isSensitiveReadAllowed(decision: PermissionGateDecision): boolean {
  return decision.reason === 'granted' || decision.reason === 'bypass'
}

export async function resolveSensitiveReadDecisions(
  ctx: HttpContext
): Promise<Record<LegalCategory, boolean>> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decisions = {} as Record<LegalCategory, boolean>

  for (const category of LEGAL_CATEGORIES) {
    const decision = await service.evaluateEnforced(
      ctx.auth.user,
      EMPLOYEES_SENSITIVE_READ_PERMISSIONS[category]
    )
    decisions[category] = isSensitiveReadAllowed(decision)
  }

  return decisions
}

/**
 * Reabre el ALS cuando Adonis JSON-encodea el cuerpo.
 *
 * `send` solo guarda el modelo en `lazyBody`. Lucid `serialize` corre en
 * `finish` → `writeBody` → `safeStringify`, después de que `next()` ya
 * devolvió y el `run` exterior se cerró. Sin este reingreso, `canRead`
 * es false para todos (incluido owner).
 */
function reenterSensitiveReadOnResponse(
  ctx: HttpContext,
  decisions: Record<LegalCategory, boolean>
): void {
  const response = ctx.response
  if (!response) {
    return
  }

  const originalSend = response.send.bind(response)
  response.send = ((body: unknown, generateEtag?: boolean) =>
    SensitiveAccessContext.run(decisions, () => originalSend(body, generateEtag))) as typeof response.send

  if (typeof response.json === 'function') {
    const originalJson = response.json.bind(response)
    response.json = ((body: unknown, generateEtag?: boolean) =>
      SensitiveAccessContext.run(decisions, () => originalJson(body, generateEtag))) as typeof response.json
  }

  if (typeof response.jsonp === 'function') {
    const originalJsonp = response.jsonp.bind(response)
    response.jsonp = ((body: unknown, callbackName?: string, generateEtag?: boolean) =>
      SensitiveAccessContext.run(decisions, () =>
        originalJsonp(body, callbackName, generateEtag)
      )) as typeof response.jsonp
  }

  if (typeof response.finish === 'function') {
    const originalFinish = response.finish.bind(response)
    response.finish = (() =>
      SensitiveAccessContext.run(decisions, () => originalFinish())) as typeof response.finish
  }
}

export async function runWithSensitiveReadDecisions(
  ctx: HttpContext,
  next: NextFn
): Promise<unknown> {
  const decisions = await resolveSensitiveReadDecisions(ctx)
  reenterSensitiveReadOnResponse(ctx, decisions)
  return SensitiveAccessContext.run(decisions, () => next())
}

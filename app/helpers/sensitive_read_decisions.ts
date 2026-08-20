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

export async function runWithSensitiveReadDecisions(
  ctx: HttpContext,
  next: NextFn
): Promise<unknown> {
  const decisions = await resolveSensitiveReadDecisions(ctx)
  return SensitiveAccessContext.run(decisions, () => next())
}

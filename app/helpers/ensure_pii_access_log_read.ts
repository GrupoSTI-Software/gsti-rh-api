import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import {
  PII_ACCESS_LOG_MODULE_SLUG,
  PII_AUDIT_ERROR_CODES,
} from '#constants/pii_audit_error_codes'
import { PiiAuditError } from '#exceptions/pii_audit_error'
import { isSensitiveReadAllowed } from '#helpers/sensitive_read_decisions'
import PermissionGateService from '#services/permission_gate_service'

const PII_ACCESS_LOG_READ_PERMISSION: PermissionGateOptions = {
  module: PII_ACCESS_LOG_MODULE_SLUG,
  action: 'read',
  bypass: 'standard',
}

/**
 * Exige el permiso `read` del módulo `sensitive-data-access-log` con
 * `evaluateEnforced`: el interruptor apagado no otorga.
 * Reusa `ctx.permissionGate` si el middleware de scope ya lo pobló.
 */
export async function ensurePiiAccessLogRead(ctx: HttpContext): Promise<void> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluateEnforced(ctx.auth.user, PII_ACCESS_LOG_READ_PERMISSION)
  if (isSensitiveReadAllowed(decision)) {
    return
  }
  throw new PiiAuditError(
    'No tienes permiso para consultar la bitácora de accesos a datos sensibles.',
    PII_AUDIT_ERROR_CODES.FORBIDDEN,
    403,
    'consulta-bitacora-denegada'
  )
}

import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'

const ERR = {
  DENIED: {
    key: PERMISSION_GATE_ERROR_CODES.DENIED,
    title: 'Sin permiso',
    detail: 'No tienes permiso para realizar esta operación.',
  },
  UNRESOLVED: {
    key: PERMISSION_GATE_ERROR_CODES.UNRESOLVED,
    title: 'No se pudo verificar el permiso',
    detail: 'No fue posible determinar los permisos de tu cuenta. Intenta de nuevo.',
  },
} as const

/**
 * Forma única de negativa del PermissionGate (USRH1785766406721).
 * Usada por el middleware y por evaluaciones secundarias en controlador.
 */
export function respondPermissionGateDenial(
  ctx: HttpContext,
  decision: Pick<PermissionGateDecision, 'reason'>
) {
  const err = decision.reason === 'unresolved' ? ERR.UNRESOLVED : ERR.DENIED
  return ctx.response.status(403).json({
    title: err.title,
    detail: err.detail,
    key: err.key,
  })
}

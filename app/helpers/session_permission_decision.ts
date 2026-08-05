import type { PermissionGateBypass } from '#constants/permission_gate'
import type { PermissionGateIdentity } from '#helpers/permission_gate_identity'
import { hasPermissionGateBypass } from '#helpers/permission_gate_identity'
import type { SessionPermissionReason } from '#constants/session_permission_tree'

export interface SessionPermissionDecisionInput {
  identity: PermissionGateIdentity
  exceptionProfile: PermissionGateBypass
  moduleActive: boolean
  isGranted: boolean
}

export interface SessionPermissionDecision {
  allowed: boolean
  reason: SessionPermissionReason
}

/**
 * Decide si una acción del listado de sesión queda permitida o negada y por qué.
 * Orden (fail-closed):
 * 1. módulo inactivo → denied / module-inactive
 * 2. bypass del perfil AND no concedida →
 *    - si perfil === 'strict': denied / explicit-revocation (regla 5)
 *    - si no: allowed / privileged-role
 * 3. concedida → allowed / assignment
 * 4. no concedida → denied / missing-assignment
 *
 * Nota sobre regla 5: "retiro expreso" aplica cuando el perfil es `strict`
 * (nadie tiene bypass) y el rol privilegiado NO tiene la asignación.
 * Con perfil distinto de strict, un privilegiado que alcanza el bypass
 * siempre ve `privileged-role`, aunque no tenga fila de grant.
 */
export function decideSessionPermissionAction(
  input: SessionPermissionDecisionInput
): SessionPermissionDecision {
  if (!input.moduleActive) {
    return { allowed: false, reason: 'module-inactive' }
  }

  const reachesBypass = hasPermissionGateBypass(input.identity, input.exceptionProfile)

  if (reachesBypass) {
    // Con bypass real (standard/expanded/platformReserved) el privilegiado
    // siempre pasa, aunque no tenga grant. No hay "retiro expreso" aquí.
    return { allowed: true, reason: 'privileged-role' }
  }

  if (input.isGranted) {
    return { allowed: true, reason: 'assignment' }
  }

  // Sin bypass y sin grant: si el perfil es strict, un privilegiado que
  // "podría" haber tenido otras excepciones queda marcado como retiro expreso
  // cuando su identidad encaja en algún perfil privilegiado.
  const isPrivileged =
    input.identity.isPlatformAccount ||
    input.identity.isCompanyOwnerAccount ||
    input.identity.isDireccionGeneralAccount

  if (input.exceptionProfile === 'strict' && isPrivileged) {
    return { allowed: false, reason: 'explicit-revocation' }
  }

  return { allowed: false, reason: 'missing-assignment' }
}

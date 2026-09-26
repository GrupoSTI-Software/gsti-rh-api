/**
 * Códigos de error estables del módulo de política de retención NOM-035.
 * Prefijo NOM035.RET = NOM-035 Retention Policy.
 */
export const RETENTION_POLICY_ERROR_CODES = {
  /** Parámetros de body inválidos (VineJS) */
  VAL_INPUT: 'NOM035.RET.VAL_INPUT',
  /** retentionYears < 1 (piso legal NOM-035 10.4) */
  INVALID_PERIOD: 'NOM035.RET.INVALID_PERIOD',
  /** Tipo de evidencia no pertenece al enum válido */
  INVALID_EVIDENCE_TYPE: 'NOM035.RET.INVALID_EVIDENCE_TYPE',
  /** Acceso cross-tenant o scope no resuelto */
  FORBIDDEN_SCOPE: 'NOM035.RET.FORBIDDEN_SCOPE',
  /** Error no tipado */
  SYS_UNHANDLED: 'NOM035.RET.SYS_UNHANDLED',
} as const

export type RetentionPolicyErrorCode =
  (typeof RETENTION_POLICY_ERROR_CODES)[keyof typeof RETENTION_POLICY_ERROR_CODES]

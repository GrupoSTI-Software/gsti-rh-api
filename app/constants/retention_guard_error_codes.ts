/**
 * Códigos de error estables del guard de retención de evidencia NOM-035.
 * Prefijo NOM035.retention = NOM-035 Retention Guard.
 */
export const RETENTION_GUARD_ERROR_CODES = {
  /** Registro individual protegido — antigüedad menor al periodo vigente */
  DELETE_BLOCKED: 'NOM035.retention.DELETE_BLOCKED',
  /** Al menos un registro protegido en un borrado en lote */
  BULK_DELETE_BLOCKED: 'NOM035.retention.BULK_DELETE_BLOCKED',
} as const

export type RetentionGuardErrorCode =
  (typeof RETENTION_GUARD_ERROR_CODES)[keyof typeof RETENTION_GUARD_ERROR_CODES]

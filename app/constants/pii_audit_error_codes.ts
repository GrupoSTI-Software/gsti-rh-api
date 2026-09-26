/**
 * Códigos de error estables para consulta de la bitácora de accesos a datos sensibles.
 *
 * Familia `SEC.AUD.*` — hermana de `SEC.REV.*` y `SEC.EXP.*`.
 *
 * Ref: USRH1783029948545 §6.
 */
export const PII_AUDIT_ERROR_CODES = {
  /** Query inválido (Vine) */
  VAL_INPUT: 'SEC.AUD.VAL.001',
  /** Rango de fechas inválido (`dateFrom > dateTo`) */
  VAL_DATE_RANGE: 'SEC.AUD.VAL.DATE.001',
  /** Sin permiso de consulta de bitácora */
  FORBIDDEN: 'SEC.AUD.FORB.001',
} as const

export type PiiAuditErrorCode = (typeof PII_AUDIT_ERROR_CODES)[keyof typeof PII_AUDIT_ERROR_CODES]

/** Slug del módulo RBAC que controla la consulta de bitácora. */
export const PII_ACCESS_LOG_MODULE_SLUG = 'sensitive-data-access-log'

/** Días por defecto cuando el cliente no envía rango de fechas. */
export const PII_ACCESS_LOG_DEFAULT_RANGE_DAYS = 30

/**
 * Códigos de error estables para exportaciones con datos sensibles.
 *
 * Familia `SEC.EXP.*` — permite reacción programática sin parsear mensajes.
 *
 * Ref: USRH1783029947540 §6.
 */
export const PII_EXPORT_ERROR_CODES = {
  /** Motivo ausente o fuera del catálogo */
  MOTIVE_REQUIRED: 'SEC.EXP.VAL.001',
  /** Motivo "otro" sin nota obligatoria */
  NOTE_REQUIRED: 'SEC.EXP.VAL.002',
  /** Falla al persistir el asiento agrupado (fail-closed) */
  AUDIT_FAILED: 'SEC.EXP.SYS.001',
} as const

export type PiiExportErrorCode = (typeof PII_EXPORT_ERROR_CODES)[keyof typeof PII_EXPORT_ERROR_CODES]

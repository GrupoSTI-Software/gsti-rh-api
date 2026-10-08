/**
 * Códigos de error estables de los ajustes de teletrabajo por empresa
 * (VLRH-H1791306074375). Prefijo TWS = TeleWork Settings.
 *
 * Los 422 (VAL) los emite el servicio de dominio por campo; el 403 FORBIDDEN
 * lo emite el helper RBAC del controller; UNRESOLVED_SCOPE lo emite el
 * servicio cuando el alcance de empresa no está resuelto.
 */
export const TELEWORK_COMPLIANCE_SETTING_ERROR_CODES = {
  /** Entrada inválida: el body no cumple la forma exigida (VineJS). */
  VAL_INPUT: 'TWS.VAL.001',
  /** Periodicidad de revalidación no entera o fuera de 1-12 meses (R4). */
  INVALID_REVALIDATION_MONTHS: 'TWS.VAL.002',
  /** Ventana de aviso no entera, menor a 1 o mayor/igual a meses * 30 (R5). */
  INVALID_NOTICE_DAYS: 'TWS.VAL.003',
  /** Monto negativo, de más de dos decimales o sobre el tope (R3). */
  INVALID_ALLOWANCE: 'TWS.VAL.004',
  /** Un usuario sin permiso del módulo intentó leer o editar los ajustes. */
  FORBIDDEN: 'TWS.AUTH.001',
  /** El alcance de empresa no está resuelto (id no entero o <= 0). */
  UNRESOLVED_SCOPE: 'TWS.AUTH.002',
  /** Error no tipado. */
  SYS_UNHANDLED: 'TWS.SYS.001',
} as const

export type TeleworkComplianceSettingErrorCode =
  (typeof TELEWORK_COMPLIANCE_SETTING_ERROR_CODES)[keyof typeof TELEWORK_COMPLIANCE_SETTING_ERROR_CODES]

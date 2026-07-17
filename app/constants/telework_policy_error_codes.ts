/**
 * Códigos estables para el cliente (editor del borrador de la Política de
 * Teletrabajo, NOM-037 numeral 5.2). Prefijo TWP = TeleWork Policy.
 */
export const TELEWORK_POLICY_ERROR_CODES = {
  /** Ya existe una política (borrador o publicada) para la empresa; no se reinicializa (regla 3). */
  ALREADY_EXISTS: 'TWP.CONF.001',
  /** La empresa aún no tiene ninguna política (falta inicializar). */
  NOT_FOUND: 'TWP.NF.001',
  /** El `components` del request no trae exactamente los 12 `key` esperados (regla 4). */
  INVALID_STRUCTURE: 'TWP.VAL.STRUCTURE.001',
  /** Se intentó editar/descartar una versión que ya está publicada (inmutable, defensa a futuro). */
  PUBLISHED_IMMUTABLE: 'TWP.CONF.002',
  /** Un usuario sin permiso del módulo de teletrabajo intentó leer/escribir. */
  FORBIDDEN: 'TWP.AUTH.001',
} as const

export type TeleworkPolicyErrorCode =
  (typeof TELEWORK_POLICY_ERROR_CODES)[keyof typeof TELEWORK_POLICY_ERROR_CODES]

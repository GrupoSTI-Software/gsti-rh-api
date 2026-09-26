/**
 * Catálogo estable de códigos de error del módulo de consulta del marco
 * regulatorio (USRH1785167064404). Prefijo `REG` = Regulatory framework.
 */
export const REGULATORY_FRAMEWORK_ERROR_CODES = {
  /** Autoridad reguladora por slug inexistente o inactiva */
  AUTHORITY_NOT_FOUND: 'REG.NF.001',
  /** Norma por código inexistente */
  REGULATION_NOT_FOUND: 'REG.NF.002',
  /** Numeral inexistente en la norma indicada */
  CLAUSE_NOT_FOUND: 'REG.NF.003',
  /** Parámetro de consulta inválido (`has_regulations`, `country`, formato de `:code`/`:clauseCode`) */
  VAL_INPUT: 'REG.VAL.001',
  /** Error no tipado (catch-all del controller) */
  SYS_UNHANDLED: 'REG.SYS.001',
} as const

export type RegulatoryFrameworkErrorCode =
  (typeof REGULATORY_FRAMEWORK_ERROR_CODES)[keyof typeof REGULATORY_FRAMEWORK_ERROR_CODES]

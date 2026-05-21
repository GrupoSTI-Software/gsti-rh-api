export const PCR_ERROR_CODES = {
  /** Vine u otra validación del cuerpo */
  VAL_INPUT: 'PCR.VAL.001',
  /** Puesto inexistente o dado de baja */
  POSITION_NOT_FOUND: 'PCR.NF.POS.001',
  /** Una o más certificaciones no existen */
  CERTIFICATION_NOT_FOUND: 'PCR.NF.CERT.001',
  /** Relación position-certification inexistente al eliminar */
  REQUIREMENT_NOT_FOUND: 'PCR.NF.REQ.001',
  /** Certificación ya asignada al puesto (duplicado) */
  REQUIREMENT_DUPLICATE: 'PCR.CONF.001',
  /**
   * Certificación no aplicable: tiene unidades de negocio asignadas
   * y ninguna coincide con la del puesto.
   */
  CERTIFICATION_NOT_APPLICABLE: 'PCR.UNAP.001',
  /** Error no tipado dentro del dominio */
  SYS_UNHANDLED: 'PCR.SYS.001',
} as const

export type PcrErrorCode = (typeof PCR_ERROR_CODES)[keyof typeof PCR_ERROR_CODES]

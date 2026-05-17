export const CERTIFICATION_ERROR_CODES = {
  /** Vine u otra validación del cuerpo o query */
  VAL_INPUT: 'CERT.VAL.001',
  /** Categoría inexistente o inactiva */
  CATEGORY_NOT_FOUND: 'CERT.NF.CAT.001',
  /** Una o más unidades de negocio no existen o están dadas de baja */
  BUSINESS_UNIT_NOT_FOUND: 'CERT.NF.BU.001',
  /** Certificación inexistente al editar o eliminar */
  CERTIFICATION_NOT_FOUND: 'CERT.NF.PSS.001',
  /** Nombre repetido dentro de la misma categoría (sin distinguir mayúsculas tras normalizar espacios) */
  CERTIFICATION_DUPLICATE: 'CERT.PSS.CONF.001',
  /** Error no tipado dentro del dominio certificaciones */
  SYS_UNHANDLED: 'CERT.SYS.001',
} as const

export type CertificationErrorCode = (typeof CERTIFICATION_ERROR_CODES)[keyof typeof CERTIFICATION_ERROR_CODES]

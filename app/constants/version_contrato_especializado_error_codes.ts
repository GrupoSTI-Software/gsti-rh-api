/**
 * Catálogo estable de códigos de error del módulo de versiones
 * históricas de contratos de servicios especializados REPSE.
 */
export const VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'VCE.VAL.001',
  /** Payload de addendum inválido (campos, fechas o folioRepse) */
  VAL_ADDENDUM: 'VCE.VAL.ADDENDUM.001',
  /** Fechas de vigencia incoherentes (inicio posterior a fin) */
  VAL_VIGENCIA: 'VCE.VAL.VIGENCIA.001',
  /** Contrato no encontrado en el tenant */
  CONTRATO_NOT_FOUND: 'VCE.NF.001',
  /** Versión histórica no encontrada */
  VERSION_NOT_FOUND: 'VCE.NF.002',
  /** Contrato en estatus no renovable (borrador o cancelado) */
  NOT_RENEWABLE: 'VCE.CONFLICT.001',
  /** Contrato no addendable (estatus distinto de vigente) */
  NOT_ADDENDABLE: 'VCE.CONFLICT.ADDENDUM.001',
  /** Anexo 15-D ausente al intentar snapshot */
  SNAPSHOT_INCOMPLETE: 'VCE.CONFLICT.002',
  /** Intento de mutar contenido write-once */
  IMMUTABLE: 'VCE.CONFLICT.003',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'VCE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'VCE.SYS.001',
} as const

export type VersionContratoEspecializadoErrorCode =
  (typeof VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES)[keyof typeof VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES]

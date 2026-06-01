/**
 * Catálogo estable de códigos de error del módulo de contratos
 * de servicios especializados REPSE (anexo 15-D LFT).
 */
export const CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'CSE.VAL.001',
  /** Coherencia de fechas inválida */
  VAL_FECHAS: 'CSE.VAL.FECHAS.001',
  /** Contrato inexistente o ajeno al tenant */
  NOT_FOUND: 'CSE.NF.001',
  /** Empresa contratante inexistente o ajena al tenant */
  CONTRATANTE_NOT_FOUND: 'CSE.NF.CONTRATANTE.001',
  /** Registro REPSE activo no encontrado en el tenant */
  REPSE_NOT_FOUND: 'CSE.NF.REPSE.001',
  /** Número de contrato duplicado en el tenant */
  NUMERO_DUPLICATE: 'CSE.CONFLICT.NUMERO.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'CSE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'CSE.SYS.001',
} as const

export type ContratoServicioEspecializadoErrorCode =
  (typeof CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES)[keyof typeof CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES]

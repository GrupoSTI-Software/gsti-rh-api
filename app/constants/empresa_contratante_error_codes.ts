/**
 * Catálogo estable de códigos de error del módulo de empresas contratantes REPSE.
 */
export const EMPRESA_CONTRATANTE_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'ECNT.VAL.001',
  /** RFC con formato o dígito verificador SAT inválido */
  RFC_INVALID: 'ECNT.VAL.RFC.001',
  /** RFC duplicado en el catálogo del tenant */
  RFC_DUPLICATE: 'ECNT.CONFLICT.RFC.001',
  /** Empresa contratante inexistente o ajena al tenant */
  NOT_FOUND: 'ECNT.NF.001',
  /** BusinessUnit inexistente o ajena al tenant */
  BUSINESS_UNIT_NOT_FOUND: 'ECNT.NF.BU.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'ECNT.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ECNT.SYS.001',
} as const

export type EmpresaContratanteErrorCode =
  (typeof EMPRESA_CONTRATANTE_ERROR_CODES)[keyof typeof EMPRESA_CONTRATANTE_ERROR_CODES]

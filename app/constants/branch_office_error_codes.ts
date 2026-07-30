/**
 * Códigos estables para el cliente (sucursales / branch offices).
 * Prefijo BRCH = Branch (sucursal).
 */
export const BRANCH_OFFICE_ERROR_CODES = {
  /** Parámetros de query o body inválidos (Vine) */
  VAL_INPUT: 'BRCH.VAL.001',
  /** Sucursal inexistente, eliminada o fuera del scope del usuario autenticado */
  NOT_FOUND: 'BRCH.NOT.001',
  /** businessUnitId no pertenece al scope de unidades de negocio del usuario */
  BU_NOT_ALLOWED: 'BRCH.BU.001',
  /** Sucursal ya ligada a otra empresa contratante */
  ALREADY_LINKED: 'BRCH.CONFLICT.LINK.001',
  /** Error no tipado en el controlador (revisar logs) */
  SYS_UNHANDLED: 'BRCH.SYS.001',
} as const

export type BranchOfficeErrorCode =
  (typeof BRANCH_OFFICE_ERROR_CODES)[keyof typeof BRANCH_OFFICE_ERROR_CODES]

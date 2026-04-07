/**
 * Códigos estables para el cliente (sucursales / branch offices).
 * Prefijo BRCH = Branch (sucursal).
 */
export const BRANCH_OFFICE_ERROR_CODES = {
  /** Parámetros de query o body inválidos (Vine) */
  VAL_INPUT: 'BRCH.VAL.001',
  /** Sucursal inexistente, eliminada o fuera del alcance SYSTEM_BUSINESS */
  NOT_FOUND: 'BRCH.NOT.001',
  /** SYSTEM_BUSINESS vacío o sin slugs válidos al crear/editar unidad */
  CFG_SYSTEM_BUSINESS: 'BRCH.CFG.001',
  /** businessUnitId no existe, inactiva o su slug no está en SYSTEM_BUSINESS */
  BU_NOT_ALLOWED: 'BRCH.BU.001',
  /** Error no tipado en el controlador (revisar logs) */
  SYS_UNHANDLED: 'BRCH.SYS.001',
} as const

export type BranchOfficeErrorCode =
  (typeof BRANCH_OFFICE_ERROR_CODES)[keyof typeof BRANCH_OFFICE_ERROR_CODES]

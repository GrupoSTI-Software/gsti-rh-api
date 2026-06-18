/**
 * Códigos estables para cuotas de plantilla por sucursal y turno.
 * Prefijo BRCH.SQ = Branch office Shift Quota.
 */
export const BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES = {
  /** Parámetros de body inválidos (VineJS) */
  VAL_INPUT: 'BRCH.SQ.VAL.001',
  /** branchOfficeId de ruta no es un entero positivo */
  VAL_BRANCH_OFFICE_ID: 'BRCH.SQ.VAL.BRCH.001',
  /** shiftId repetido en el payload */
  VAL_SHIFT_DUPLICATE: 'BRCH.SQ.VAL.DUP.001',
  /** Sucursal inexistente, eliminada o fuera del scope */
  BRANCH_NOT_FOUND: 'BRCH.SQ.NF.BRCH.001',
  /** Turno inexistente o no disponible para la unidad de la sucursal */
  SHIFT_NOT_FOUND: 'BRCH.SQ.NF.SHIFT.001',
  /** minimum > required o valores fuera de rango de negocio */
  INVALID_QUOTA: 'BRCH.SQ.VAL.QUOTA.001',
  /** Error no tipado */
  SYS_UNHANDLED: 'BRCH.SQ.SYS.001',
} as const

export type BranchOfficeShiftQuotaErrorCode =
  (typeof BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES)[keyof typeof BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES]

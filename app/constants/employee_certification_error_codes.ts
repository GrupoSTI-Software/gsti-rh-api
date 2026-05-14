export const EC_ERROR_CODES = {
  /** Vine / parámetro inválido */
  VAL_INPUT: 'EC.VAL.001',
  /** Empleado inexistente o dado de baja */
  EMPLOYEE_NOT_FOUND: 'EC.NF.EMP.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'EC.SYS.001',
} as const

export type EcErrorCode = (typeof EC_ERROR_CODES)[keyof typeof EC_ERROR_CODES]

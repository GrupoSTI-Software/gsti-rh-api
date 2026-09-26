/**
 * Catálogo estable de códigos de error del nivel de puesto asignado al
 * empleado (USRH1785964117188). Gramática `<AREA>.<BUCKET>.NNN`, espejo de
 * `employee_badge_error_codes.ts`.
 *
 * Los 409 de "nivel con personal asignado" NO viven aquí: son del dominio de
 * la configuración por puesto (`ORG.POSLEVELCFG.*`) y no se espejan a `ELVL.*`.
 */
export const EMPLOYEE_POSITION_LEVEL_ERROR_CODES = {
  /**
   * `positionLevelConfigId` no es un entero positivo. Reservado: en la
   * práctica Vine intercepta antes; queda como check defensivo del helper.
   */
  VAL_INPUT: 'ELVL.VAL.001',
  /**
   * El nivel no pertenece a los niveles configurados del puesto efectivo del
   * payload: otro puesto, otro tenant o soft-deleted — indistinguibles.
   */
  NOT_IN_POSITION: 'ELVL.CONF.001',
  /** Nivel del puesto pero inactivo, en una asignación nueva (regla 6). */
  INACTIVE_NOT_ASSIGNABLE: 'ELVL.CONF.002',
} as const

export type EmployeePositionLevelErrorCode =
  (typeof EMPLOYEE_POSITION_LEVEL_ERROR_CODES)[keyof typeof EMPLOYEE_POSITION_LEVEL_ERROR_CODES]

import type { EmployeePositionLevelErrorCode } from '../constants/employee_position_level_error_codes.js'

/**
 * Excepción de dominio del nivel de puesto asignado al empleado
 * (USRH1785964117188). Espejo de `EmployeeBadgeError`: lleva el código
 * estable, el HTTP status sugerido y la `key` kebab-case que el cliente usa
 * para ramificar mensajes.
 */
export class EmployeePositionLevelError extends Error {
  readonly errorCode: EmployeePositionLevelErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: EmployeePositionLevelErrorCode,
    httpStatus: number = 422,
    key?: string
  ) {
    super(message)
    this.name = 'EmployeePositionLevelError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

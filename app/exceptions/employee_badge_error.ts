import type { EmployeeBadgeErrorCode } from '../constants/employee_badge_error_codes.js'

/**
 * Excepción de dominio del módulo "Gafete del empleado" (USRH1784686362321).
 * Espejo de `RepseProviderError`: lleva el código estable, el HTTP status
 * sugerido y, opcionalmente, la `key` kebab-case que el cliente usa para
 * mostrar mensajes específicos.
 */
export class EmployeeBadgeError extends Error {
  readonly errorCode: EmployeeBadgeErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: EmployeeBadgeErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'EmployeeBadgeError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

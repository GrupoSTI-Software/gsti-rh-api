import type { EmployeeOffboardingErrorCode } from '#constants/employee_offboarding_error_codes'

/** Keys kebab-case que el BO usa para ramificar su UI (spec §6). */
export type EmployeeOffboardingErrorKey =
  | 'concepto-nombre-duplicado'
  | 'concepto-no-encontrado'
  | 'referencia-invalida'
  | 'concepto-derivado-protegido'
  | 'concepto-derivado-duplicado'
  | 'orden-invalido'
  | 'concepto-en-uso'
  | 'colaborador-no-encontrado'
  | 'expediente-no-encontrado'
  | 'expediente-ya-abierto'
  | 'error-interno'
  | 'sin-permiso'
  | 'datos-invalidos'

/**
 * Excepción de dominio del módulo de salidas de personal (cadena CAP-05-07,
 * creada por USRH1786568279581). Molde literal de
 * `PositionLevelServiceError`: el servicio la construye con `title` y
 * `detail` ya localizados; `message` (heredado de Error) = detail.
 */
export default class EmployeeOffboardingServiceError extends Error {
  readonly key: EmployeeOffboardingErrorKey
  readonly errorCode: EmployeeOffboardingErrorCode
  readonly httpStatus: number
  readonly title: string

  constructor(params: {
    key: EmployeeOffboardingErrorKey
    errorCode: EmployeeOffboardingErrorCode
    httpStatus: number
    title: string
    detail: string
  }) {
    super(params.detail)
    this.name = 'EmployeeOffboardingServiceError'
    this.key = params.key
    this.errorCode = params.errorCode
    this.httpStatus = params.httpStatus
    this.title = params.title
  }
}

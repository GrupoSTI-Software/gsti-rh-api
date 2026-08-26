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
  | 'expediente-ya-cerrado'
  | 'expediente-no-cerrado'
  | 'expediente-cerrado'
  | 'pendiente-no-encontrado'
  | 'pendiente-ya-cumplido'
  | 'pendiente-no-cumplido'
  | 'importe-no-aplicable'
  | 'archivo-invalido'
  | 'archivo-demasiado-grande'
  | 'lote-invalido'
  | 'evidencia-no-encontrada'
  | 'evidencia-subida-fallida'
  | 'evidencia-descarga-fallida'
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
  /**
   * Carga adicional del error hacia el cliente (USRH1786568279593): el envío
   * de evidencias rechazado viaja con `rejectedFiles[]` para que el BO nombre
   * cada archivo ofensor (D-3). Opcional: el resto del módulo no lo usa.
   */
  readonly data?: Record<string, unknown>

  constructor(params: {
    key: EmployeeOffboardingErrorKey
    errorCode: EmployeeOffboardingErrorCode
    httpStatus: number
    title: string
    detail: string
    data?: Record<string, unknown>
  }) {
    super(params.detail)
    this.name = 'EmployeeOffboardingServiceError'
    this.key = params.key
    this.errorCode = params.errorCode
    this.httpStatus = params.httpStatus
    this.title = params.title
    this.data = params.data
  }
}

import type { AccessPointEmployeeErrorCode } from '#constants/access_point_employee_error_codes'

/** Keys kebab-case con las que el BO ramifica su interfaz. */
export type AccessPointEmployeeErrorKey =
  | 'punto-acceso-no-encontrado'
  | 'colaborador-no-encontrado'
  | 'asignacion-duplicada'
  | 'asignacion-no-encontrada'
  | 'datos-invalidos'
  | 'sin-permiso'
  | 'error-interno'

/**
 * Excepción de dominio de la asignación de empleados a puntos de acceso.
 *
 * El servicio la construye con `title` y `detail` ya localizados; `message`,
 * heredado de Error, queda igual a `detail`.
 */
export default class AccessPointEmployeeServiceError extends Error {
  readonly key: AccessPointEmployeeErrorKey
  readonly errorCode: AccessPointEmployeeErrorCode
  readonly httpStatus: number
  readonly title: string

  constructor(params: {
    key: AccessPointEmployeeErrorKey
    errorCode: AccessPointEmployeeErrorCode
    httpStatus: number
    title: string
    detail: string
  }) {
    super(params.detail)
    this.name = 'AccessPointEmployeeServiceError'
    this.key = params.key
    this.errorCode = params.errorCode
    this.httpStatus = params.httpStatus
    this.title = params.title
  }
}

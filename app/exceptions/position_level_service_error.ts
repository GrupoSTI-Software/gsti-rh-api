import type { PositionLevelErrorCode } from '#constants/position_level_error_codes'

/** Keys kebab-case que el BO usa para ramificar su UI (spec §6). */
export type PositionLevelErrorKey =
  | 'nivel-nombre-duplicado'
  | 'nivel-no-encontrado'
  | 'referencia-invalida'
  | 'nivel-en-uso'
  | 'orden-invalido'
  | 'sin-permiso'
  | 'datos-invalidos'

/**
 * Excepción de dominio del catálogo de niveles de puesto (USRH1785273891312).
 * Fusiona los precedentes `OrgAliasAppError` (key/title/detail) y
 * `EmployeeBadgeError` (errorCode/httpStatus). El servicio la construye con
 * `title` y `detail` ya localizados; `message` (heredado de Error) = detail.
 */
export default class PositionLevelServiceError extends Error {
  readonly key: PositionLevelErrorKey
  readonly errorCode: PositionLevelErrorCode
  readonly httpStatus: number
  readonly title: string

  constructor(params: {
    key: PositionLevelErrorKey
    errorCode: PositionLevelErrorCode
    httpStatus: number
    title: string
    detail: string
  }) {
    super(params.detail)
    this.name = 'PositionLevelServiceError'
    this.key = params.key
    this.errorCode = params.errorCode
    this.httpStatus = params.httpStatus
    this.title = params.title
  }
}

import type { PositionPositionLevelErrorCode } from '#constants/position_position_level_error_codes'

/** Keys kebab-case que el BO usa para ramificar su UI (spec §6). */
export type PositionPositionLevelErrorKey =
  | 'nivel-origen-ambiguo'
  | 'nivel-propio-sin-nombre'
  | 'nivel-duplicado-en-puesto'
  | 'nivel-fuera-de-catalogo'
  | 'mas-de-un-nivel-default'
  | 'default-en-nivel-inactivo'
  | 'nivel-con-personal-asignado'
  | 'puesto-no-encontrado'
  | 'sin-permiso'
  | 'datos-invalidos'

/**
 * Excepción de dominio de la configuración de niveles por puesto
 * (USRH1785273891313), espejo de `PositionLevelServiceError` (HU 01).
 * El servicio la construye con `title` y `detail` ya localizados;
 * `message` (heredado de Error) = detail.
 */
export default class PositionPositionLevelServiceError extends Error {
  readonly key: PositionPositionLevelErrorKey
  readonly errorCode: PositionPositionLevelErrorCode
  readonly httpStatus: number
  readonly title: string

  constructor(params: {
    key: PositionPositionLevelErrorKey
    errorCode: PositionPositionLevelErrorCode
    httpStatus: number
    title: string
    detail: string
  }) {
    super(params.detail)
    this.name = 'PositionPositionLevelServiceError'
    this.key = params.key
    this.errorCode = params.errorCode
    this.httpStatus = params.httpStatus
    this.title = params.title
  }
}

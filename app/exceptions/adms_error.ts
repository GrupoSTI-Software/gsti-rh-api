import type { AdmsErrorCode } from '#constants/adms_error_codes'

/**
 * Excepcion de dominio del canal ADMS. Espeja `AssistError`: codigo estable,
 * estatus HTTP para las rutas privadas, y `key`/`detail` del triplete GSTI.
 */
export class AdmsError extends Error {
  readonly code: AdmsErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    code: AdmsErrorCode,
    httpStatus: number = 422,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'AdmsError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

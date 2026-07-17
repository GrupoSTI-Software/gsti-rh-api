import type { RepseProviderErrorCode } from '../constants/repse_provider_error_codes.js'

/**
 * Excepción de dominio del módulo "Proveedores REPSE" (catálogo del
 * contratante y su bitácora de validaciones, USRH1784259105646).
 *
 * Lleva consigo el código estable, el HTTP status sugerido y, opcionalmente,
 * la `key` kebab-case que el frontend usa para mostrar mensajes específicos
 * (folio-proveedor-repse-ya-registrado, proveedor-repse-no-encontrado, etc.).
 */
export class RepseProviderError extends Error {
  readonly errorCode: RepseProviderErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: RepseProviderErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'RepseProviderError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

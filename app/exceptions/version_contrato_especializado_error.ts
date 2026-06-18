import type { VersionContratoEspecializadoErrorCode } from '../constants/version_contrato_especializado_error_codes.js'

/**
 * Excepción de dominio del módulo de versiones históricas de contratos REPSE.
 */
export class VersionContratoEspecializadoError extends Error {
  readonly errorCode: VersionContratoEspecializadoErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: VersionContratoEspecializadoErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'VersionContratoEspecializadoError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

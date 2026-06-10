import type { AsignacionContratoEspecializadoErrorCode } from '../constants/asignacion_contrato_especializado_error_codes.js'

/**
 * Excepción de dominio del módulo de asignaciones de trabajadores a contratos REPSE.
 */
export class AsignacionContratoEspecializadoError extends Error {
  readonly errorCode: AsignacionContratoEspecializadoErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: AsignacionContratoEspecializadoErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'AsignacionContratoEspecializadoError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

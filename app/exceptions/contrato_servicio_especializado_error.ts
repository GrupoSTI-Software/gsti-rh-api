import type { ContratoServicioEspecializadoErrorCode } from '../constants/contrato_servicio_especializado_error_codes.js'

/**
 * Excepción de dominio del módulo de contratos de servicios especializados REPSE.
 */
export class ContratoServicioEspecializadoError extends Error {
  readonly errorCode: ContratoServicioEspecializadoErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: ContratoServicioEspecializadoErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'ContratoServicioEspecializadoError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

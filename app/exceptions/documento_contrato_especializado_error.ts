import type { DocumentoContratoEspecializadoErrorCode } from '../constants/documento_contrato_especializado_error_codes.js'

/**
 * Excepción de dominio del módulo de documentos firmados de contratos REPSE.
 */
export class DocumentoContratoEspecializadoError extends Error {
  readonly errorCode: DocumentoContratoEspecializadoErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: DocumentoContratoEspecializadoErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'DocumentoContratoEspecializadoError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

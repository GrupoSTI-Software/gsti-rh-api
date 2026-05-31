import type { EmpresaContratanteErrorCode } from '../constants/empresa_contratante_error_codes.js'

/**
 * Excepción de dominio del catálogo de empresas contratantes REPSE.
 */
export class EmpresaContratanteError extends Error {
  readonly errorCode: EmpresaContratanteErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: EmpresaContratanteErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'EmpresaContratanteError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

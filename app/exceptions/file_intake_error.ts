import type { FileIntakeErrorCode } from '../constants/file_intake_error_codes.js'

/**
 * Rechazo de un archivo en la entrada, con el triplete del estandar
 * (titulo, detalle y key) ya resuelto. Nunca lleva el nombre original del
 * archivo ni su ruta temporal: el detalle es accionable, no un eco del input.
 */
export class FileIntakeError extends Error {
  readonly errorCode: FileIntakeErrorCode
  /**
   * Codigo HTTP. Se llama `status` a proposito: es la propiedad que lee el
   * manejador de excepciones de Adonis cuando un error llega sin mapear. Con
   * `httpStatus` el framework caia a 500 y, fuera de produccion, respondia con
   * volcado de pila.
   */
  readonly status: number
  readonly title: string
  readonly detail: string
  readonly key: string

  constructor(params: {
    title: string
    detail: string
    key: string
    errorCode: FileIntakeErrorCode
    status?: number
  }) {
    super(params.detail)
    this.name = 'FileIntakeError'
    this.title = params.title
    this.detail = params.detail
    this.key = params.key
    this.errorCode = params.errorCode
    this.status = params.status ?? 422
  }
}

import type { TexErrorCode } from '../constants/traumatic_event_exam_error_codes.js'

/**
 * Excepción de dominio del módulo de resultados de examen de evento traumático.
 * Lleva consigo el código estable (`code`) y el HTTP status sugerido.
 */
export class TraumaticEventExamError extends Error {
  readonly code: TexErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(message: string, code: TexErrorCode, httpStatus: number = 400, key?: string) {
    super(message)
    this.name = 'TraumaticEventExamError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
  }
}

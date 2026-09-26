import type { TrefErrorCode } from '../constants/traumatic_event_referral_error_codes.js'

/**
 * Excepción de dominio del módulo de canalizaciones de evento traumático.
 * Lleva consigo el código estable (`code`) y el HTTP status sugerido.
 */
export class TraumaticEventReferralError extends Error {
  readonly code: TrefErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(message: string, code: TrefErrorCode, httpStatus: number = 400, key?: string) {
    super(message)
    this.name = 'TraumaticEventReferralError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
  }
}

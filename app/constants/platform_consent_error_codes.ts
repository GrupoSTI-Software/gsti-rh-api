import type { PlatformConsentErrorKey } from '#exceptions/platform_consent_error'

/**
 * Códigos estables para el cliente — consentimiento y aceptaciones legales de plataforma.
 * Prefijo CONSENT.PLATFORM.
 *
 * Rangos reservados para historias hermanas del sub-slice: la historia C usa 001-009;
 * la historia D usa 010-019. No reutilizar números fuera de esos bloques.
 */
export const PLATFORM_CONSENT_ERROR_CODES = {
  /** Query de listado inválida: `search`, `status`, `page` o `limit` fuera de contrato (422). */
  INVALID_FILTERS: 'CONSENT.PLATFORM.001',
} as const

export type PlatformConsentErrorCode =
  (typeof PLATFORM_CONSENT_ERROR_CODES)[keyof typeof PLATFORM_CONSENT_ERROR_CODES]

/**
 * Código de cliente de cada key de `PlatformConsentError`. `Record` sobre la unión de keys:
 * agregar una key al error sin asignarle código aquí no compila.
 */
export const PLATFORM_CONSENT_ERROR_CODES_BY_KEY: Record<
  PlatformConsentErrorKey,
  PlatformConsentErrorCode
> = {
  'filtros-de-aceptaciones-invalidos': PLATFORM_CONSENT_ERROR_CODES.INVALID_FILTERS,
}

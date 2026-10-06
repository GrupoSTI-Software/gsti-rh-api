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
  /** Empresa inexistente o no activa en el historial por tenant (404). */
  TENANT_NOT_FOUND: 'CONSENT.PLATFORM.010',
  /** `page`/`perPage` fuera de contrato en el historial por tenant (422). */
  INVALID_HISTORY_PARAMS: 'CONSENT.PLATFORM.011',
  /** Aceptación de otra empresa, biométrica, inexistente o de cuenta de plataforma (404). */
  ACCEPTANCE_NOT_FOUND: 'CONSENT.PLATFORM.012',
  /** Falla el registro en bitácora o la lectura en claro en la misma transacción (500). */
  REVEAL_FAILED: 'CONSENT.PLATFORM.013',
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
  'empresa-no-encontrada': PLATFORM_CONSENT_ERROR_CODES.TENANT_NOT_FOUND,
  'parametros-de-historial-invalidos': PLATFORM_CONSENT_ERROR_CODES.INVALID_HISTORY_PARAMS,
  'aceptacion-no-encontrada': PLATFORM_CONSENT_ERROR_CODES.ACCEPTANCE_NOT_FOUND,
  'no-fue-posible-revelar-la-evidencia': PLATFORM_CONSENT_ERROR_CODES.REVEAL_FAILED,
}

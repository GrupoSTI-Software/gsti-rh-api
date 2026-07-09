import type { LegalDocumentType } from '#models/legal_document'

/**
 * Documentos legales exigidos por canal/audiencia (regla de negocio 3 y 4,
 * USRH1783101935670): la web (responsable de RH) acepta aviso + términos; la app del
 * empleado acepta además el consentimiento biométrico. Un usuario web nunca queda
 * pendiente ni bloqueado por el biométrico.
 *
 * La audiencia se deriva del servidor (ver `resolve_audience.ts`), nunca de un
 * parámetro que el cliente pueda manipular.
 */
export const AUDIENCE_REQUIRED_TYPES: Record<'web' | 'app', readonly LegalDocumentType[]> = {
  web: ['privacy_notice', 'terms_conditions'],
  app: ['privacy_notice', 'terms_conditions', 'biometric_consent'],
}

export type ConsentAudience = keyof typeof AUDIENCE_REQUIRED_TYPES

/**
 * Mapa de clave de error → código HTTP.
 * Permite que el controller resuelva el status sin acoplarse al dominio.
 */
export const CONSENT_ERROR_STATUS: Record<string, number> = {
  'version-de-consentimiento-invalida': 422,
  'tipo-de-documento-invalido': 422,
}

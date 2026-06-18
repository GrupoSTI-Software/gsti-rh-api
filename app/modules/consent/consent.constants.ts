/**
 * Versión vigente de los documentos de consentimiento (T&C + aviso de privacidad).
 *
 * Al actualizar los textos legales, incrementa esta constante.
 * El GET /api/consent/me compara la aceptación del usuario contra este valor:
 * si la versión aceptada es distinta, el usuario debe re-aceptar.
 *
 * Historial de versiones:
 *   1.0 — Versión inicial (jun 2026)
 */
export const CURRENT_CONSENT_VERSION = '1.0'

/**
 * Mapa de clave de error → código HTTP.
 * Permite que el controller resuelva el status sin acoplarse al dominio.
 */
export const CONSENT_ERROR_STATUS: Record<string, number> = {
  'version-de-consentimiento-invalida': 422,
}

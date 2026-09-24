import i18nManager from '@adonisjs/i18n/services/main'
import type { I18n } from '@adonisjs/i18n'

/**
 * Idioma de todo archivo descargable que genera el API (Excel, CSV, PDF):
 * única representación de la regla (2026-09-24).
 *
 * Los reportes salen siempre en español, sin importar el `Accept-Language` de
 * la petición ni el idioma del backoffice: se comparten con nómina, auditoría
 * y autoridades, y un mismo reporte no debe cambiar de idioma según quién lo
 * descargó. Las pantallas siguen el idioma del usuario; los archivos no.
 */
export const REPORT_LOCALE = 'es'

/** Traductor fijo en el idioma de los reportes, para `t()` y `formatMessage()`. */
export function reportI18n(): I18n {
  return i18nManager.locale(REPORT_LOCALE)
}

import { DateTime } from 'luxon'
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

/** Formato de fecha de calendario en todo descargable. */
export const REPORT_DATE_FORMAT = 'dd/MM/yyyy'

/**
 * Fecha de calendario (`dd/MM/yyyy`) de una columna DATE o de una fecha
 * guardada como medianoche UTC. La conexión está en UTC, así que se lee en
 * UTC: pasarla a la zona del sitio la correría un día. Vacío si no se puede
 * leer.
 */
export function formatReportCalendarDate(value: DateTime | Date | string | null | undefined): string {
  if (!value) return ''
  const parsed = DateTime.isDateTime(value)
    ? value.toUTC()
    : value instanceof Date
      ? DateTime.fromJSDate(value, { zone: 'utc' })
      : DateTime.fromISO(value, { zone: 'utc' })
  return parsed.isValid ? parsed.toFormat(REPORT_DATE_FORMAT) : ''
}

/**
 * Sello de generación de un reporte: `dd/MM/yyyy HH:mm (GMT-6)`, en la zona de
 * la fecha recibida. La zona se escribe como desfase para que siga a la zona
 * configurada y no a una etiqueta escrita a mano.
 */
export function formatReportGeneratedAt(value: DateTime): string {
  const local = value.setLocale(REPORT_LOCALE)
  return `${local.toFormat('dd/LL/yyyy HH:mm')} (${local.toFormat('ZZZZ')})`
}

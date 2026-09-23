import { REPORT_NEUTRAL_ARGB } from '#constants/report_neutral_theme'

/**
 * Reportes descargables del calendario unificado del backoffice.
 *
 * Las tres hojas comparten formato (una fila de encabezado resaltada y
 * anchos fijos por columna) para que se lean como una familia; los textos
 * salen del catálogo de idiomas con el prefijo `calendar_export_`.
 */

/**
 * Relleno del encabezado en ARGB: el gris neutral compartido por todos los
 * descargables (sin colores de marca, ver `report_neutral_theme.ts`).
 */
export const CALENDAR_EXPORT_HEADER_FILL = REPORT_NEUTRAL_ARGB.headerFill

/** Ancho mínimo y máximo de columna en caracteres de Excel. */
export const CALENDAR_EXPORT_COLUMN_MIN_WIDTH = 14
export const CALENDAR_EXPORT_COLUMN_MAX_WIDTH = 48

/** Formato de fecha de las celdas: el mismo que exhibe el calendario. */
export const CALENDAR_EXPORT_DATE_FORMAT = 'yyyy-LL-dd'

/** Nombre de archivo sugerido por reporte; el año se antepone en el controlador. */
export const CALENDAR_EXPORT_FILE_NAMES = {
  holidays: 'festividades.xlsx',
  birthdays: 'cumpleanos.xlsx',
  anniversaries: 'aniversarios.xlsx',
} as const

export type CalendarExportKind = keyof typeof CALENDAR_EXPORT_FILE_NAMES

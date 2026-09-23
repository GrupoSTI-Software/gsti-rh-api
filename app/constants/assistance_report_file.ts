/**
 * Prefijo del nombre de descarga de los reportes de asistencia, igual en el
 * flujo síncrono (`AssistsController`) y en el asíncrono (`ReportJobService`).
 * El nombre completo se arma con `buildDownloadFileName`: prefijo, slug del
 * empleado cuando aplica y periodo (`reporte-asistencia-2026-09-01-2026-09-15.xlsx`).
 */
export const ASSISTANCE_REPORT_FILE_PREFIX = {
  assistance: 'reporte-asistencia',
  incidentSummary: 'resumen-incidencias',
  incidentSummaryPayroll: 'resumen-incidencias-nomina',
} as const

export type AssistanceReportFileKind = keyof typeof ASSISTANCE_REPORT_FILE_PREFIX

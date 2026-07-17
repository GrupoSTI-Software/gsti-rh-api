import env from '#start/env'

/**
 * Si es true, calcula y expone columnas adicionales de HE doble/triple
 * con las horas extra no autorizadas del checador (entrada anticipada / salida tardía).
 * Las excepciones autorizadas se reportan solo en las columnas normales.
 */
export function isPayrollOvertimeIncludeUnauthorizedEnabled(): boolean {
  const raw = env.get('PAYROLL_OVERTIME_INCLUDE_UNAUTHORIZED')
  if (raw === undefined || raw === null || raw === '') {
    return false
  }
  return raw === 'true' || raw === '1'
}

/** Total de columnas del Excel de incidencias de nómina según el modo HE extendido. */
export function getIncidentPayrollExcelColumnCount(): number {
  return isPayrollOvertimeIncludeUnauthorizedEnabled() ? 19 : 17
}

/** Letra de la última columna del reporte (Q sin extendido, S con extendido). */
export function getIncidentPayrollExcelLastColumnLetter(): string {
  return isPayrollOvertimeIncludeUnauthorizedEnabled() ? 'S' : 'Q'
}

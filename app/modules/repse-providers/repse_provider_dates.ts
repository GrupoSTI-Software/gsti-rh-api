import { DateTime } from 'luxon'

/**
 * Zona horaria de referencia para todas las reglas de coherencia de fechas
 * del módulo "Proveedores REPSE" (USRH1784259105646, lado contratante).
 *
 * La conexión a MySQL está fijada a UTC (`config/database.ts: timezone: 'Z'`)
 * y el proceso Node no fija `TZ` de forma explícita, así que sin este anclaje
 * "hoy" podría calcularse hasta 6 horas antes de la medianoche real en México
 * si el proceso corre en UTC (mismo riesgo que resuelve `ASSISTS_TIME_ZONE` en
 * `app/services/payroll_overtime_unauthorized_service.ts`).
 */
export const REPSE_PROVIDER_TIMEZONE = 'America/Mexico_City'

/** "Hoy" (inicio de día) en la zona de referencia del negocio. */
export function todayInBusinessZone(): DateTime {
  return DateTime.now().setZone(REPSE_PROVIDER_TIMEZONE).startOf('day')
}

/**
 * Reinterpreta un `DateTime` (de cualquier zona, p. ej. la que Lucid le haya
 * asignado al leer una columna `DATE` de MySQL) como una fecha de calendario
 * pura en la zona de negocio. Estos campos (`folioVencimiento`, `fecha`,
 * `nextReviewAt`) no tienen componente de hora significativo: comparar sus
 * instantes UTC crudos filtraría el desfase de zona horaria del proceso; en
 * cambio, aquí solo importa el día calendario.
 */
export function toBusinessCalendarDate(value: DateTime): DateTime {
  return DateTime.fromISO(value.toISODate()!, { zone: REPSE_PROVIDER_TIMEZONE })
}

/** Parsea un string `YYYY-MM-DD` como fecha de calendario en la zona de negocio. */
export function parseBusinessCalendarDate(value: string): DateTime {
  return DateTime.fromISO(value, { zone: REPSE_PROVIDER_TIMEZONE })
}

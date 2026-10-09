import type { AttendanceMonitorActionSlug } from '#constants/attendance_monitor_permission_catalog'
import { EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS } from '#constants/employees_attendance_monitor_permission_declarations'

/**
 * Aviso por correo a RH de las checadas con ubicación simulada
 * (VLRH-H1791056340278).
 */

export const ASSIST_LOCATION_FLAG_NOTIFY_COMMAND = 'assist:notify-location-flags'

/** Cada hora en punto: como máximo un correo por empresa por hora (regla 2). */
export const ASSIST_LOCATION_FLAG_NOTIFY_CRON = '0 * * * *'

/** Tope de checadas por empresa y corrida; el exceso sale en la siguiente. */
export const ASSIST_LOCATION_FLAG_NOTIFY_MAX_PER_RUN = 500

/** Solo se avisan las checadas que llegaron en esta ventana (regla 4). */
export const ASSIST_LOCATION_FLAG_NOTIFY_MAX_AGE_DAYS = 7

/** Asunto fijo: nunca nombra a una persona (regla 8). */
export const ASSIST_LOCATION_FLAG_DIGEST_SUBJECT = 'Registros de asistencia con ubicación simulada'

/**
 * Quien puede ver la asistencia de la empresa recibe el aviso (regla 9): el
 * permiso "Ver el monitor de asistencia". El módulo sale de la declaración del
 * monitor y la acción se tipa contra su catálogo, sin escribir el slug aparte.
 */
export const ASSIST_LOCATION_FLAG_NOTIFY_MODULE =
  EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS.inactivateAssist.module
export const ASSIST_LOCATION_FLAG_NOTIFY_ACTION = 'read' satisfies AttendanceMonitorActionSlug

export const ASSIST_LOCATION_FLAG_DIGEST_VIEW = 'emails/assist_location_flag_digest'

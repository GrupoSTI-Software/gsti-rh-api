/** Módulo Eventos traumáticos. El aviso no usa el registro auditable vecino. */
export const TRAUMATIC_EVENT_REPORT_NOTIFY_MODULE_SLUG = 'traumatic-event-reports'

/**
 * Permiso "Editar eventos traumáticos". Es la concesión que decide quién
 * recibe el aviso en la empresa del reporte.
 */
export const TRAUMATIC_EVENT_REPORT_NOTIFY_PERMISSION = 'update'

/** Listado del apartado en el backoffice, relativo a `BACKOFFICE_URL`. */
export const TRAUMATIC_EVENT_REPORT_BOARD_MODULE_PATH = '/traumatic-event-reports'

/** Canales de la constancia. Hoy solo correo. */
export const TRAUMATIC_EVENT_REPORT_NOTIFICATION_CHANNELS = ['email'] as const

/** Resultado del intento. `sent` también cubre la entrega simulada del gate. */
export const TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUSES = ['sent', 'failed'] as const

export const TRAUMATIC_EVENT_REPORT_NOTIFICATION_CHANNEL = {
  EMAIL: 'email',
} as const

export const TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUS = {
  SENT: 'sent',
  FAILED: 'failed',
} as const

export type TraumaticEventReportNotificationChannel =
  (typeof TRAUMATIC_EVENT_REPORT_NOTIFICATION_CHANNELS)[number]

export type TraumaticEventReportNotificationStatus =
  (typeof TRAUMATIC_EVENT_REPORT_NOTIFICATION_STATUSES)[number]

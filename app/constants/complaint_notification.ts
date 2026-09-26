/** Slug del módulo de quejas en `system_modules`. */
export const COMPLAINT_MODULE_SLUG = 'complaints'

/**
 * Permiso CRUD que identifica a un administrador designado (`complaint.update` en BO).
 * En el catálogo del módulo corresponde al permiso `update` del buzón.
 */
export const COMPLAINT_MANAGE_PERMISSION = 'update'

/** Ruta del módulo en el backoffice (relativa a `BACKOFFICE_URL`). */
export const COMPLAINT_BOARD_MODULE_PATH = '/complaints'

/** Canales de notificación del buzón de quejas (NOM-035). */
export const COMPLAINT_NOTIFICATION_CHANNELS = ['email'] as const

/** Resultado del intento de envío registrado en `complaint_notification_logs`. */
export const COMPLAINT_NOTIFICATION_STATUSES = ['sent', 'failed'] as const

export const COMPLAINT_NOTIFICATION_CHANNEL = {
  EMAIL: 'email',
} as const

export const COMPLAINT_NOTIFICATION_STATUS = {
  SENT: 'sent',
  FAILED: 'failed',
} as const

export type ComplaintNotificationChannel = (typeof COMPLAINT_NOTIFICATION_CHANNELS)[number]
export type ComplaintNotificationStatus = (typeof COMPLAINT_NOTIFICATION_STATUSES)[number]

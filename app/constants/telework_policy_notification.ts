/**
 * Constantes de la bitácora de envíos de la Política de Teletrabajo
 * (difusión automática al publicar y recordatorios masivos,
 * USRH1783547655377). Espejo de `complaint_notification.ts`.
 */

/** Canales de envío (v1: solo correo). */
export const TELEWORK_POLICY_NOTIFICATION_CHANNELS = ['email'] as const

/** Tipo de envío: difusión automática al publicar o recordatorio masivo/selectivo. */
export const TELEWORK_POLICY_NOTIFICATION_TYPES = ['publication', 'reminder'] as const

/**
 * Resultado del intento de envío. `skipped` es la mejora deliberada sobre el
 * precedente (`notice_service`): un teletrabajador sin correo registrado no
 * se omite en silencio, queda visible y accionable (regla de negocio 5).
 */
export const TELEWORK_POLICY_NOTIFICATION_STATUSES = ['sent', 'failed', 'skipped'] as const

export const TELEWORK_POLICY_NOTIFICATION_CHANNEL = {
  EMAIL: 'email',
} as const

export const TELEWORK_POLICY_NOTIFICATION_TYPE = {
  PUBLICATION: 'publication',
  REMINDER: 'reminder',
} as const

export const TELEWORK_POLICY_NOTIFICATION_STATUS = {
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const

export type TeleworkPolicyNotificationChannel =
  (typeof TELEWORK_POLICY_NOTIFICATION_CHANNELS)[number]
export type TeleworkPolicyNotificationType = (typeof TELEWORK_POLICY_NOTIFICATION_TYPES)[number]
export type TeleworkPolicyNotificationStatus =
  (typeof TELEWORK_POLICY_NOTIFICATION_STATUSES)[number]

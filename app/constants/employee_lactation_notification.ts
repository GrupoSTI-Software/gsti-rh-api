/**
 * Catálogo cerrado de tipos de aviso del módulo de periodos de lactancia.
 *
 * Hoy sólo existe `expiring` (vencimiento a ≤ 30 días), pero la columna
 * `lactation_notification_type` se diseñó como `varchar(20)` para soportar
 * extensiones futuras sin migrar (ej. `start` para avisar al iniciar el
 * periodo, `expired` para avisar después de vencido, etc.).
 *
 * El set debe permanecer estable porque alimenta el ÍNDICE ÚNICO
 * `(employee_lactation_period_id, lactation_notification_type)` que
 * garantiza la idempotencia del comando agendado: cada periodo recibe
 * a lo sumo UN aviso de cada tipo.
 */
export const LACTATION_NOTIFICATION_TYPE = {
  /** Periodo activo cuyo fin cae dentro de `LACTATION_EXPIRING_THRESHOLD_DAYS`. */
  EXPIRING: 'expiring',
} as const

export type LactationNotificationTypeValue =
  (typeof LACTATION_NOTIFICATION_TYPE)[keyof typeof LACTATION_NOTIFICATION_TYPE]

export const LACTATION_NOTIFICATION_TYPE_VALUES = [
  LACTATION_NOTIFICATION_TYPE.EXPIRING,
] as const

/**
 * Slug del comando ace agendado. Único lugar canónico para referenciarlo
 * desde el scheduler y desde el endpoint manual `/run-expiring-check`,
 * evitando typos.
 */
export const LACTATION_NOTIFY_EXPIRING_COMMAND = 'lactation:notify-expiring'

/**
 * Subject del correo (en español) — usado como `defaultMessage` cuando el
 * resolver de i18n falla. Patrón `[NOM-037] Aviso de lactancia` para que
 * RH pueda filtrar los correos institucionales.
 */
export const LACTATION_EXPIRING_EMAIL_SUBJECT_PREFIX = '[NOM-037] Periodos de lactancia próximos a vencer'

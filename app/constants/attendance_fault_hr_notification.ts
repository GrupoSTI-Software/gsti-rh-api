/**
 * Slugs de rol (comparación en minúsculas y sin espacios extremos) para notificar
 * faltas de registro de asistencia. Solo usuarios activos con empleado asociado
 * (`person_id`) y `user_email` reciben el correo (sin filtrar por unidad de negocio).
 */
export const ATTENDANCE_FAULT_HR_ROLE_SLUGS: string[] = [
  'RH Manager',
  'Recursos Humanos'
]

/**
 * Rol cuyos usuarios reciben el correo al ejecutar `notify:attendance-fault-hr --test`.
 * Comparación case-insensitive contra `role_slug` en base de datos.
 */
export const ATTENDANCE_FAULT_HR_TEST_ROLE_SLUG = 'TESTER'

/** Slug del comando ace (cron externo o manual). */
export const NOTIFY_ATTENDANCE_FAULT_HR_COMMAND = 'notify:attendance-fault-hr'

/** Motivo auditado para TenantContext.runUnscoped en la corrida batch. */
export const ATTENDANCE_FAULT_HR_RUN_UNSCOPED_REASON =
  'Notificación de faltas de asistencia a RH por system setting activo (cross-empresa)'

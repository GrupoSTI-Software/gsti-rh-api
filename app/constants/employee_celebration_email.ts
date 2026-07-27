/**
 * Comandos ace de correos de celebración (cumpleaños y aniversario laboral).
 * Nombres preservados para no romper programación externa durante la transición al scheduler.
 */
export const BIRTH_DAY_EMAIL_COMMAND = 'birth:day-email'
export const BIRTHDAY_REMINDER_EMAIL_COMMAND = 'birthday:reminder-email'
export const ANNIVERSARY_DAY_EMAIL_COMMAND = 'anniversary:day-email'
export const ANNIVERSARY_REMINDER_EMAIL_COMMAND = 'anniversary:reminder-email'

/**
 * Cron diario de correos de celebración: 13:00 UTC = 07:00 CDMX.
 * Misma ventana que lactancia y avisos REPSE folio.
 */
export const EMPLOYEE_CELEBRATION_EMAIL_CRON = '0 13 * * *'

/** Comandos agendados en `start/scheduler.ts` (orden: empleado, RH). */
export const EMPLOYEE_CELEBRATION_SCHEDULED_COMMANDS = [
  BIRTH_DAY_EMAIL_COMMAND,
  BIRTHDAY_REMINDER_EMAIL_COMMAND,
  ANNIVERSARY_DAY_EMAIL_COMMAND,
  ANNIVERSARY_REMINDER_EMAIL_COMMAND,
] as const

export const EMPLOYEE_CELEBRATION_EMAIL_KIND = {
  BIRTHDAY_EMPLOYEE: 'birthday_employee',
  BIRTHDAY_HR_REMINDER: 'birthday_hr_reminder',
  ANNIVERSARY_EMPLOYEE: 'anniversary_employee',
  ANNIVERSARY_HR_REMINDER: 'anniversary_hr_reminder',
} as const

export type EmployeeCelebrationEmailKind =
  (typeof EMPLOYEE_CELEBRATION_EMAIL_KIND)[keyof typeof EMPLOYEE_CELEBRATION_EMAIL_KIND]

/** Motivos auditables para TenantContext.runUnscoped en cada tipo de corrida. */
export const EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS: Record<EmployeeCelebrationEmailKind, string> = {
  [EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_EMPLOYEE]:
    'Correos de felicitación de cumpleaños por system setting activo',
  [EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_HR_REMINDER]:
    'Recordatorios de cumpleaños a RH por system setting activo',
  [EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_EMPLOYEE]:
    'Correos de felicitación de aniversario laboral por system setting activo',
  [EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_HR_REMINDER]:
    'Recordatorios de aniversario laboral a RH por system setting activo',
}

/**
 * Lista de correos permitidos en ambientes no productivos (molde notice_service).
 * Fuera de producción solo estos destinatarios reciben correo real.
 */
export const DEVELOPMENT_EMAIL_LIST = [
  'jsoto@gruposti.com',
  'wramirez@siler-mx.com',
  'wilvardo@gmail.com',
] as const

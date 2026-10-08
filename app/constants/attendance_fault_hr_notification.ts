import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

/**
 * Módulo del Monitor de asistencia. El aviso de faltas no mira el nombre del
 * rol: mira esta acción en el rol efectivo de la empresa.
 */
export const ATTENDANCE_FAULT_HR_NOTIFY_MODULE_SLUG = 'employees-attendance-monitor'

/**
 * Permiso "Ver faltas consecutivas". Es la concesión que decide quién recibe
 * el aviso de faltas de esa empresa.
 */
export const ATTENDANCE_FAULT_HR_NOTIFY_PERMISSION = 'consecutive-faults'

/**
 * Rol cuyos usuarios reciben el correo al ejecutar `notify:attendance-fault-hr --test`.
 * Comparación case-insensitive contra el rol efectivo en la empresa del aviso.
 */
export const ATTENDANCE_FAULT_HR_TEST_ROLE_SLUG = 'TESTER'

/** Slug del comando ace (cron externo o manual). */
export const NOTIFY_ATTENDANCE_FAULT_HR_COMMAND = 'notify:attendance-fault-hr'

/** Motivo auditado para TenantContext.runUnscoped en la corrida batch. */
export const ATTENDANCE_FAULT_HR_RUN_UNSCOPED_REASON = TENANT_UNSCOPED_REASON.ATTENDANCE_FAULT_HR

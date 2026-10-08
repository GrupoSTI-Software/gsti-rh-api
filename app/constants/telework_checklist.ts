import { DateTime } from 'luxon'

/**
 * Slug del módulo de listas de verificación de teletrabajo. Fuente única del
 * identificador que usan el catálogo de módulos, las declaraciones de permisos
 * y las rutas del API.
 */
export const TELEWORK_CHECKLIST_MODULE_SLUG = 'telework-checklists'

/**
 * Modo de aplicación de una lista de verificación: `autoaplicada` la contesta
 * el propio teletrabajador; `visita_csh` la levanta el personal de seguridad y
 * salud en una visita al domicilio.
 */
export const TELEWORK_CHECKLIST_MODE = {
  SELF_APPLIED: 'autoaplicada',
  CSH_VISIT: 'visita_csh',
} as const

export type TeleworkChecklistMode =
  (typeof TELEWORK_CHECKLIST_MODE)[keyof typeof TELEWORK_CHECKLIST_MODE]

/**
 * Estado de una aplicación de la lista de verificación. `vigente` es el único
 * estado persistido que puede caducar por fecha; `vencida` se deriva en
 * `effectiveStatus`; `invalidada` y `reemplazada` son estados terminales por
 * decisión del negocio.
 */
export const TELEWORK_CHECKLIST_APPLICATION_STATUS = {
  CURRENT: 'vigente',
  EXPIRED: 'vencida',
  INVALIDATED: 'invalidada',
  REPLACED: 'reemplazada',
} as const

export type TeleworkChecklistApplicationStatus =
  (typeof TELEWORK_CHECKLIST_APPLICATION_STATUS)[keyof typeof TELEWORK_CHECKLIST_APPLICATION_STATUS]

/**
 * Resultado de un reactivo de la lista de verificación: `cumple`, `no_cumple`
 * o `no_aplica` cuando el reactivo no corresponde a la modalidad aplicada.
 */
export const TELEWORK_CHECKLIST_ANSWER_RESULT = {
  COMPLIANT: 'cumple',
  NON_COMPLIANT: 'no_cumple',
  NOT_APPLICABLE: 'no_aplica',
} as const

export type TeleworkChecklistAnswerResult =
  (typeof TELEWORK_CHECKLIST_ANSWER_RESULT)[keyof typeof TELEWORK_CHECKLIST_ANSWER_RESULT]

/**
 * Resultado global de una aplicación, calculado a partir de sus reactivos:
 * `aprobada` o `no_aprobada`.
 */
export const TELEWORK_CHECKLIST_OVERALL_RESULT = {
  APPROVED: 'aprobada',
  NOT_APPROVED: 'no_aprobada',
} as const

export type TeleworkChecklistOverallResult =
  (typeof TELEWORK_CHECKLIST_OVERALL_RESULT)[keyof typeof TELEWORK_CHECKLIST_OVERALL_RESULT]

/**
 * Motivos por los que una aplicación vigente puede invalidarse. `cambio_de_domicilio`
 * invalida la lista cuando el teletrabajador cambia de domicilio y la aplicación
 * deja de corresponder al lugar verificado.
 */
export const TELEWORK_CHECKLIST_INVALIDATION_REASONS = {
  ADDRESS_CHANGE: 'cambio_de_domicilio',
} as const

export type TeleworkChecklistInvalidationReason =
  (typeof TELEWORK_CHECKLIST_INVALIDATION_REASONS)[keyof typeof TELEWORK_CHECKLIST_INVALIDATION_REASONS]

/**
 * Estado efectivo de una aplicación: única fuente de la regla de caducidad.
 * Una aplicación `vigente` cuya `expiresAt` quedó antes de `today` se reporta
 * como `vencida`; en cualquier otro caso se devuelve el estado persistido.
 * `today` llega normalizado al inicio del día en la zona de negocio (CDMX).
 */
export function effectiveStatus(
  row: { status: TeleworkChecklistApplicationStatus; expiresAt: DateTime },
  today: DateTime
): TeleworkChecklistApplicationStatus {
  if (row.status === TELEWORK_CHECKLIST_APPLICATION_STATUS.CURRENT && row.expiresAt < today) {
    return TELEWORK_CHECKLIST_APPLICATION_STATUS.EXPIRED
  }
  return row.status
}

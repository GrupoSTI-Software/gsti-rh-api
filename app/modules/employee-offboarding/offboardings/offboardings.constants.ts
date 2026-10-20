/**
 * Constantes del expediente de salida (USRH1786568279587). Fuente única de
 * los tres estados (`open`, `closed`, `cancelled`) y los orígenes válidos;
 * strings en BD (no enum) para que un nuevo valor entre sin migración.
 */

/**
 * Estado del expediente. El cierre lo escribe USRH1786568279596; la
 * cancelación la escribe la reactivación (VLRH-H1790812613830) o la decisión
 * de RH con nota de motivo (VLRH-H1792172886315) y es terminal: el cancelado
 * se conserva como historial de solo lectura.
 */
export const EMPLOYEE_OFFBOARDING_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const

export type EmployeeOffboardingStatus =
  (typeof EMPLOYEE_OFFBOARDING_STATUS)[keyof typeof EMPLOYEE_OFFBOARDING_STATUS]

/**
 * Estados que admiten cambios (regla 3 de VLRH-H1790812613830). Lista de
 * permisión: un estado nuevo nace de solo lectura hasta que se agregue aquí.
 */
export const EMPLOYEE_OFFBOARDING_WRITABLE_STATUSES = [EMPLOYEE_OFFBOARDING_STATUS.OPEN] as const

/** `true` solo para los estados de `EMPLOYEE_OFFBOARDING_WRITABLE_STATUSES`. */
export function isOffboardingCaseWritable(status: string): boolean {
  return (EMPLOYEE_OFFBOARDING_WRITABLE_STATUSES as readonly string[]).includes(status)
}

/** Origen del expediente: programado a mano o abierto en automático al dar de baja. */
export const EMPLOYEE_OFFBOARDING_ORIGIN = {
  SCHEDULED: 'scheduled',
  TERMINATION: 'termination',
} as const

export type EmployeeOffboardingOrigin =
  (typeof EMPLOYEE_OFFBOARDING_ORIGIN)[keyof typeof EMPLOYEE_OFFBOARDING_ORIGIN]

/** Estado del pendiente. El cumplimiento lo escribe USRH1786568279590. */
export const EMPLOYEE_OFFBOARDING_ITEM_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
} as const

export type EmployeeOffboardingItemStatus =
  (typeof EMPLOYEE_OFFBOARDING_ITEM_STATUS)[keyof typeof EMPLOYEE_OFFBOARDING_ITEM_STATUS]

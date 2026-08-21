/**
 * Constantes del expediente de salida (USRH1786568279587). Fuente única de
 * los estados y orígenes válidos; strings en BD (no enum) para que un nuevo
 * valor entre sin migración.
 */

/** Estado del expediente. El cierre lo escribe USRH1786568279596. */
export const EMPLOYEE_OFFBOARDING_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const

export type EmployeeOffboardingStatus =
  (typeof EMPLOYEE_OFFBOARDING_STATUS)[keyof typeof EMPLOYEE_OFFBOARDING_STATUS]

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

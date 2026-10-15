import {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import { REVOKING_STATUSES } from './employee_sync_state.js'

/**
 * Constantes de los checadores pendientes de sincronizar (VLRH-H1790812613831).
 * Conjuntos cerrados del slice: `varchar` en BD, literal aquí.
 */

/** Por qué se cerró la marca: la persona volvió a quedar asignada, o la recalculó otra reactivación. */
export const ACCESS_POINT_RESYNC_RESOLUTION = {
  ASSIGNED: 'assigned',
  SUPERSEDED: 'superseded',
} as const

export type AccessPointResyncResolution =
  (typeof ACCESS_POINT_RESYNC_RESOLUTION)[keyof typeof ACCESS_POINT_RESYNC_RESOLUTION]

/** Qué debe hacer RH en ese checador (regla 2). El sistema nunca asigna por sí mismo. */
export const ACCESS_POINT_RESYNC_REQUIRED_ACTION = {
  ASSIGN: 'assign',
  FORCE_REVOKE_THEN_ASSIGN: 'force-revoke-then-assign',
} as const

export type ResyncRequiredAction =
  (typeof ACCESS_POINT_RESYNC_REQUIRED_ACTION)[keyof typeof ACCESS_POINT_RESYNC_REQUIRED_ACTION]

/** Estados que dejan viva la marca: en camino de baja o ya borrado. */
export const ACCESS_POINT_RESYNC_PENDING_STATUSES: readonly AccessPointEmployeeSyncStatus[] = [
  ...REVOKING_STATUSES,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
]

/**
 * Acción según el estado ACTUAL del vínculo: borrado completado → volver a
 * asignar; fallido o en curso → forzar el borrado y luego asignar; cualquier
 * otro estado ya salió del camino de baja y no se lista (`null`).
 */
export function requiredActionFor(
  status: AccessPointEmployeeSyncStatus
): ResyncRequiredAction | null {
  if (status === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED) {
    return ACCESS_POINT_RESYNC_REQUIRED_ACTION.ASSIGN
  }
  if (REVOKING_STATUSES.includes(status)) {
    return ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN
  }
  return null
}

import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'

/**
 * Maquina de estados del pivote empleado por dispositivo (spec ADMS 8.1).
 *
 * El camino de alta y el de baja son simetricos y no se cruzan: nada vuelve de
 * `revoked` al camino de alta sin pasar por una reasignacion explicita, que es
 * una operacion con nombre propio y con evento.
 */
const TRANSITIONS: Readonly<
  Record<AccessPointEmployeeSyncStatus, readonly AccessPointEmployeeSyncStatus[]>
> = {
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.FAILED,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.FAILED]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING]: [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED]: [
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
    ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
  ],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED]: [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING],
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED]: [],
}

/**
 * Estados en los que el PIN NO se puede reasignar (spec 8.1 y 5.2).
 *
 * Va desde que se pide el borrado hasta que hay evidencia de que el equipo lo
 * aplico. `revoked` ya no esta: ahi el aparato confirmo que el PIN quedo libre.
 *
 * Sin esta cuarentena, un PIN reciclado le acreditaria al nuevo contratado las
 * checadas que el equipo todavia genera con el registro del anterior.
 */
export const PIN_QUARANTINE_STATUSES: readonly AccessPointEmployeeSyncStatus[] = [
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
]

export function isPinQuarantined(status: AccessPointEmployeeSyncStatus): boolean {
  return PIN_QUARANTINE_STATUSES.includes(status)
}

export function canTransition(
  from: AccessPointEmployeeSyncStatus,
  to: AccessPointEmployeeSyncStatus
): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(
  from: AccessPointEmployeeSyncStatus,
  to: AccessPointEmployeeSyncStatus
): void {
  if (from === to) return
  if (canTransition(from, to)) return
  throw new AdmsError(
    `El colaborador no puede pasar de ${from} a ${to} en este equipo`,
    ADMS_ERROR_CODES.PIN_INVALID,
    409,
    'transicion-invalida',
    'El estado del colaborador en el equipo no admite ese cambio.'
  )
}

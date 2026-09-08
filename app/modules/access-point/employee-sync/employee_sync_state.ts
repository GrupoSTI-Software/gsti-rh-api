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
 * Estados en los que el PIN NO se puede reasignar a otra persona (spec 8.1).
 *
 * Va desde que se pide el borrado hasta que hay evidencia de que el equipo lo
 * aplico. `revoked` ya no esta: ahi el aparato confirmo que el PIN quedo libre.
 *
 * OJO: no confundir con retener CHECADAS, que es otro momento y otra regla
 * (spec 5.2, `isPinAmbiguousForPunches`). Mientras el borrado no sale del
 * servidor, el colaborador sigue dado de alta en el aparato y lo que marque es
 * suyo; lo que no se puede es darle ese numero a alguien mas todavia.
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

/**
 * Estado en el que una checada con ese PIN es AMBIGUA y se retiene (spec 5.2).
 *
 * Solo `revoke_acked`. Es el unico momento en que no se sabe de quien es la
 * checada: el equipo dijo que recibio el borrado pero no que lo aplico, asi que
 * el marcaje podria ser del colaborador que aun figura o de nadie.
 *
 * Antes de eso (`revoking`, `revoke_sent`) el registro sigue vivo en el aparato
 * y la checada es del colaborador de siempre: retenerla le quitaria tiempo
 * trabajado. Despues (`revoked`) el PIN ya se pudo reasignar y la resolucion
 * encuentra al nuevo dueno por su propio pivote.
 */
export function isPinAmbiguousForPunches(status: AccessPointEmployeeSyncStatus): boolean {
  return status === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
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

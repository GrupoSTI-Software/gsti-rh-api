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
  /**
   * Terminal por transicion. Se vuelve al camino de alta solo por una
   * reasignacion explicita, que `assign` hace fuera de esta maquina y con su
   * propio evento: es un acto de alguien, no el avance de un estado.
   */
  [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED]: [],
}

/**
 * Estados que retienen el PIN aunque la asignacion ya no este (spec 8.1).
 *
 * Van desde que se pide el borrado hasta que hay evidencia de que el equipo lo
 * aplico. Sirven para un caso concreto: si alguien retira la asignacion -- que
 * es un borrado logico -- mientras la baja va en camino, el numero seguiria
 * figurando como libre. Con esta lista no.
 *
 * `revoked` no esta aqui y no hace falta: un numero no se recicla mientras su
 * fila exista, la baja este confirmada o no. Quien decide eso es la consulta
 * de PIN ocupados, no esta lista.
 *
 * OJO: no confundir con retener CHECADAS, que es otro momento y otra regla
 * (spec 5.2, `isPinAmbiguousForPunches`).
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
 * trabajado. Despues (`revoked`) la duda se acabo y el numero no cambio de
 * dueno -- no se recicla --, asi que un marcaje rezagado con ese PIN sigue
 * siendo de quien lo tenia.
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

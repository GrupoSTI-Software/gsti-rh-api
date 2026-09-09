import type { DateTime } from 'luxon'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import { ACCESS_POINT_EMPLOYEE_EVENT_KIND } from '#models/access_point_employee_event'
import IncidentService from '#modules/adms/raw/incident.service'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import EmployeeSyncRepositoryMysql from './employee_sync.repository.mysql.js'
import type { EmployeeSyncRepository } from './employee_sync.repository.js'

export interface RosterReconciliationInput {
  accessPointId: number
  businessUnitId: number
  /** PINs que el equipo declaro tener, tal como vinieron en las lineas `USER`. */
  pins: string[]
  serial: string
  rawMessageId: number | null
  receivedAt: DateTime
}

export interface RosterReconciliationResult {
  confirmed: number
  revoked: number
  revokeFailed: number
}

/** Estados de baja en los que ver el PIN significa que el equipo no la aplico. */
const PENDING_REVOCATION: readonly AccessPointEmployeeSyncStatus[] = [
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED,
]

/**
 * Reconcilia el padron del equipo con el pivote (spec ADMS 8.1).
 *
 * `Return=0` de un borrado solo dice que el aparato recibio la orden. La unica
 * prueba de que la aplico es su propio padron: las lineas `USER PIN=` que sube
 * en `OPERLOG` cuando se le pide un `CHECK`. Sin esta reconciliacion, una baja
 * acusada se quedaba en `revoke_acked` para siempre -- con el PIN reservado
 * sin fin y las checadas de ese numero retenidas, porque en ese estado no se
 * sabe de quien son.
 *
 * Se lee en los dos sentidos:
 *  - El PIN aparece y se estaba borrando: el equipo NO lo aplico (`revoke_failed`).
 *  - El PIN aparece y el alta estaba en vuelo: el equipo la tiene (`confirmed`).
 *  - El PIN no aparece y el borrado ya estaba acusado: aplicado (`revoked`).
 */
export default class RosterReconciliationService {
  constructor(
    private readonly repository: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService()
  ) {}

  async reconcile(input: RosterReconciliationInput): Promise<RosterReconciliationResult> {
    const result: RosterReconciliationResult = { confirmed: 0, revoked: 0, revokeFailed: 0 }

    /**
     * Un lote sin una sola linea `USER` no dice nada del padron: puede ser una
     * subida de huellas o de bitacora. Concluir una baja desde ahi seria
     * liberar un PIN por no haber preguntado.
     */
    if (input.pins.length === 0) return result

    const declared = new Set(input.pins)
    const pivots = await AccessPointEmployee.query().where(
      'access_point_id',
      input.accessPointId
    )

    for (const pivot of pivots) {
      const pin = pivot.accessPointEmployeePin
      if (!pin || pin.length === 0) continue
      const status = pivot.accessPointEmployeeSyncStatus

      if (declared.has(pin)) {
        if (PENDING_REVOCATION.includes(status)) {
          await this.markRevokeFailed(pivot, input)
          result.revokeFailed += 1
          continue
        }
        if (status === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT) {
          await this.markConfirmed(pivot, input)
          result.confirmed += 1
        }
        continue
      }

      /**
       * Ausente y con el borrado ya acusado: aplicado. Se exige que el pivote
       * no se haya movido despues de que llego el lote -- si el borrado salio
       * mas tarde, este padron es anterior a la orden y no prueba nada.
       */
      if (
        status === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED &&
        pivot.accessPointEmployeeUpdatedAt <= input.receivedAt
      ) {
        await this.markRevoked(pivot, input)
        result.revoked += 1
      }
    }

    return result
  }

  private async markConfirmed(
    pivot: AccessPointEmployee,
    input: RosterReconciliationInput
  ): Promise<void> {
    const from = pivot.accessPointEmployeeSyncStatus
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
    pivot.accessPointEmployeeSyncConfirmedAt = input.receivedAt
    await this.repository.save(pivot)
    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
      fromStatus: from,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
      actorUserId: null,
      detail: 'El equipo declaro el PIN en su padron',
    })
  }

  private async markRevoked(
    pivot: AccessPointEmployee,
    input: RosterReconciliationInput
  ): Promise<void> {
    const from = pivot.accessPointEmployeeSyncStatus
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
    await this.repository.save(pivot)
    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
      fromStatus: from,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      actorUserId: null,
      detail: 'El PIN ya no aparece en el padron del equipo',
    })
  }

  /**
   * El equipo dijo que borro y el PIN sigue ahi.
   *
   * Se levanta incidente porque no es un estado de paso: alguien pidio una baja
   * que no ocurrio, y quien la pidio cree que esa persona ya no puede marcar.
   */
  private async markRevokeFailed(
    pivot: AccessPointEmployee,
    input: RosterReconciliationInput
  ): Promise<void> {
    const from = pivot.accessPointEmployeeSyncStatus
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED
    pivot.accessPointEmployeeSyncFailedAt = input.receivedAt
    pivot.accessPointEmployeeSyncFailureReason = 'El PIN sigue en el padron del equipo'
    await this.repository.save(pivot)
    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
      fromStatus: from,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
      actorUserId: null,
      detail: 'El PIN sigue en el padron del equipo',
    })

    await this.incidents.record({
      kind: ADMS_INCIDENT_KIND.REVOKE_NOT_APPLIED,
      severity: 'warning',
      code: ADMS_ERROR_CODES.CMD_NOT_APPLIED,
      title: 'La baja no se aplico en el checador',
      detail:
        'El equipo acuso el borrado pero su padron sigue declarando ese numero. Quien pidio la baja cree que esa persona ya no puede marcar.',
      key: 'baja-no-aplicada',
      serial: input.serial,
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      rawMessageId: input.rawMessageId,
      context: {},
      now: input.receivedAt,
    })
  }
}

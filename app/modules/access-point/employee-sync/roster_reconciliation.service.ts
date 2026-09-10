import type { DateTime } from 'luxon'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import { ACCESS_POINT_EMPLOYEE_EVENT_KIND } from '#models/access_point_employee_event'
import IncidentService from '#modules/adms/raw/incident.service'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import EmployeeSyncRepositoryMysql from './employee_sync.repository.mysql.js'
import type { EmployeeSyncRepository } from './employee_sync.repository.js'

export interface RosterReconciliationInput {
  accessPointId: number
  businessUnitId: number
  /** PINs que el equipo declaro tener, tal como vinieron en las lineas `USER`. */
  pins: string[]
  /**
   * El lote traia huellas.
   *
   * Una subida de biometricos no es un padron: puede no llevar una sola linea
   * `USER` y eso no significa que el equipo se haya quedado sin gente.
   */
  hasFingerprints: boolean
  serial: string
  rawMessageId: number | null
  receivedAt: DateTime
}

export interface RosterReconciliationResult {
  confirmed: number
  revoked: number
  revokeFailed: number
}

/**
 * Cuanto vale un `CHECK` como contexto de un lote vacio.
 *
 * El equipo contesta en segundos; diez minutos es holgado y corto frente al
 * riesgo de tomar por padron un `OPERLOG` de otra cosa.
 */
const ROSTER_ANSWER_MINUTES = 10

/**
 * Cuanto se espera al padron antes de leer el silencio como respuesta.
 *
 * Un equipo sin gente no sube nada al recibir un `CHECK`: acusa la orden y
 * calla, porque no tiene lineas que mandar. Medido en hardware. Pasado este
 * plazo, que le pidieramos el padron y no declarara a esa persona es la unica
 * evidencia que va a haber.
 */
const ROSTER_SILENCE_MINUTES = 10

/** Estados de baja en los que ver el PIN significa que el equipo no la aplico. */
/**
 * Ventana de silencio del aviso de "dado de baja y sigue dentro".
 *
 * El padron se pide seguido; un dia basta para que alguien lo atienda y evita
 * que el mismo hecho llene la bitacora sondeo tras sondeo.
 */
const REVOKED_STILL_PRESENT_DEDUPE_MINUTES = 1440

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
     * Un lote sin una sola linea `USER` casi nunca dice nada del padron: puede
     * ser una subida de huellas o de bitacora. Pero el padron VACIO existe --
     * es lo que responde un equipo al que le quitaron a todos -- y descartarlo
     * dejaba esas bajas sin cerrar para siempre.
     *
     * Se distingue por el contexto: si acabamos de pedirle el padron con un
     * `CHECK` y lo que sube no trae huellas, ese silencio es el padron.
     */
    if (input.pins.length === 0) {
      if (input.hasFingerprints) return result
      const respondeAlCheck = await this.wasRosterRequested(input.accessPointId, input.receivedAt)
      if (!respondeAlCheck) return result
    }

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
          continue
        }
        /**
         * La baja se cerro y la persona sigue dentro del aparato.
         *
         * Pasa cuando alguien cerro la baja a mano dando por muerto un equipo
         * que despues revivio. No hay falso positivo posible: un PIN no se
         * recicla --la baja lo deja reservado-- asi que ese numero solo puede
         * ser de esta persona.
         *
         * `revoked` es terminal --volver al camino de alta es un acto de
         * alguien, no el avance de un estado-- asi que no se mueve el pivote:
         * se levanta el aviso, que es lo unico que faltaba. Sin el, esa persona
         * sigue marcando en una puerta de la que se le saco y nadie se entera.
         */
        if (status === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED) {
          await this.reportRevokedStillPresent(pivot, pin, input)
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

  /**
   * Hay un `CHECK` acusado poco antes de este lote.
   *
   * Es lo que convierte un lote vacio en una respuesta: sin la peticion previa,
   * un `OPERLOG` sin usuarios es ruido de bitacora.
   */
  private async wasRosterRequested(accessPointId: number, receivedAt: DateTime): Promise<boolean> {
    const command = await DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.CHECK)
      .whereIn('device_command_status', [
        DEVICE_COMMAND_STATUS.ACKED,
        DEVICE_COMMAND_STATUS.EXECUTED,
      ])
      .where('device_command_acked_at', '>=', receivedAt.minus({ minutes: ROSTER_ANSWER_MINUTES }).toSQL({ includeOffset: false }) ?? '')
      .first()
    return command !== null
  }

  /**
   * Cierra las bajas que el equipo nunca contesto.
   *
   * Se apoya en el silencio, y por eso exige las dos condiciones: que el
   * `CHECK` sea POSTERIOR a la baja -- si no, no le preguntamos por esto -- y
   * que haya pasado el plazo. Sin ellas se estaria liberando un numero por no
   * haber esperado.
   */
  async closeSilentRevocations(now: DateTime): Promise<number> {
    const limite = now.minus({ minutes: ROSTER_SILENCE_MINUTES })
    const pendientes = await AccessPointEmployee.query().where(
      'access_point_employee_sync_status',
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
    )

    let cerradas = 0
    for (const pivot of pendientes) {
      const check = await DeviceCommand.query()
        .where('access_point_id', pivot.accessPointId)
        .where('device_command_kind', DEVICE_COMMAND_KIND.CHECK)
        .whereIn('device_command_status', [
          DEVICE_COMMAND_STATUS.ACKED,
          DEVICE_COMMAND_STATUS.EXECUTED,
        ])
        .whereNotNull('device_command_acked_at')
        .where('device_command_acked_at', '<=', limite.toSQL({ includeOffset: false }) ?? '')
        .where(
          'device_command_acked_at',
          '>=',
          pivot.accessPointEmployeeUpdatedAt.toSQL({ includeOffset: false }) ?? ''
        )
        .first()
      if (!check) continue

      await this.markRevoked(pivot, {
        accessPointId: pivot.accessPointId,
        businessUnitId: pivot.businessUnitId,
        pins: [],
        hasFingerprints: false,
        serial: '',
        rawMessageId: null,
        receivedAt: now,
      })
      cerradas += 1
    }
    return cerradas
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
      detail: 'El equipo no declara ese PIN tras pedirle su padron',
    })
  }

  /**
   * Avisa que el equipo declara a alguien cuya baja ya se dio por cerrada.
   *
   * Solo avisa. El pivote no se toca porque `revoked` es terminal por diseno, y
   * porque el remedio es una decision: reasignar y pedir la baja de nuevo ahora
   * que el aparato contesta, o limpiarlo en el equipo. Se deduplica por dia:
   * el padron se pide seguido y un aviso repetido en cada sondeo entrena a la
   * gente a ignorarlos.
   */
  private async reportRevokedStillPresent(
    pivot: AccessPointEmployee,
    pin: string,
    input: RosterReconciliationInput
  ): Promise<void> {
    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
      fromStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      actorUserId: null,
      detail: 'El equipo volvio a declarar ese numero despues de cerrada la baja',
    })

    await this.incidents.record(
      {
        kind: ADMS_INCIDENT_KIND.REVOKED_STILL_PRESENT,
        severity: 'warning',
        code: ADMS_ERROR_CODES.CMD_NOT_APPLIED,
        title: 'El checador sigue teniendo a alguien dado de baja',
        detail:
          'La baja se cerro sin confirmacion del equipo y ahora el aparato declara ese numero en su padron. Esa persona puede marcar en una puerta de la que ya se le retiro.',
        key: 'baja-cerrada-pero-presente',
        serial: input.serial,
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        rawMessageId: input.rawMessageId,
        context: { pin },
        now: input.receivedAt,
      },
      { dedupeMinutes: REVOKED_STILL_PRESENT_DEDUPE_MINUTES }
    )
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

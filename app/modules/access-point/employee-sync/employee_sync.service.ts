import { DateTime } from 'luxon'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_PIN_SOURCE,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import { ACCESS_POINT_EMPLOYEE_EVENT_KIND } from '#models/access_point_employee_event'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import EmployeeSyncRepositoryMysql from './employee_sync.repository.mysql.js'
import { assertTransition, REVOKING_STATUSES } from './employee_sync_state.js'
import type { EmployeeSyncRepository } from './employee_sync.repository.js'

/**
 * Tope del correlativo: nueve digitos es lo que acepta el patron del PIN, y
 * ningun equipo del catalogo llega a esa cantidad de personas. El limite existe
 * para que la busqueda termine, no porque se espere alcanzarlo.
 */
const MAX_CORRELATIVE_PIN = 999_999_999

/** Limite del firmware no medido; nueve digitos es lo que acepta el catalogo. */
export const ACCESS_POINT_PIN_PATTERN = /^\d{1,9}$/

export interface SyncActor {
  userId: number | null
}

export interface AssignInput {
  accessPointId: number
  businessUnitId: number
  employeeId: number
  pin?: string | null
  actor: SyncActor
}

export interface SetPinInput {
  accessPointId: number
  businessUnitId: number
  employeeId: number
  pin: string
  actor: SyncActor
}

/**
 * Alta, PIN y revocacion de un colaborador en un checador (spec ADMS 8).
 *
 * Todo lo que toca el PIN pasa por el bloqueo del dispositivo: dos altas
 * simultaneas no pueden quedarse con el mismo numero, y un PIN en cuarentena
 * no se le da a nadie mas.
 */
export default class EmployeeSyncService {
  constructor(
    private readonly repository: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService()
  ) {}

  /**
   * Asigna al colaborador en el equipo.
   *
   * Si ya estuvo y salio, la fila revive en vez de crear otra: el historial de
   * ese par no se parte en dos. Sale por dos caminos distintos -- el borrado
   * logico de la asignacion vieja y el `revoked` que deja una baja confirmada
   * por el aparato -- y los dos vuelven aqui.
   */
  async assign(input: AssignInput): Promise<AccessPointEmployee> {
    return this.repository.withDeviceLock(input.accessPointId, async () => {
      const existing = await this.repository.findPivotWithTrashed(
        input.accessPointId,
        input.employeeId
      )

      const proposedPin = await this.proposePin(
        input.accessPointId,
        input.pin,
        existing?.accessPointEmployeePin ?? null,
        existing?.accessPointEmployeeId
      )
      if (proposedPin !== null) {
        await this.assertPinFree(input.accessPointId, proposedPin, existing?.accessPointEmployeeId)
      }

      const salioDelEquipo =
        existing !== null &&
        (existing.deletedAt !== null ||
          existing.accessPointEmployeeSyncStatus ===
            ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)

      if (existing && salioDelEquipo) {
        existing.deletedAt = null
        existing.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN
        existing.accessPointEmployeePin = proposedPin ?? ''
        existing.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.ASSIGNED
        await this.repository.save(existing)
        await this.repository.recordEvent({
          accessPointEmployeeId: existing.accessPointEmployeeId,
          businessUnitId: input.businessUnitId,
          kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.REASSIGNED,
          toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN,
          toPin: proposedPin,
          actorUserId: input.actor.userId,
          detail: 'El colaborador vuelve a este equipo tras una revocacion',
        })
        return this.applyProposedPin(existing, proposedPin, input)
      }

      if (existing) return existing

      const pivot = new AccessPointEmployee()
      pivot.accessPointId = input.accessPointId
      pivot.businessUnitId = input.businessUnitId
      pivot.employeeId = input.employeeId
      pivot.accessPointEmployeePin = proposedPin ?? ''
      pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN
      pivot.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.ASSIGNED
      await this.repository.save(pivot)

      return this.applyProposedPin(pivot, proposedPin, input)
    })
  }

  /** Fija o cambia el PIN. Un cambio borra el registro anterior del equipo. */
  async setPin(input: SetPinInput): Promise<AccessPointEmployee> {
    if (!ACCESS_POINT_PIN_PATTERN.test(input.pin)) {
      throw new AdmsError(
        'El PIN debe ser de uno a nueve digitos',
        ADMS_ERROR_CODES.PIN_INVALID,
        422,
        'pin-invalido'
      )
    }

    return this.repository.withDeviceLock(input.accessPointId, async () => {
      const pivot = await this.requirePivot(input.accessPointId, input.employeeId)
      await this.assertPinFree(input.accessPointId, input.pin, pivot.accessPointEmployeeId)

      const previousPin = pivot.accessPointEmployeePin
      const isChange = previousPin.length > 0 && previousPin !== input.pin

      /**
       * Un cambio de PIN borra primero el registro anterior del equipo. Si no,
       * el aparato se queda con dos registros del mismo colaborador y el PIN
       * viejo sigue generando checadas a su nombre.
       */
      if (isChange) {
        await this.commands.enqueue({
          accessPointId: input.accessPointId,
          businessUnitId: input.businessUnitId,
          kind: DEVICE_COMMAND_KIND.USER_DELETE,
          fields: { pin: previousPin },
          correlationKey: `user_delete:${previousPin}`,
          employeeId: input.employeeId,
          accessPointEmployeeId: pivot.accessPointEmployeeId,
          requestedByUserId: input.actor.userId,
        })
      }

      pivot.accessPointEmployeePin = input.pin
      pivot.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.ASSIGNED
      if (pivot.accessPointEmployeeSyncStatus === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN) {
        pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
      } else if (isChange) {
        assertTransition(
          pivot.accessPointEmployeeSyncStatus,
          ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
        )
        pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
      }
      await this.repository.save(pivot)

      await this.repository.recordEvent({
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: isChange
          ? ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_CHANGE
          : ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_ASSIGNED,
        fromPin: previousPin.length > 0 ? previousPin : null,
        toPin: input.pin,
        toStatus: pivot.accessPointEmployeeSyncStatus,
        actorUserId: input.actor.userId,
      })

      return pivot
    })
  }

  /** Encola el alta del colaborador en el equipo. */
  async send(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    employeeName: string
    actor: SyncActor
  }): Promise<AccessPointEmployee> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId)
    const pin = pivot.accessPointEmployeePin
    if (!pin || pin.length === 0) {
      throw new AdmsError(
        'El colaborador no tiene PIN en este equipo',
        ADMS_ERROR_CODES.PIN_MISSING,
        422,
        'pin-faltante',
        'Asigna un PIN antes de enviarlo al checador.'
      )
    }

    if (pivot.accessPointEmployeeSyncStatus !== ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING) {
      assertTransition(
        pivot.accessPointEmployeeSyncStatus,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
      )
      pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
    }
    pivot.accessPointEmployeeSyncRequestedAt = DateTime.utc()
    await this.repository.save(pivot)

    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.USER_UPSERT,
      fields: { pin, name: input.employeeName },
      correlationKey: `user_upsert:${pin}`,
      employeeId: input.employeeId,
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      requestedByUserId: input.actor.userId,
    })

    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.SEND_REQUESTED,
      toStatus: pivot.accessPointEmployeeSyncStatus,
      toPin: pin,
      actorUserId: input.actor.userId,
      deviceCommandId: result.command.deviceCommandId,
    })

    return pivot
  }

  /** Pide el borrado del colaborador en el equipo. El PIN entra en cuarentena. */
  async revoke(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    actor: SyncActor
  }): Promise<AccessPointEmployee> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId)
    const pin = pivot.accessPointEmployeePin
    if (!pin || pin.length === 0) {
      throw new AdmsError(
        'El colaborador no tiene PIN en este equipo',
        ADMS_ERROR_CODES.PIN_MISSING,
        422,
        'pin-faltante'
      )
    }

    assertTransition(
      pivot.accessPointEmployeeSyncStatus,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING
    )
    const from = pivot.accessPointEmployeeSyncStatus
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING
    await this.repository.save(pivot)

    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.USER_DELETE,
      fields: { pin },
      correlationKey: `user_delete:${pin}`,
      employeeId: input.employeeId,
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      requestedByUserId: input.actor.userId,
    })

    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.REVOKE_REQUESTED,
      fromStatus: from,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
      fromPin: pin,
      actorUserId: input.actor.userId,
      deviceCommandId: result.command.deviceCommandId,
    })

    return pivot
  }

  /**
   * Da la baja por cerrada sin que el equipo la haya confirmado.
   *
   * El camino normal espera al aparato: pedir la baja encola un borrado y la
   * asignacion no se suelta hasta que el equipo dice que lo aplico. Eso protege
   * de soltar a alguien que sigue dentro del checador pudiendo marcar.
   *
   * Pero un equipo que no vuelve --se reemplazo, se reseteo, se murio-- deja
   * esa espera abierta para siempre, y hoy no habia forma de cerrarla: el
   * borrado se queda `pending` sin salir, que es un estado que ni el barrido
   * toca. Esto es la salida, y es deliberadamente manual: quien la usa esta
   * afirmando que ese aparato ya no va a contestar.
   *
   * Lo que NO hace: prometer que el colaborador salio del equipo. Si el
   * aparato reaparece con el usuario dentro, la conciliacion del padron lo
   * volvera a levantar. Por eso queda escrito quien lo forzo y con que motivo.
   */
  async forceRevoke(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    reason: string
    actor: SyncActor
  }): Promise<AccessPointEmployee> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId)
    const from = pivot.accessPointEmployeeSyncStatus

    if (!REVOKING_STATUSES.includes(from)) {
      throw new AdmsError(
        'Solo se puede cerrar a mano una baja que ya se pidio',
        ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        409,
        'baja-no-pedida',
        'Pide primero la baja en el equipo; cerrarla a mano es para cuando el aparato no contesta.'
      )
    }

    /**
     * El borrado que nadie va a recoger se cancela: dejarlo vivo taponaria la
     * cola de ese equipo si algun dia vuelve, por una orden que ya no aplica.
     */
    await this.commands.cancelLiveForPivot(pivot.accessPointEmployeeId, input.actor.userId)

    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
    await this.repository.save(pivot)

    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
      fromStatus: from,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      fromPin: pivot.accessPointEmployeePin,
      actorUserId: input.actor.userId,
      detail: `Baja cerrada a mano sin confirmacion del equipo: ${input.reason}`,
    })

    return pivot
  }

  /**
   * Saca al colaborador de todos los equipos donde este dado de alta.
   *
   * Devuelve el desglose en vez de lanzar: la llama la baja del colaborador,
   * que no se puede detener porque un checador este apagado.
   */
  async revokeAll(
    employeeId: number,
    actorUserId: number | null
  ): Promise<Array<{ accessPointId: number; ok: boolean; error?: string }>> {
    const pivots = await this.repository.listLiveByEmployee(employeeId)
    const results: Array<{ accessPointId: number; ok: boolean; error?: string }> = []

    for (const pivot of pivots) {
      try {
        await this.revoke({
          accessPointId: pivot.accessPointId,
          businessUnitId: pivot.businessUnitId,
          employeeId,
          actor: { userId: actorUserId },
        })
        results.push({ accessPointId: pivot.accessPointId, ok: true })
      } catch (error) {
        results.push({
          accessPointId: pivot.accessPointId,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 200) : String(error),
        })
      }
    }

    return results
  }

  /**
   * PIN propuesto: el declarado, o el primer numero libre de ese equipo.
   *
   * Correlativo por aparato y no el codigo del colaborador: el codigo puede
   * tener ocho digitos y hay firmwares que no los aceptan, ademas de que nadie
   * quiere teclear eso frente a la puerta. El numero se busca dentro del
   * bloqueo del equipo, asi que dos altas simultaneas no pueden llevarse el
   * mismo.
   *
   * "Libre" es estricto: un numero no vuelve al monton aunque su baja este
   * confirmada. Las checadas que el equipo guardo sin red llegan dias despues,
   * y si para entonces el numero cambio de dueno se acreditan a quien no las
   * hizo. El unico vinculo que no cuenta es el del propio colaborador, para
   * que recupere su numero al volver.
   */
  private async proposePin(
    accessPointId: number,
    pin: string | null | undefined,
    currentPin: string | null,
    exceptPivotId?: number
  ): Promise<string | null> {
    if (pin && ACCESS_POINT_PIN_PATTERN.test(pin)) return pin
    if (pin) {
      throw new AdmsError(
        'El PIN debe ser de uno a nueve digitos',
        ADMS_ERROR_CODES.PIN_INVALID,
        422,
        'pin-invalido'
      )
    }

    const taken = new Set(await this.repository.listTakenPins(accessPointId, exceptPivotId))

    /**
     * Quien vuelve al mismo equipo recupera su numero si sigue libre: las
     * checadas viejas de ese PIN son suyas y cambiarselo sin necesidad rompe
     * la continuidad del historial.
     */
    if (currentPin && currentPin.length > 0 && !taken.has(currentPin)) return currentPin

    for (let candidate = 1; candidate <= MAX_CORRELATIVE_PIN; candidate += 1) {
      const value = String(candidate)
      if (!taken.has(value)) return value
    }
    return null
  }

  private async applyProposedPin(
    pivot: AccessPointEmployee,
    proposedPin: string | null,
    input: AssignInput
  ): Promise<AccessPointEmployee> {
    if (proposedPin === null) return pivot

    pivot.accessPointEmployeePin = proposedPin
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
    await this.repository.save(pivot)
    await this.repository.recordEvent({
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      businessUnitId: input.businessUnitId,
      kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_ASSIGNED,
      toPin: proposedPin,
      toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
      actorUserId: input.actor.userId,
      detail: input.pin ? null : 'PIN correlativo del equipo',
    })
    return pivot
  }

  /**
   * El PIN debe estar libre en el equipo, contando las filas en cuarentena: si
   * el borrado del anterior no esta confirmado, ese numero sigue siendo suyo.
   */
  private async assertPinFree(
    accessPointId: number,
    pin: string,
    exceptPivotId?: number
  ): Promise<void> {
    const holders = await this.repository.findByPin(accessPointId, pin)
    const taken = holders.filter((row) => row.accessPointEmployeeId !== exceptPivotId)
    if (taken.length === 0) return
    throw new AdmsError(
      'Ese PIN ya esta ocupado en este equipo',
      ADMS_ERROR_CODES.PIN_TAKEN,
      409,
      'pin-ocupado',
      'El PIN pertenece a otro colaborador o esta en espera de que el equipo confirme su borrado.'
    )
  }

  private async requirePivot(
    accessPointId: number,
    employeeId: number
  ): Promise<AccessPointEmployee> {
    const pivot = await this.repository.findPivot(accessPointId, employeeId)
    if (!pivot) {
      throw new AdmsError(
        'El colaborador no esta asignado a este equipo',
        ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'asignacion-no-encontrada'
      )
    }
    return pivot
  }
}

import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
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
import logger from '@adonisjs/core/services/logger'
import PhotoPublicationService from '#modules/biometric-vault/photo/photo_publication.service'
import EmployeeSyncRepositoryMysql from './employee_sync.repository.mysql.js'
import {
  assertTransition,
  canDetachAssignment,
  REVOKING_STATUSES,
} from './employee_sync_state.js'
import type { EmployeeSyncRepository } from './employee_sync.repository.js'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import type { AccessPointScopePort } from '#modules/access-point/sharing/access_point_scope.port'
import { AccessPointOutOfScopeError } from '#modules/access-point/access_point_out_of_scope_error'

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
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly publications: PhotoPublicationService = new PhotoPublicationService(),
    private readonly scope: Pick<AccessPointScopePort, 'isParticipant'> =
      new AccessPointScopeRepositoryMysql()
  ) {}

  /**
   * Asigna al colaborador en el equipo.
   *
   * Si ya estuvo y salio, la fila revive en vez de crear otra: el historial de
   * ese par no se parte en dos. Sale por dos caminos distintos -- el borrado
   * logico de la asignacion vieja y el `revoked` que deja una baja confirmada
   * por el aparato -- y los dos vuelven aqui.
   *
   * Corre entera en la transaccion que bloquea la fila del aparato
   * (`FOR UPDATE`), el mismo candado que toman `setPin`, el reclamo de un PIN
   * no mapeado, el envio y la revocacion: con el se serializan todos los que
   * escriben PIN, y la unicidad del numero se comprueba dentro. Con el
   * aparato bloqueado se vuelve a preguntar si la empresa participa: la
   * autorizacion lo valido antes, sin candado, y una revocacion en curso
   * dejaria un vinculo de una ex-invitada que nadie puede cerrar (A2-14).
   * Todo lo que lee y escribe va por esa `trx`: una sola conexion por
   * operacion. Pedir otra mientras se retiene esta agota el pool con unas
   * cuantas altas concurrentes.
   *
   * @throws AdmsError 404 `punto-acceso-no-encontrado` si la empresa ya no participa.
   */
  async assign(input: AssignInput): Promise<AccessPointEmployee> {
    return this.repository.inDeviceTransaction(input.accessPointId, (trx) =>
      this.assignIn(input, trx)
    )
  }

  /** `assign` con el aparato bloqueado en `trx`. */
  private async assignIn(
    input: AssignInput,
    trx: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    await this.assertStillParticipates(input.accessPointId, input.businessUnitId, trx)

    const existing = await this.repository.findPivotWithTrashed(
      input.accessPointId,
      input.employeeId,
      trx
    )

    const proposedPin = await this.proposePin(
      input.accessPointId,
      input.pin,
      existing?.accessPointEmployeePin ?? null,
      existing?.accessPointEmployeeId,
      trx
    )
    if (proposedPin !== null) {
      await this.assertPinFree(
        input.accessPointId,
        proposedPin,
        existing?.accessPointEmployeeId,
        trx
      )
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
      await this.repository.save(existing, trx)
      await this.repository.recordEvent(
        {
          accessPointEmployeeId: existing.accessPointEmployeeId,
          businessUnitId: input.businessUnitId,
          kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.REASSIGNED,
          toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN,
          toPin: proposedPin,
          actorUserId: input.actor.userId,
          detail: 'El colaborador vuelve a este equipo tras una revocacion',
        },
        trx
      )
      return this.applyProposedPin(existing, proposedPin, input, trx)
    }

    if (existing) return existing

    const pivot = new AccessPointEmployee()
    pivot.accessPointId = input.accessPointId
    pivot.businessUnitId = input.businessUnitId
    pivot.employeeId = input.employeeId
    pivot.accessPointEmployeePin = proposedPin ?? ''
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN
    pivot.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.ASSIGNED
    await this.repository.save(pivot, trx)

    return this.applyProposedPin(pivot, proposedPin, input, trx)
  }

  /**
   * Con el aparato ya bloqueado, la empresa sigue participando de el. La
   * autorizacion lo valido antes y sin candado; una revocacion que confirmo
   * mientras tanto la saco, y para ella el checador ya no existe (A2-14).
   *
   * @throws AccessPointOutOfScopeError 404 `punto-acceso-no-encontrado`.
   */
  private async assertStillParticipates(
    accessPointId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ) {
    if (!(await this.scope.isParticipant(accessPointId, businessUnitId, trx))) {
      throw new AccessPointOutOfScopeError()
    }
  }

  /**
   * Fija o cambia el PIN. Un cambio borra el registro anterior del equipo.
   *
   * Mismo candado que `assign`: la fila del aparato, con la revalidacion de la
   * participacion y todas las lecturas y escrituras (pivote, baja, evento) en
   * la transaccion del aparato. Sin el candado, fijar el
   * numero de un vinculo `pending_pin` (que no encola nada) dejaba en
   * `pending` a una empresa que una revocacion acababa de sacar.
   *
   * @throws AccessPointOutOfScopeError 404 si la empresa ya no participa.
   */
  async setPin(input: SetPinInput): Promise<AccessPointEmployee> {
    if (!ACCESS_POINT_PIN_PATTERN.test(input.pin)) {
      throw new AdmsError(
        'El PIN debe ser de uno a nueve digitos',
        ADMS_ERROR_CODES.PIN_INVALID,
        422,
        'pin-invalido'
      )
    }

    return this.repository.inDeviceTransaction(input.accessPointId, (trx) =>
      this.setPinIn(input, trx)
    )
  }

  /** `setPin` con el aparato bloqueado en `trx`. */
  private async setPinIn(
    input: SetPinInput,
    trx: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    await this.assertStillParticipates(input.accessPointId, input.businessUnitId, trx)
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId, trx)
    await this.assertPinFree(input.accessPointId, input.pin, pivot.accessPointEmployeeId, trx)

    const previousPin = pivot.accessPointEmployeePin
    const isChange = previousPin.length > 0 && previousPin !== input.pin

    /**
     * Un cambio de PIN borra primero el registro anterior del equipo. Si no,
     * el aparato se queda con dos registros del mismo colaborador y el PIN
     * viejo sigue generando checadas a su nombre.
     */
    if (isChange) {
      await this.commands.enqueue(
        {
          accessPointId: input.accessPointId,
          businessUnitId: input.businessUnitId,
          kind: DEVICE_COMMAND_KIND.USER_DELETE,
          fields: { pin: previousPin },
          correlationKey: `user_delete:${previousPin}`,
          employeeId: input.employeeId,
          accessPointEmployeeId: pivot.accessPointEmployeeId,
          requestedByUserId: input.actor.userId,
        },
        trx
      )
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
    await this.repository.save(pivot, trx)

    await this.repository.recordEvent(
      {
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: isChange
          ? ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_CHANGE
          : ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_ASSIGNED,
        fromPin: previousPin.length > 0 ? previousPin : null,
        toPin: input.pin,
        toStatus: pivot.accessPointEmployeeSyncStatus,
        actorUserId: input.actor.userId,
      },
      trx
    )

    return pivot
  }

  /**
   * Encola el alta del colaborador en el equipo.
   *
   * Pivote, comando y evento van en una sola transaccion que bloquea primero
   * el aparato: si la cola rechaza el alta (p. ej. la invitacion se acaba de
   * revocar), el vinculo no queda en `pending` sin comando. Y una revocacion
   * concurrente, que toma el mismo candado antes de listar vinculos, o ve el
   * alta ya encolada y la cancela, o la ve rechazada por el guard.
   */
  async send(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    employeeName: string
    actor: SyncActor
  }): Promise<AccessPointEmployee> {
    return this.repository.inDeviceTransaction(input.accessPointId, (trx) =>
      this.sendIn(input, trx)
    )
  }

  private async sendIn(
    input: {
      accessPointId: number
      businessUnitId: number
      employeeId: number
      employeeName: string
      actor: SyncActor
    },
    trx: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId, trx)
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
    // Leido con `trx`: el modelo guarda dentro de la misma transaccion.
    await this.repository.save(pivot)

    const result = await this.commands.enqueue(
      {
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        kind: DEVICE_COMMAND_KIND.USER_UPSERT,
        fields: { pin, name: input.employeeName },
        correlationKey: `user_upsert:${pin}`,
        employeeId: input.employeeId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        requestedByUserId: input.actor.userId,
      },
      trx
    )

    await this.repository.recordEvent(
      {
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.SEND_REQUESTED,
        toStatus: pivot.accessPointEmployeeSyncStatus,
        toPin: pin,
        actorUserId: input.actor.userId,
        deviceCommandId: result.command.deviceCommandId,
      },
      trx
    )

    return pivot
  }

  /**
   * Pide el borrado del colaborador en el equipo. El PIN entra en cuarentena.
   *
   * Con `trx`, el pivote, la cancelacion, la baja y el evento se escriben en
   * la transaccion del llamador: si esta se revierte no queda nada en cola ni
   * el pivote en `revoking` (desasignar la unidad, VLRH-P0065 3.2.3).
   */
  async revoke(
    input: {
      accessPointId: number
      businessUnitId: number
      employeeId: number
      actor: SyncActor
    },
    trx?: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId, trx)
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

    /**
     * Primero se cierra lo que este vivo para este vinculo, y despues se pide
     * la baja.
     *
     * El borrado sale con prioridad 1 y el alta con 3: si el alta sigue en la
     * cola cuando se pide la baja, el equipo aplica primero el borrado y en el
     * siguiente sondeo recoge el alta rezagada, que vuelve a dar de alta a la
     * persona con su mismo PIN. Queda dentro del aparato, marcando, y el
     * pivote acaba en `confirmed` como si nada. Lo mismo vale para una copia de
     * biometrico en cola: a quien se va no se le copia nada.
     */
    await this.commands.cancelLiveForPivot(pivot.accessPointEmployeeId, input.actor.userId, trx)

    const result = await this.commands.enqueue(
      {
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        kind: DEVICE_COMMAND_KIND.USER_DELETE,
        fields: { pin },
        correlationKey: `user_delete:${pin}`,
        employeeId: input.employeeId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        requestedByUserId: input.actor.userId,
      },
      trx
    )

    await this.repository.recordEvent(
      {
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.REVOKE_REQUESTED,
        fromStatus: from,
        toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
        fromPin: pin,
        actorUserId: input.actor.userId,
        deviceCommandId: result.command.deviceCommandId,
      },
      trx
    )

    return pivot
  }

  /**
   * Retira un vinculo que nunca llego al aparato, sin encolar nada.
   *
   * Solo para estados desprendibles (`canDetachAssignment`): un `pending_pin`
   * no tiene numero y el equipo nunca supo de esa persona. Se usa al revocar
   * la invitacion de su empresa a un checador compartido (VLRH-P0065, 3.2.4):
   * sin esto el vinculo queda vivo en un aparato que ya no es de su empresa.
   * Deja evento con el motivo; el pivote se borra logicamente.
   */
  async detachUnsent(
    input: {
      accessPointId: number
      businessUnitId: number
      employeeId: number
      actor: SyncActor
      detail: string
    },
    trx?: TransactionClientContract
  ): Promise<void> {
    const pivot = await this.requirePivot(input.accessPointId, input.employeeId, trx)
    if (!canDetachAssignment(pivot.accessPointEmployeeSyncStatus)) {
      // Mismo codigo que `assertTransition` para un cambio de estado no admitido.
      throw new AdmsError(
        'El vinculo ya llego al equipo: requiere baja',
        ADMS_ERROR_CODES.PIN_INVALID,
        409,
        'transicion-invalida',
        'El estado del colaborador en el equipo no admite ese cambio.'
      )
    }
    await this.repository.recordEvent(
      {
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.STATUS_CHANGED,
        fromStatus: pivot.accessPointEmployeeSyncStatus,
        toStatus: null,
        actorUserId: input.actor.userId,
        detail: input.detail,
      },
      trx
    )
    await this.repository.detach(pivot)
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

    /**
     * Un vinculo sin PIN nunca llego al aparato: no hay baja que pedir ni que
     * esperar. Se desprende con su evento y sin encolar nada, por el mismo
     * camino que la revocacion de una invitacion. Sin esto, el `pending_pin`
     * de una ex-invitada quedaba huerfano y bloqueaba el borrado del checador.
     */
    if (from === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN) {
      await this.detachUnsent({
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        employeeId: input.employeeId,
        actor: input.actor,
        detail: `Vinculo sin PIN retirado a mano: ${input.reason}`,
      })
      return pivot
    }

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

    /**
     * Los permisos de descarga de su foto se retiran con la baja: cada uno es
     * un enlace vivo a la cara de alguien que ya no esta. Las ordenes de foto
     * las cancela cada `revoke`; los permisos ya publicados no los tocaba
     * nadie y seguian validos hasta vencer. En su propio try/catch: una
     * publicacion que no se pudo retirar no detiene una baja.
     */
    try {
      await this.publications.withdrawForEmployee(employeeId, DateTime.utc())
    } catch (error) {
      logger.warn(
        { employeeId, error: error instanceof Error ? error.message.slice(0, 200) : String(error) },
        'EmployeeSyncService.revokeAll: no se pudieron retirar las publicaciones de foto'
      )
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
    exceptPivotId: number | undefined,
    trx: TransactionClientContract
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

    const taken = new Set(await this.repository.listTakenPins(accessPointId, exceptPivotId, trx))

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
    input: AssignInput,
    trx: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    if (proposedPin === null) return pivot

    pivot.accessPointEmployeePin = proposedPin
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
    await this.repository.save(pivot, trx)
    await this.repository.recordEvent(
      {
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        businessUnitId: input.businessUnitId,
        kind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.PIN_ASSIGNED,
        toPin: proposedPin,
        toStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
        actorUserId: input.actor.userId,
        detail: input.pin ? null : 'PIN correlativo del equipo',
      },
      trx
    )
    return pivot
  }

  /**
   * El PIN debe estar libre en el equipo, contando las filas en cuarentena: si
   * el borrado del anterior no esta confirmado, ese numero sigue siendo suyo.
   */
  private async assertPinFree(
    accessPointId: number,
    pin: string,
    exceptPivotId: number | undefined,
    trx: TransactionClientContract
  ): Promise<void> {
    const holders = await this.repository.findByPin(accessPointId, pin, trx)
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
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<AccessPointEmployee> {
    const pivot = await this.repository.findPivot(accessPointId, employeeId, trx)
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

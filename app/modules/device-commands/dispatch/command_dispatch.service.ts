import type { DateTime } from 'luxon'
import { ADMS_OK } from '#modules/adms/adms.constants'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandKind,
} from '../device_command.constants.js'
import { getBusinessTimeZone } from '#utils/business_date'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type DeviceCommand from '#models/device_command'
import { formatDeviceCommand, formatWireLine } from '../wire/adms_command_formatter.js'
import { toZkDateTime } from '../wire/zk_datetime.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'
import PhotoDispatchService from '#modules/biometric-vault/photo/photo_dispatch.service'
import type { PhotoDispatchPort } from '#modules/biometric-vault/photo/photo_dispatch.port'

export interface DispatchInput {
  accessPointId: number
  now: DateTime
  /**
   * Con una anomalia de IP abierta no salen los comandos que llevan template o
   * token de foto (spec 13, regla 10): si dos equipos presentan la misma serie,
   * el biometrico podria acabar en el aparato equivocado.
   */
  ipAnomalyOpen: boolean
  /**
   * El equipo saludo hace poco desde ESTA misma direccion.
   *
   * Los comandos que llevan biometrico solo salen con la sesion caliente. Es lo
   * unico que se puede hacer contra quien conoce la serie: si no ha saludado,
   * no recibe nada que valga la pena robar.
   */
  hotSession: boolean
  /**
   * Zona del dispositivo. La necesita el ajuste de reloj, que se recalcula en
   * el momento del despacho; sin ella se usa la del servidor.
   */
  deviceZone?: string | null
}

/** Tipos que se retienen ante una anomalia de IP o una sesion fria. */
const SENSITIVE_KINDS: readonly DeviceCommandKind[] = [
  DEVICE_COMMAND_KIND.BIODATA_WRITE,
  DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
]

/**
 * Entrega un comando por sondeo (spec ADMS 6.3).
 *
 * Uno a la vez y solo si no hay otro en vuelo: el equipo no encola del lado de
 * alla, y mandarle dos ordenes seguidas sin esperar su acuse pierde la primera.
 */
export default class CommandDispatchService {
  constructor(
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly photos: PhotoDispatchPort = new PhotoDispatchService()
  ) {}

  async next(input: DispatchInput): Promise<string> {
    if (await this.repository.hasInFlight(input.accessPointId)) return ADMS_OK

    const excluded = input.ipAnomalyOpen || !input.hotSession ? [...SENSITIVE_KINDS] : []
    const command = await this.repository.findNextPending(input.accessPointId, excluded)
    if (!command) return ADMS_OK

    /**
     * Un comando sin payload no se puede entregar, y dejarlo `pending` es peor
     * que perderlo: `findNextPending` ordena por prioridad e id, asi que
     * devolveria ESA MISMA fila en cada sondeo y ninguna otra orden de ese
     * equipo saldria jamas. El checador se queda mudo --sin altas, sin bajas,
     * sin copias-- y desde el servidor todo se ve normal.
     */
    if (command.deviceCommandPayload === null) {
      await this.discard(command, input.now, 'payload_unreadable')
      return ADMS_OK
    }

    /**
     * El ajuste de reloj se recalcula AQUI y no al encolar (spec 6.3): un
     * comando que estuvo diez minutos en la cola llevaria una hora diez
     * minutos vieja y dejaria al equipo atrasado justo por corregirlo. Se
     * guarda el payload regenerado para que quede registro de lo que salio de
     * verdad, que es el unico rastro fiable: el acuse del equipo es identico
     * con la hora buena y con la mala.
     */
    let payload = command.deviceCommandPayload
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.CLOCK_SYNC) {
      const zone = input.deviceZone ?? getBusinessTimeZone()
      const local = input.now.setZone(zone)
      payload = formatDeviceCommand(DEVICE_COMMAND_KIND.CLOCK_SYNC, {
        dateTime: String(toZkDateTime(local.isValid ? local : input.now)),
      })
    }

    /**
     * La foto se re-publica en el momento de salir si su plazo ya vencio, y en
     * todo caso la ventana se recorta a la del despacho (spec 7.3): un enlace
     * que estuvo horas en la cola no puede seguir sirviendo horas mas una vez
     * que viaja por la red del cliente.
     */
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.BIOPHOTO_WRITE) {
      const refreshed = await this.photos.refreshForDispatch(command, input.now)
      /**
       * La publicacion se retiro: alguien apago la foto o la cambio. El comando
       * no debe salir, pero tampoco puede quedarse pendiente -- taponaria la
       * cola igual que un payload ilegible, y este caso no es un accidente
       * raro sino operacion normal.
       */
      if (refreshed === null) {
        await this.discard(command, input.now, 'photo_publication_withdrawn')
        return ADMS_OK
      }
      payload = refreshed
    }

    /**
     * `hasInFlight` y `findNextPending` son dos lecturas sueltas: el equipo
     * reintenta el sondeo cuando la respuesta tarda, asi que dos peticiones
     * pueden llegar hasta aqui con el MISMO comando. La condicion de estado en
     * la escritura decide quien lo entrega; el que pierde se va con OK y el
     * equipo lo recoge en el siguiente sondeo.
     */
    const taken = await this.repository.markSent({
      commandId: command.deviceCommandId,
      payload,
      sentAt: input.now,
    })
    if (!taken) return ADMS_OK

    await this.syncPivot(command, 'dispatched')

    return formatWireLine(command.deviceCommandWireId, payload)
  }

  /**
   * Saca de la cola un comando que no se puede entregar.
   *
   * Se falla en vez de cancelarlo: `failed` es el unico estado desde el que un
   * operador puede reintentar, y ademas deja el motivo escrito. La escritura es
   * condicional --solo si sigue `pending`-- porque el equipo reintenta el
   * sondeo y dos peticiones pueden llegar aqui con el mismo comando.
   */
  private async discard(command: DeviceCommand, now: DateTime, reason: string): Promise<void> {
    await this.repository.markFailedIfStill({
      commandId: command.deviceCommandId,
      expectedStatus: DEVICE_COMMAND_STATUS.PENDING,
      failedAt: now,
      error: reason,
    })
  }

  /**
   * Mueve el estado del colaborador en el equipo junto con el del comando
   * (spec 8.1).
   *
   * Solo lo hace si el comando declara a que fila del pivote pertenece: un
   * comando suelto no puede cambiarle el estado a nadie.
   */
  private async syncPivot(
    command: DeviceCommand,
    moment: 'dispatched'
  ): Promise<void> {
    if (!command.accessPointEmployeeId || moment !== 'dispatched') return

    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_UPSERT) {
      await this.pivots.updateStatus(command.accessPointEmployeeId, 'sent')
      return
    }
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE) {
      await this.pivots.updateStatus(command.accessPointEmployeeId, 'revoke_sent')
    }
  }
}

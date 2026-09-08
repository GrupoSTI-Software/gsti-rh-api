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
   * Zona del dispositivo. La necesita el ajuste de reloj, que se recalcula en
   * el momento del despacho; sin ella se usa la del servidor.
   */
  deviceZone?: string | null
}

/** Tipos que se retienen mientras hay una anomalia de IP abierta. */
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
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql()
  ) {}

  async next(input: DispatchInput): Promise<string> {
    if (await this.repository.hasInFlight(input.accessPointId)) return ADMS_OK

    const excluded = input.ipAnomalyOpen ? [...SENSITIVE_KINDS] : []
    const command = await this.repository.findNextPending(input.accessPointId, excluded)
    if (!command || command.deviceCommandPayload === null) return ADMS_OK

    /**
     * El ajuste de reloj se recalcula AQUI y no al encolar (spec 6.3): un
     * comando que estuvo diez minutos en la cola llevaria una hora diez
     * minutos vieja y dejaria al equipo atrasado justo por corregirlo. Se
     * guarda el payload regenerado para que quede registro de lo que salio de
     * verdad, que es el unico rastro fiable: el acuse del equipo es identico
     * con la hora buena y con la mala.
     */
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.CLOCK_SYNC) {
      const zone = input.deviceZone ?? getBusinessTimeZone()
      const local = input.now.setZone(zone)
      command.deviceCommandPayload = formatDeviceCommand(DEVICE_COMMAND_KIND.CLOCK_SYNC, {
        dateTime: String(toZkDateTime(local.isValid ? local : input.now)),
      })
    }

    command.deviceCommandStatus = DEVICE_COMMAND_STATUS.SENT
    command.deviceCommandSentAt = input.now
    await this.repository.save(command)

    await this.syncPivot(command, 'dispatched')

    return formatWireLine(command.deviceCommandWireId, command.deviceCommandPayload)
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
    if (command.accessPointEmployeeId === null || moment !== 'dispatched') return

    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_UPSERT) {
      await this.pivots.updateStatus(command.accessPointEmployeeId, 'sent')
      return
    }
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE) {
      await this.pivots.updateStatus(command.accessPointEmployeeId, 'revoke_sent')
    }
  }
}

import type { DateTime } from 'luxon'
import { ADMS_OK } from '#modules/adms/adms.constants'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandKind,
} from '../device_command.constants.js'
import { formatWireLine } from '../wire/adms_command_formatter.js'
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
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql()
  ) {}

  async next(input: DispatchInput): Promise<string> {
    if (await this.repository.hasInFlight(input.accessPointId)) return ADMS_OK

    const excluded = input.ipAnomalyOpen ? [...SENSITIVE_KINDS] : []
    const command = await this.repository.findNextPending(input.accessPointId, excluded)
    if (!command || command.deviceCommandPayload === null) return ADMS_OK

    command.deviceCommandStatus = DEVICE_COMMAND_STATUS.SENT
    command.deviceCommandSentAt = input.now
    await this.repository.save(command)

    return formatWireLine(command.deviceCommandWireId, command.deviceCommandPayload)
  }
}

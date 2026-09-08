import type { DateTime } from 'luxon'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_RETURN_CODES,
  DEVICE_COMMAND_STATUS,
  DEVICE_COMMAND_UNKNOWN_RETURN,
} from '../device_command.constants.js'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type DeviceCommand from '#models/device_command'
import { parseDeviceCmdBody } from '../wire/adms_ack.parser.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'

export type AckOutcome =
  | { kind: 'applied'; commandId: number; status: string; returnCode: number | null }
  | { kind: 'orphan'; wireId: number | null }
  | { kind: 'unreadable' }

export interface AckInput {
  accessPointId: number
  body: string
  now: DateTime
}

/**
 * Interpreta el acuse del equipo (spec ADMS 6.5).
 *
 * `Return=0` solo significa RECIBIDO. La bateria documenta un `Return=0` con la
 * foto descartada y otro con el reloj movido 180 dias: por eso el acuse deja el
 * comando en `acked` y la evidencia real llega despues. La unica excepcion es
 * el alta de usuario, cuyo efecto se verifico en pantalla al acusar.
 */
export default class CommandAckService {
  constructor(
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql()
  ) {}

  async apply(input: AckInput): Promise<AckOutcome> {
    const parsed = parseDeviceCmdBody(input.body)
    if (!parsed) return { kind: 'unreadable' }

    const command = await this.repository.findByWireId(parsed.id)
    /**
     * Un acuse de otro dispositivo no se aplica: dos equipos pueden estar
     * sondeando y acreditarlo al ajeno marcaria como hecho algo que no paso.
     */
    if (!command || command.accessPointId !== input.accessPointId) {
      return { kind: 'orphan', wireId: parsed.id }
    }

    command.deviceCommandReturnCode = parsed.returnCode
    command.deviceCommandReturnRaw = parsed.dump ? parsed.dump.slice(0, 2000) : null

    if (parsed.returnCode === 0) {
      const executed = command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_UPSERT
      command.deviceCommandStatus = executed
        ? DEVICE_COMMAND_STATUS.EXECUTED
        : DEVICE_COMMAND_STATUS.ACKED
      command.deviceCommandAckedAt = input.now
      if (executed) {
        command.deviceCommandExecutedAt = input.now
        command.deviceCommandExecutionEvidence = 'ack'
      }
    } else {
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = input.now
      command.deviceCommandLastError =
        parsed.returnCode !== null && DEVICE_COMMAND_RETURN_CODES[parsed.returnCode] !== undefined
          ? DEVICE_COMMAND_RETURN_CODES[parsed.returnCode]
          : DEVICE_COMMAND_UNKNOWN_RETURN
    }

    await this.repository.save(command)
    await this.syncPivot(command, parsed.returnCode)

    return {
      kind: 'applied',
      commandId: command.deviceCommandId,
      status: command.deviceCommandStatus,
      returnCode: parsed.returnCode,
    }
  }

  /**
   * Mueve el estado del colaborador en el equipo segun lo que acuso el aparato
   * (spec 8.1).
   *
   * Un `Return=0` de un borrado deja `revoke_acked`, NUNCA `revoked`: el equipo
   * dijo que recibio la orden, no que la aplico. Hasta que haya evidencia, el
   * PIN sigue en cuarentena y no se le da a nadie mas.
   */
  private async syncPivot(command: DeviceCommand, returnCode: number | null): Promise<void> {
    if (!command.accessPointEmployeeId) return
    const accepted = returnCode === 0

    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_UPSERT) {
      await this.pivots.updateStatus(
        command.accessPointEmployeeId,
        accepted ? 'confirmed' : 'failed'
      )
      return
    }
    if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE) {
      await this.pivots.updateStatus(
        command.accessPointEmployeeId,
        accepted ? 'revoke_acked' : 'revoke_failed'
      )
    }
  }
}

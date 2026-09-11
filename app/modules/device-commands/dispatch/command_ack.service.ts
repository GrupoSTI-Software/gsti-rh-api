import type { DateTime } from 'luxon'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  DEVICE_COMMAND_EVIDENCE,
  returnCodeLabel,
} from '../device_command.constants.js'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type DeviceCommand from '#models/device_command'
import { parseDeviceCmdBody } from '../wire/adms_ack.parser.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type { DeviceCommandCountersSnapshot } from '#models/device_command'
import DeviceCommandService from '../device_command.service.js'
import { canTransition } from '../device_command.state.js'

export type AckOutcome =
  | {
      kind: 'applied'
      commandId: number
      status: string
      returnCode: number | null
      /**
       * Volcado del acuse de un `INFO`: trae las opciones del equipo. Solo se
       * expone para ese tipo, que es el unico cuyo volcado significa algo.
       */
      infoDump: string | null
    }
  | { kind: 'orphan'; wireId: number | null }
  /**
   * El comando existe pero no estaba esperando acuse.
   *
   * Un `pending` nunca salio, un `cancelled` se retiro y un `failed` ya lo dio
   * por muerto el barrido. Aplicarles el acuse acreditaria como hecho algo que
   * no paso, asi que la fila no se toca y queda el aviso.
   */
  | { kind: 'stale'; commandId: number; status: string; returnCode: number | null }
  /**
   * El mismo acuse otra vez: el equipo repite cuando no recibe respuesta.
   *
   * No es un error ni hay nada que escribir --el resultado ya esta guardado y
   * es identico-- asi que no levanta aviso.
   */
  | { kind: 'duplicate'; commandId: number; status: string; returnCode: number | null }
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
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql(),
    private readonly commands: DeviceCommandService = new DeviceCommandService()
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

    /**
     * A donde llevaria este acuse, ANTES de tocar la fila.
     *
     * El estado lo decide la maquina (spec 6.2) y no el acuse: hasta ahora
     * bastaba con que el identificador de cable existiera para reescribir el
     * estado, asi que un comando `pending` --que nunca salio--, uno cancelado o
     * uno que el barrido dio por fallido pasaban a `acked` o `executed` sin
     * haber viajado nunca.
     */
    const executed =
      parsed.returnCode === 0 && command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_UPSERT
    const target =
      parsed.returnCode !== 0
        ? DEVICE_COMMAND_STATUS.FAILED
        : executed
          ? DEVICE_COMMAND_STATUS.EXECUTED
          : DEVICE_COMMAND_STATUS.ACKED

    /**
     * El equipo reenvia el acuse si no recibe respuesta. Repetir el mismo
     * resultado sobre el mismo comando no es una anomalia: se contesta y ya.
     */
    if (
      command.deviceCommandStatus === target &&
      command.deviceCommandReturnCode === parsed.returnCode
    ) {
      return {
        kind: 'duplicate',
        commandId: command.deviceCommandId,
        status: command.deviceCommandStatus,
        returnCode: parsed.returnCode,
      }
    }

    if (!canTransition(command.deviceCommandStatus, target)) {
      return {
        kind: 'stale',
        commandId: command.deviceCommandId,
        status: command.deviceCommandStatus,
        returnCode: parsed.returnCode,
      }
    }

    command.deviceCommandReturnCode = parsed.returnCode
    command.deviceCommandReturnRaw = parsed.dump ? parsed.dump.slice(0, 2000) : null

    if (parsed.returnCode === 0) {
      command.deviceCommandStatus = target
      command.deviceCommandAckedAt = input.now
      if (executed) {
        command.deviceCommandExecutedAt = input.now
        command.deviceCommandExecutionEvidence = DEVICE_COMMAND_EVIDENCE.ACK
      } else {
        /**
         * Foto de los contadores en el momento del acuse. La prueba de que el
         * equipo hizo el trabajo es que el numero suba DESPUES; sin esta linea
         * base no hay con que comparar y esa via de evidencia nunca se cumple.
         */
        command.deviceCommandCountersSnapshot = await this.readCounters(command.accessPointId)
      }
    } else {
      command.deviceCommandStatus = target
      command.deviceCommandFailedAt = input.now
      command.deviceCommandLastError = returnCodeLabel(parsed.returnCode)
    }

    await this.repository.save(command)
    await this.syncPivot(command, parsed.returnCode)

    return {
      kind: 'applied',
      commandId: command.deviceCommandId,
      status: command.deviceCommandStatus,
      returnCode: parsed.returnCode,
      /**
       * Solo del `INFO`: su volcado son las opciones del equipo y alimentan el
       * perfil. El de otros comandos es texto suelto que no se interpreta.
       */
      infoDump:
        command.deviceCommandKind === DEVICE_COMMAND_KIND.INFO ? (parsed.dump ?? null) : null,
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
  /**
   * Contadores del perfil, que se refresca con cada subida de `options`. Si el
   * equipo aun no ha mandado ninguna, no hay linea base y se guarda `null`: sin
   * numero previo, ningun aumento se puede acreditar.
   */
  private async readCounters(accessPointId: number): Promise<DeviceCommandCountersSnapshot | null> {
    const profile = await this.profiles.findByAccessPoint(accessPointId)
    if (!profile) return null
    return {
      userCount: profile.accessPointProfileUserCount,
      fpCount: profile.accessPointProfileFpCount,
      faceCount: profile.accessPointProfileFaceCount,
    }
  }

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
      if (accepted) await this.askForRoster(command)
    }
  }

  /**
   * Pide el padron para cerrar la baja.
   *
   * El acuse dejo el pivote en `revoke_acked`, que es el unico estado donde la
   * checada de ese PIN se retiene por ambigua. Sin evidencia se quedaria ahi
   * para siempre: el numero reservado sin fin y las checadas sin acreditar. El
   * `CHECK` hace que el equipo suba su padron en `OPERLOG`, y ahi se resuelve
   * en un sentido o en el otro.
   *
   * La clave de correlacion es fija por equipo: diez bajas seguidas dejan un
   * solo `CHECK` en la cola, no diez.
   */
  private async askForRoster(command: DeviceCommand): Promise<void> {
    if (!command.businessUnitId) return
    await this.commands.enqueue({
      accessPointId: command.accessPointId,
      businessUnitId: command.businessUnitId,
      kind: DEVICE_COMMAND_KIND.CHECK,
      fields: {},
      correlationKey: 'check:padron-tras-baja',
      requestedByUserId: null,
    })
  }
}

import type { DateTime } from 'luxon'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import { toZkDateTime } from '#modules/device-commands/wire/zk_datetime'
import type DeviceCommand from '#models/device_command'
import DeviceClockService from './device_clock.service.js'
import {
  ADMS_CLOCK_MAX_AUTOMATIC_SYNCS,
  ADMS_CLOCK_SYNC_COOLDOWN_HOURS,
} from './device_clock.constants.js'

/** Llave de correlacion del ajuste: uno vivo por equipo, sin importar el PIN. */
export const CLOCK_SYNC_CORRELATION_KEY = 'clock'

export interface ClockSyncRequest {
  accessPointId: number
  businessUnitId: number
  deviceZone: string | null
  now: DateTime
  requestedByUserId?: number | null
  /** Un ajuste pedido a mano no respeta la espera ni el tope automatico. */
  manual?: boolean
}

export type ClockSyncOutcome =
  | { kind: 'enqueued'; command: DeviceCommand }
  | { kind: 'already_queued'; command: DeviceCommand }
  | { kind: 'cooldown' }
  | { kind: 'needs_technician' }

/**
 * Encola el ajuste del reloj (spec ADMS 6.7).
 *
 * El payload que se guarda aqui es provisional: el despacho lo recalcula con
 * la hora de ese momento. Se genera igual para que el comando encolado sea una
 * linea valida y no un hueco.
 */
export default class DeviceClockSyncService {
  constructor(
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly clock: DeviceClockService = new DeviceClockService()
  ) {}

  async request(input: ClockSyncRequest): Promise<ClockSyncOutcome> {
    const history = await this.commands.listByDevice(input.accessPointId)
    const clockCommands = history.filter(
      (command) => command.deviceCommandKind === DEVICE_COMMAND_KIND.CLOCK_SYNC
    )

    if (!input.manual) {
      /**
       * Dos ajustes seguidos sin que la deriva baje: el problema no se corrige
       * a distancia. Se marca para que alguien vaya al equipo en vez de
       * mandarle un tercero que tampoco va a servir.
       */
      const unresolved = clockCommands.filter(
        (command) =>
          command.deviceCommandStatus === DEVICE_COMMAND_STATUS.ACKED ||
          command.deviceCommandStatus === DEVICE_COMMAND_STATUS.FAILED
      )
      if (unresolved.length >= ADMS_CLOCK_MAX_AUTOMATIC_SYNCS) {
        await this.clock.markStatus(input.accessPointId, input.businessUnitId, 'manual')
        return { kind: 'needs_technician' }
      }

      const recent = clockCommands.find((command) => {
        const stamp = command.deviceCommandSentAt ?? command.deviceCommandCreatedAt
        if (!stamp) return false
        return input.now.diff(stamp, 'hours').hours < ADMS_CLOCK_SYNC_COOLDOWN_HOURS
      })
      if (recent) return { kind: 'cooldown' }
    }

    const zone = input.deviceZone
    const local = zone ? input.now.setZone(zone) : input.now
    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.CLOCK_SYNC,
      fields: { dateTime: String(toZkDateTime(local.isValid ? local : input.now)) },
      correlationKey: CLOCK_SYNC_CORRELATION_KEY,
      requestedByUserId: input.requestedByUserId ?? null,
    })

    return result.created
      ? { kind: 'enqueued', command: result.command }
      : { kind: 'already_queued', command: result.command }
  }

  /**
   * La deriva bajo del umbral. Si habia un ajuste esperando, esta es la
   * evidencia que el acuse nunca pudo dar: el equipo responde `Return=0`
   * igual con la hora buena que con la mala (bateria rev.5).
   */
  async confirmFromDrift(input: {
    accessPointId: number
    businessUnitId: number
    now: DateTime
  }): Promise<DeviceCommand | null> {
    const history = await this.commands.listByDevice(input.accessPointId)
    const pending = history.find(
      (command) =>
        command.deviceCommandKind === DEVICE_COMMAND_KIND.CLOCK_SYNC &&
        command.deviceCommandStatus === DEVICE_COMMAND_STATUS.ACKED
    )
    await this.clock.markVerified(input.accessPointId, input.businessUnitId, input.now)
    if (!pending) return null

    pending.deviceCommandStatus = DEVICE_COMMAND_STATUS.EXECUTED
    pending.deviceCommandExecutedAt = input.now
    pending.deviceCommandExecutionEvidence = 'attlog_drift_ok'
    await pending.save()
    return pending
  }
}

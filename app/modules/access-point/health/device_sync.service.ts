import { DateTime } from 'luxon'
import DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import { TenantContext } from '#utils/tenant_context'

/**
 * Cuanto se espera a que el equipo conteste antes de devolver la ficha.
 *
 * Un aparato que recibio el saludo sondea cada cinco segundos, asi que veinte
 * dan margen para dos o tres vueltas. Mas que eso no ayuda: si no contesto en
 * ese rato, o esta apagado o esta sondeando muy espaciado, y en los dos casos
 * lo util es decirlo y no dejar la pantalla colgada.
 */
export const DEVICE_SYNC_WAIT_SECONDS = 20
const POLL_INTERVAL_MS = 1000

export type DeviceSyncOutcome =
  /** El equipo contesto y la ficha ya trae sus datos nuevos. */
  | { kind: 'answered'; commandId: number }
  /** Se le pidio, pero no ha pasado a recogerlo. La peticion sigue en pie. */
  | { kind: 'pending'; commandId: number }
  /** El equipo contesto que no puede. */
  | { kind: 'failed'; commandId: number; error: string | null }

/**
 * Le pide al checador que vuelva a presentarse (spec ADMS 6.5).
 *
 * Con ADMS el servidor NO puede consultar al aparato: el aparato pregunta y el
 * servidor contesta. Asi que "sincronizar" no es una consulta, es dejarle un
 * `INFO` en la cola y esperar a que pase a recogerlo. Cuando lo acusa, su
 * volcado alimenta el perfil y la ficha se puede releer ya actualizada.
 *
 * La espera es deliberada: es lo que hace que el boton se sienta como una
 * consulta y no como un "ya se le avisara". Si se agota, el comando NO se
 * cancela -- el equipo lo recogera cuando vuelva, y el perfil se actualizara
 * igual aunque nadie este mirando.
 */
export default class DeviceSyncService {
  constructor(private readonly commands: DeviceCommandPort = new DeviceCommandService()) {}

  async requestAndWait(input: {
    accessPointId: number
    businessUnitId: number
    userId: number | null
    waitSeconds?: number
  }): Promise<DeviceSyncOutcome> {
    /**
     * Llave fija a proposito: N clics seguidos dejan UN solo comando en la
     * cola. Sin esto, el boton seria una via facil de llenarla.
     */
    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.INFO,
      fields: {},
      correlationKey: 'info:sincronizacion-manual',
      requestedByUserId: input.userId,
    })

    const commandId = result.command.deviceCommandId
    const deadline = DateTime.utc().plus({
      seconds: input.waitSeconds ?? DEVICE_SYNC_WAIT_SECONDS,
    })

    while (DateTime.utc() < deadline) {
      const command = await TenantContext.runUnscoped(
        () => DeviceCommand.query().where('device_command_id', commandId).first(),
        'sincronizacion manual: se relee el comando propio para saber si ya contestaron'
      )
      if (!command) return { kind: 'pending', commandId }

      const status = command.deviceCommandStatus
      if (status === DEVICE_COMMAND_STATUS.ACKED || status === DEVICE_COMMAND_STATUS.EXECUTED) {
        return { kind: 'answered', commandId }
      }
      if (status === DEVICE_COMMAND_STATUS.FAILED) {
        return { kind: 'failed', commandId, error: command.deviceCommandLastError }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    return { kind: 'pending', commandId }
  }
}

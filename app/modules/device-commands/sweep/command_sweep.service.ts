import { DateTime } from 'luxon'
import { TenantContext } from '#utils/tenant_context'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  DEVICE_COMMAND_ENROLL_INFLIGHT_TIMEOUT_SECONDS,
  DEVICE_COMMAND_EVIDENCE_TIMEOUT_MINUTES,
  DEVICE_COMMAND_FAILURE,
  DEVICE_COMMAND_INFLIGHT_TIMEOUT_SECONDS,
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '../device_command.constants.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'

export interface CommandSweepResult {
  taken: number
  timedOut: number
  withoutEvidence: number
}

export const COMMAND_SWEEP_BATCH_SIZE = 200

const UNSCOPED_REASON =
  'barrido de comandos: cierra lo colgado de todos los equipos, no de una empresa'

/**
 * Cierra los comandos que quedaron colgados (spec ADMS 6.2).
 *
 * Hace falta un barrido y no basta con evaluar en `getrequest`: un equipo que
 * se apago deja de sondear, y sin esto sus comandos se quedarian `sent` para
 * siempre, sin poder reintentarse y sin decirle a nadie que no llegaron.
 */
export default class CommandSweepService {
  constructor(
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql(),
    private readonly now: () => DateTime = () => DateTime.utc()
  ) {}

  async run(limit: number = COMMAND_SWEEP_BATCH_SIZE): Promise<CommandSweepResult> {
    const now = this.now()
    const stuck = await TenantContext.runUnscoped(
      () =>
        this.repository.findStuck({
          sentBefore: now.minus({ seconds: DEVICE_COMMAND_INFLIGHT_TIMEOUT_SECONDS }),
          enrollSentBefore: now.minus({
            seconds: DEVICE_COMMAND_ENROLL_INFLIGHT_TIMEOUT_SECONDS,
          }),
          ackedBefore: now.minus({ minutes: DEVICE_COMMAND_EVIDENCE_TIMEOUT_MINUTES }),
          limit,
        }),
      UNSCOPED_REASON
    )

    let timedOut = 0
    let withoutEvidence = 0

    for (const command of stuck) {
      if (command.deviceCommandStatus === DEVICE_COMMAND_STATUS.SENT) {
        command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
        command.deviceCommandFailedAt = now
        command.deviceCommandLastError = DEVICE_COMMAND_FAILURE.INFLIGHT_TIMEOUT
        await this.repository.save(command)
        timedOut += 1
        continue
      }

      /**
       * El borrado de usuario no falla por falta de evidencia: el equipo no
       * anuncia una baja y su unica senal es que el contador de usuarios baje
       * en la siguiente subida de opciones. Queda `acked` y visible.
       */
      if (command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE) continue

      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = now
      command.deviceCommandLastError = DEVICE_COMMAND_FAILURE.NO_EVIDENCE
      await this.repository.save(command)
      withoutEvidence += 1
    }

    return { taken: stuck.length, timedOut, withoutEvidence }
  }
}

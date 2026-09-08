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
        /**
         * Condicionado al estado leido: entre la lectura de la tanda y esta
         * escritura puede haber entrado el acuse. Marcar "fallo" sobre una
         * orden que el equipo si ejecuto haria que el operador la reintentara.
         */
        const failed = await this.repository.markFailedIfStill({
          commandId: command.deviceCommandId,
          expectedStatus: DEVICE_COMMAND_STATUS.SENT,
          failedAt: now,
          error: DEVICE_COMMAND_FAILURE.INFLIGHT_TIMEOUT,
        })
        if (failed) timedOut += 1
        continue
      }

      /**
       * Dos tipos no fallan por falta de evidencia, porque su evidencia no
       * llega en minutos (spec 6.2 y 6.7):
       *
       * - `user_delete`: el equipo no anuncia una baja; su unica senal es que
       *   el contador de usuarios baje en la siguiente subida de opciones.
       * - `clock_sync`: su evidencia es una checada real con la deriva ya
       *   corregida, y en un equipo de poco movimiento eso puede tardar horas.
       *   Fallarlo aqui obligaria a reintentar un ajuste que quiza si funciono.
       *
       * Los dos quedan `acked` y visibles.
       */
      if (
        command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE ||
        command.deviceCommandKind === DEVICE_COMMAND_KIND.CLOCK_SYNC
      ) {
        continue
      }

      const failed = await this.repository.markFailedIfStill({
        commandId: command.deviceCommandId,
        expectedStatus: DEVICE_COMMAND_STATUS.ACKED,
        failedAt: now,
        error: DEVICE_COMMAND_FAILURE.NO_EVIDENCE,
      })
      if (failed) withoutEvidence += 1
    }

    return { taken: stuck.length, timedOut, withoutEvidence }
  }
}

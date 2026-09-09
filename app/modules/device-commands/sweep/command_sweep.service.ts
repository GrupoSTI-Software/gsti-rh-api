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
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import DeviceCommandService from '../device_command.service.js'

export interface CommandSweepResult {
  taken: number
  timedOut: number
  withoutEvidence: number
  /** Equipos a los que se les volvio a pedir el padron para cerrar una baja. */
  rosterRequested: number
}

/**
 * Cuanto se espera al padron antes de volver a pedirlo.
 *
 * El `CHECK` sale al acusar el borrado, pero el equipo pudo estar apagado o el
 * lote pudo perderse. Un cuarto de hora es holgado para un aparato que sondea
 * cada pocos segundos y corto frente al costo de no reintentar: mientras la
 * baja no se cierra, ese PIN queda reservado y sus checadas retenidas.
 */
export const ROSTER_RECHECK_MINUTES = 15

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
    private readonly now: () => DateTime = () => DateTime.utc(),
    private readonly commands: DeviceCommandService = new DeviceCommandService()
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

    const rosterRequested = await this.requestPendingRosters(now, limit)

    return { taken: stuck.length, timedOut, withoutEvidence, rosterRequested }
  }

  /**
   * Vuelve a pedir el padron de los equipos con una baja sin cerrar.
   *
   * `revoke_acked` es el unico estado en el que la checada de ese PIN se
   * retiene por ambigua, asi que dejarlo ahi no es neutro: son checadas que
   * nadie acredita. El `CHECK` lleva clave de correlacion fija, de modo que
   * varias bajas del mismo equipo dejan un solo comando en la cola.
   */
  private async requestPendingRosters(now: DateTime, limit: number): Promise<number> {
    const pending = await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where(
            'access_point_employee_sync_status',
            ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
          )
          .where(
            'access_point_employee_updated_at',
            '<',
            now.minus({ minutes: ROSTER_RECHECK_MINUTES }).toSQL({ includeOffset: false }) ?? ''
          )
          .limit(limit),
      UNSCOPED_REASON
    )

    const seen = new Set<number>()
    for (const pivot of pending) {
      if (seen.has(pivot.accessPointId)) continue
      seen.add(pivot.accessPointId)
      await TenantContext.run([pivot.businessUnitId], () =>
        this.commands.enqueue({
          accessPointId: pivot.accessPointId,
          businessUnitId: pivot.businessUnitId,
          kind: DEVICE_COMMAND_KIND.CHECK,
          fields: {},
          correlationKey: 'check:padron-tras-baja',
          requestedByUserId: null,
        })
      )
    }
    return seen.size
  }
}

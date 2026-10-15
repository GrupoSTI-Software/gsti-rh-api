import { DateTime } from 'luxon'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { AccessPointScope } from '#modules/access-point/sharing/access_point_scope'
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
import RosterReconciliationService from '#modules/access-point/employee-sync/roster_reconciliation.service'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type DeviceCommand from '#models/device_command'

export interface CommandSweepResult {
  taken: number
  /** En vuelo sin acuse que volvieron a la cola con un intento mas. */
  requeued: number
  /** En vuelo sin acuse que agotaron sus intentos (o eran presenciales). */
  timedOut: number
  withoutEvidence: number
  /** Equipos a los que se les volvio a pedir el padron para cerrar una baja. */
  rosterRequested: number
  /** Bajas cerradas porque el equipo nunca contesto el padron. */
  revocationsClosed: number
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
    private readonly commands: DeviceCommandService = new DeviceCommandService(),
    private readonly roster: RosterReconciliationService = new RosterReconciliationService(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql()
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
      TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
    )

    let requeued = 0
    let timedOut = 0
    let withoutEvidence = 0

    for (const command of stuck) {
      if (command.deviceCommandStatus === DEVICE_COMMAND_STATUS.SENT) {
        /**
         * Una sola politica para lo que salio y nadie acuso: vuelve a la cola
         * con un intento mas, y solo al agotarlos queda fallido. La baja de
         * usuario no tiene tope; el enrolamiento presencial no se reintenta.
         *
         * Condicionado al estado leido: entre la lectura de la tanda y esta
         * escritura puede haber entrado el acuse. Tocar una orden que el
         * equipo si ejecuto haria que el operador la reintentara.
         *
         * El vinculo se suelta solo al fallar: mientras la orden se reintenta
         * sigue en camino, y moverlo en cada vuelta lo dejaria contando una
         * historia que no paso.
         */
        const outcome = await TenantContext.runUnscoped(
          () =>
            this.repository.requeueOrFailIfStill({
              commandId: command.deviceCommandId,
              expectedStatus: DEVICE_COMMAND_STATUS.SENT,
              now,
              error: DEVICE_COMMAND_FAILURE.INFLIGHT_TIMEOUT,
            }),
          TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
        )
        if (outcome === 'requeued') requeued += 1
        if (outcome === 'failed') {
          timedOut += 1
          await this.releasePivot(command)
        }
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

      /**
       * Tambien fuera del corte por empresa, como la lectura de la tanda. Las
       * escrituras del barrido corrian sin bypass y el mixin las bloqueaba en
       * silencio desde la consola (`mode: blocked`): ningun comando colgado se
       * cerraba nunca. Se vio el 2026-10-12 con un alta en vuelo que siguio
       * `sent` despues de tres barridos.
       */
      const failed = await TenantContext.runUnscoped(
        () =>
          this.repository.markFailedIfStill({
            commandId: command.deviceCommandId,
            expectedStatus: DEVICE_COMMAND_STATUS.ACKED,
            failedAt: now,
            error: DEVICE_COMMAND_FAILURE.NO_EVIDENCE,
          }),
        TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
      )
      if (failed) withoutEvidence += 1
    }

    /**
     * Primero se cierra lo que ya tuvo su oportunidad y despues se pide de
     * nuevo: al reves, el `CHECK` recien encolado reiniciaria la espera de la
     * baja que estaba a punto de cerrarse.
     */
    const revocationsClosed = await TenantContext.runUnscoped(
      () => this.roster.closeSilentRevocations(now),
      TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
    )
    const rosterRequested = await this.requestPendingRosters(now, limit)

    return {
      taken: stuck.length,
      requeued,
      timedOut,
      withoutEvidence,
      rosterRequested,
      revocationsClosed,
    }
  }

  /**
   * Vuelve a pedir el padron de los equipos con una baja sin cerrar.
   *
   * `revoke_acked` es el unico estado en el que la checada de ese PIN se
   * retiene por ambigua, asi que dejarlo ahi no es neutro: son checadas que
   * nadie acredita. El `CHECK` lleva clave de correlacion fija, de modo que
   * varias bajas del mismo equipo dejan un solo comando en la cola.
   */
  /**
   * Suelta el vinculo que ese comando dejo esperando.
   *
   * El barrido cerraba el COMANDO y no tocaba el pivote, asi que un equipo que
   * recogio el alta y se apago antes de acusar dejaba la fila en `sent` para
   * siempre. Desde ahi la maquina solo admite `confirmed` y `failed`, y las dos
   * dependen de que el aparato vuelva a hablar: no se podia revocar, ni
   * reenviar, ni retirar la asignacion. La persona quedaba dentro del checador
   * sin una sola via para sacarla.
   *
   * `failed` --o `revoke_failed` si lo que se perdio era la baja-- es la
   * verdad: la orden salio, nadie contesto y hay que volver a intentarlo. Las
   * dos tienen salida hacia el camino de alta y hacia el de baja.
   */
  private async releasePivot(command: DeviceCommand): Promise<void> {
    if (!command.accessPointEmployeeId) return

    const target =
      command.deviceCommandKind === DEVICE_COMMAND_KIND.USER_DELETE
        ? ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED
        : ACCESS_POINT_EMPLOYEE_SYNC_STATUS.FAILED

    /**
     * Sin corte por empresa, como el resto del barrido, y sin lanzar: el pivote
     * puede estar en un estado que no admita la transicion --el acuse entro
     * entre la lectura y esta escritura-- y `updateStatus` lo ignora sin ruido.
     */
    await TenantContext.runUnscoped(
      () => this.pivots.updateStatus(command.accessPointEmployeeId as number, target),
      TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
    )
  }

  private async requestPendingRosters(now: DateTime, limit: number): Promise<number> {
    // Se espera dentro del bypass: el builder sin esperar se ejecutaba ya fuera
    // del contexto y el filtro de empresa bloqueaba la consulta.
    const pending = await TenantContext.runUnscoped(
      async () =>
        await AccessPointEmployee.query()
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
      TENANT_UNSCOPED_REASON.ADMS_COMMAND_SWEEP
    )

    const seen = new Set<number>()
    for (const pivot of pending) {
      if (seen.has(pivot.accessPointId)) continue
      seen.add(pivot.accessPointId)
      /**
       * El `CHECK` es del aparato: va a nombre de la responsable, no de la
       * empresa del pivote, que puede ser una ex-invitada (VLRH-P0065, 3.3).
       */
      const owner = await AccessPointScope.ownerOf(pivot.accessPointId)
      if (owner === null) continue
      await TenantContext.run([owner], () =>
        this.commands.enqueue({
          accessPointId: pivot.accessPointId,
          businessUnitId: owner,
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

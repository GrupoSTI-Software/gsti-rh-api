import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import SyncAssistsService from '#services/sync_assists_service'
import { TenantContext } from '#utils/tenant_context'

export interface CalendarRecalcRunResult {
  taken: number
  done: number
  failed: number
  /** Trabajos que otra corrida dejo colgados y volvieron a la cola. */
  recovered: number
}

/** Tras tres intentos el trabajo queda `failed` y deja de reintentarse solo. */
export const CALENDAR_RECALC_MAX_ATTEMPTS = 3

/** Tope por corrida: el comando corre cada minuto y no debe encimarse consigo mismo. */
export const CALENDAR_RECALC_BATCH_SIZE = 50

/**
 * Un trabajo reclamado y sin cerrar por mas de esto se da por abandonado.
 * Holgado a proposito: devolverlo antes de que la corrida real termine lo
 * pondria a correr dos veces.
 */
export const CALENDAR_RECALC_STALE_MINUTES = 15

const UNSCOPED_REASON =
  'recalculo de calendarios: la cola es de todas las empresas y cada trabajo abre el scope de la suya'

/**
 * Consume la cola de recalculo (spec ADMS 5.4).
 *
 * Los trabajos de un mismo colaborador se funden en un solo recalculo con el
 * rango mas amplio: el checador puede subir varios lotes seguidos y recalcular
 * tres veces lo mismo solo cuesta tiempo.
 */
export default class CalendarRecalcService {
  constructor(private readonly syncAssists: SyncAssistsService = new SyncAssistsService()) {}

  async run(
    limit: number = CALENDAR_RECALC_BATCH_SIZE,
    now: DateTime = DateTime.utc()
  ): Promise<CalendarRecalcRunResult> {
    /**
     * Antes de tomar nada, se devuelven a la cola los trabajos que otra corrida
     * reclamo y nunca cerro: si el proceso murio a medias, ese calendario no se
     * recalcularia jamas y nadie se enteraria.
     */
    const recovered = await this.recoverStale(now)

    /**
     * El reclamo va en UNA sentencia con su propio identificador de corrida.
     *
     * Antes se leian los `pending`, se procesaban y se marcaban `done` al
     * final: dos corridas solapadas -- y el comando corre cada minuto, mientras
     * una tanda pesada tarda mas -- leian los MISMOS trabajos y recalculaban a
     * la vez sobre las mismas filas de calendario.
     */
    const runId = randomUUID()
    const claimed = await TenantContext.runUnscoped(
      () =>
        db
          .from('assist_calendar_recalc_jobs')
          .where('assist_calendar_recalc_job_status', 'pending')
          .orderBy('assist_calendar_recalc_job_id', 'asc')
          .limit(limit)
          .update({
            assist_calendar_recalc_job_status: 'processing',
            assist_calendar_recalc_job_claimed_by: runId,
            assist_calendar_recalc_job_claimed_at: now.toFormat('yyyy-MM-dd HH:mm:ss'),
          }),
      UNSCOPED_REASON
    )
    if (Number(claimed) === 0) return { taken: 0, done: 0, failed: 0, recovered }

    /** Solo lo que lleva la marca de ESTA corrida. */
    const jobs = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query()
          .where('assist_calendar_recalc_job_claimed_by', runId)
          .where('assist_calendar_recalc_job_status', 'processing')
          .orderBy('assist_calendar_recalc_job_id', 'asc'),
      UNSCOPED_REASON
    )
    if (jobs.length === 0) return { taken: 0, done: 0, failed: 0, recovered }

    const grouped = new Map<
      string,
      { businessUnitId: number; employeeId: number; from: DateTime; to: DateTime; rows: AssistCalendarRecalcJob[] }
    >()
    for (const job of jobs) {
      const key = `${job.businessUnitId}:${job.employeeId}`
      const current = grouped.get(key)
      if (!current) {
        grouped.set(key, {
          businessUnitId: job.businessUnitId,
          employeeId: job.employeeId,
          from: job.assistCalendarRecalcJobFrom,
          to: job.assistCalendarRecalcJobTo,
          rows: [job],
        })
        continue
      }
      if (job.assistCalendarRecalcJobFrom < current.from) current.from = job.assistCalendarRecalcJobFrom
      if (job.assistCalendarRecalcJobTo > current.to) current.to = job.assistCalendarRecalcJobTo
      current.rows.push(job)
    }

    let done = 0
    let failed = 0

    for (const group of grouped.values()) {
      try {
        await TenantContext.run([group.businessUnitId], () =>
          this.syncAssists.setDateCalendar({
            date: group.from.toFormat('yyyy-MM-dd'),
            dateEnd: group.to.toFormat('yyyy-MM-dd'),
            employeeID: group.employeeId,
          })
        )
        for (const row of group.rows) {
          row.assistCalendarRecalcJobStatus = 'done'
          row.assistCalendarRecalcJobDoneAt = DateTime.utc()
          row.assistCalendarRecalcJobAttempts += 1
          await row.save()
        }
        done += group.rows.length
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : String(error)
        for (const row of group.rows) {
          row.assistCalendarRecalcJobAttempts += 1
          row.assistCalendarRecalcJobError = message
          if (row.assistCalendarRecalcJobAttempts >= CALENDAR_RECALC_MAX_ATTEMPTS) {
            row.assistCalendarRecalcJobStatus = 'failed'
          } else {
            /**
             * Vuelve a la cola para el siguiente intento. Sin esto se quedaria
             * reclamado por una corrida que ya termino, y no se reintentaria
             * hasta que la recuperacion lo rescatara un cuarto de hora despues.
             */
            row.assistCalendarRecalcJobStatus = 'pending'
            row.assistCalendarRecalcJobClaimedBy = null
            row.assistCalendarRecalcJobClaimedAt = null
          }
          await row.save()
        }
        failed += group.rows.length
      }
    }

    return { taken: jobs.length, done, failed, recovered }
  }

  /**
   * Devuelve a `pending` lo que lleva demasiado tiempo reclamado.
   *
   * Un trabajo en `processing` cuya corrida murio no lo recoge nadie: se
   * quedaria ahi para siempre y ese calendario no se recalcularia. El plazo es
   * holgado a proposito -- una tanda de cincuenta dias con turnos y excepciones
   * tarda -- porque devolverlo demasiado pronto lo pondria a correr dos veces,
   * que es justo lo que se quiere evitar.
   */
  private async recoverStale(now: DateTime): Promise<number> {
    const cutoff = now.minus({ minutes: CALENDAR_RECALC_STALE_MINUTES })
    const recovered = await TenantContext.runUnscoped(
      () =>
        db
          .from('assist_calendar_recalc_jobs')
          .where('assist_calendar_recalc_job_status', 'processing')
          .where('assist_calendar_recalc_job_claimed_at', '<', cutoff.toFormat('yyyy-MM-dd HH:mm:ss'))
          .update({
            assist_calendar_recalc_job_status: 'pending',
            assist_calendar_recalc_job_claimed_by: null,
            assist_calendar_recalc_job_claimed_at: null,
          }),
      UNSCOPED_REASON
    )
    const total = Number(recovered)
    if (total > 0) {
      logger.warn(
        { recovered: total, staleMinutes: CALENDAR_RECALC_STALE_MINUTES },
        'Recalculo de calendarios: trabajos reclamados sin cerrar devueltos a la cola'
      )
    }
    return total
  }
}

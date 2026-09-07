import { DateTime } from 'luxon'
import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import SyncAssistsService from '#services/sync_assists_service'
import { TenantContext } from '#utils/tenant_context'

export interface CalendarRecalcRunResult {
  taken: number
  done: number
  failed: number
}

/** Tras tres intentos el trabajo queda `failed` y deja de reintentarse solo. */
export const CALENDAR_RECALC_MAX_ATTEMPTS = 3

/** Tope por corrida: el comando corre cada minuto y no debe encimarse consigo mismo. */
export const CALENDAR_RECALC_BATCH_SIZE = 50

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

  async run(limit: number = CALENDAR_RECALC_BATCH_SIZE): Promise<CalendarRecalcRunResult> {
    const jobs = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query()
          .where('assist_calendar_recalc_job_status', 'pending')
          .orderBy('assist_calendar_recalc_job_id', 'asc')
          .limit(limit),
      UNSCOPED_REASON
    )
    if (jobs.length === 0) return { taken: 0, done: 0, failed: 0 }

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
          }
          await row.save()
        }
        failed += group.rows.length
      }
    }

    return { taken: jobs.length, done, failed }
  }
}

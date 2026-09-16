import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import type { CalendarRecalcJob, CalendarRecalcRepository } from './calendar_recalc.repository.js'

/** Adaptador Lucid de la cola de recálculo. Una fila por colaborador y entrega. */
export default class CalendarRecalcRepositoryMysql implements CalendarRecalcRepository {
  async enqueue(jobs: CalendarRecalcJob[]): Promise<void> {
    for (const job of jobs) {
      const row = new AssistCalendarRecalcJob()
      row.businessUnitId = job.businessUnitId
      row.employeeId = job.employeeId
      row.assistCalendarRecalcJobFrom = job.from
      row.assistCalendarRecalcJobTo = job.to
      await row.save()
    }
  }
}

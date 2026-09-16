import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import CalendarRecalcService, {
  CALENDAR_RECALC_STALE_MINUTES,
} from '#modules/assist-ingestion/calendar-recalc/calendar_recalc.service'
import type SyncAssistsService from '#services/sync_assists_service'

/**
 * La cola se consumia sin reclamar: dos corridas solapadas leian los mismos
 * pendientes y recalculaban a la vez sobre las mismas filas de calendario. El
 * comando corre cada minuto y una tanda pesada tarda mas, asi que solaparse era
 * cuestion de tiempo.
 */
const STAMP = `${Date.now()}`

test.group('Reclamo de la cola de recalculo', (group) => {
  let businessUnitId: number
  let employeeId: number
  const jobIds: number[] = []

  /** Doble que cuenta llamadas sin tocar el motor de asistencia real. */
  function servicioConEspia() {
    const llamadas: number[] = []
    const espia = {
      async setDateCalendar(filters: { employeeID?: number }) {
        llamadas.push(filters.employeeID ?? 0)
        return { status: 200, data: { employeeCalendar: [] } }
      },
    } as unknown as SyncAssistsService
    return { service: new CalendarRecalcService(espia), llamadas }
  }

  async function crearJob(estado = 'pending', claimedAt: DateTime | null = null): Promise<number> {
    return TenantContext.runUnscoped(async () => {
      const job = new AssistCalendarRecalcJob()
      job.businessUnitId = businessUnitId
      job.employeeId = employeeId
      job.assistCalendarRecalcJobFrom = DateTime.utc().minus({ days: 2 })
      job.assistCalendarRecalcJobTo = DateTime.utc()
      job.assistCalendarRecalcJobStatus = estado as 'pending'
      job.assistCalendarRecalcJobAttempts = 0
      if (claimedAt) {
        job.assistCalendarRecalcJobClaimedBy = `corrida-muerta-${STAMP}`
        job.assistCalendarRecalcJobClaimedAt = claimedAt
      }
      await job.save()
      jobIds.push(job.assistCalendarRecalcJobId)
      return job.assistCalendarRecalcJobId
    }, 'fixture de la cola')
  }

  /**
   * La cola es global y `run()` toma TODO lo pendiente, incluidos trabajos
   * reales de otras empresas. Con un doble del motor de asistencia esos
   * trabajos quedarian marcados como hechos sin haberse recalculado: el
   * calendario de alguien se quedaria sin actualizar y nadie se enteraria.
   *
   * Por eso se aparcan antes de la prueba y se devuelven en la limpieza.
   */
  const aparcados: number[] = []

  async function aparcarTrabajosReales(): Promise<void> {
    await TenantContext.runUnscoped(async () => {
      const reales = await db
        .from('assist_calendar_recalc_jobs')
        .where('assist_calendar_recalc_job_status', 'pending')
        .select('assist_calendar_recalc_job_id')
      for (const fila of reales) {
        aparcados.push(Number(fila.assist_calendar_recalc_job_id))
      }
      if (aparcados.length === 0) return
      await db
        .from('assist_calendar_recalc_jobs')
        .whereIn('assist_calendar_recalc_job_id', aparcados)
        .update({
          assist_calendar_recalc_job_status: 'processing',
          assist_calendar_recalc_job_claimed_by: `aparcado-por-prueba-${STAMP}`,
          /** Reciente, para que la recuperacion de colgados no los rescate. */
          assist_calendar_recalc_job_claimed_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss'),
        })
    }, 'aparcar trabajos reales')
  }

  async function devolverTrabajosReales(): Promise<void> {
    if (aparcados.length === 0) return
    await TenantContext.runUnscoped(
      () =>
        db
          .from('assist_calendar_recalc_jobs')
          .whereIn('assist_calendar_recalc_job_id', aparcados)
          .update({
            assist_calendar_recalc_job_status: 'pending',
            assist_calendar_recalc_job_claimed_by: null,
            assist_calendar_recalc_job_claimed_at: null,
          }),
      'devolver trabajos reales'
    )
  }

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      for (const c of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', c.businessUnitId)
          .first()
        if (someone) {
          businessUnitId = c.businessUnitId
          employeeId = someone.employeeId
          break
        }
      }
      if (!employeeId) throw new Error('Se requiere una empresa con colaborador.')
    }, 'fixture')
    await aparcarTrabajosReales()
  })

  group.teardown(async () => {
    await devolverTrabajosReales()
    await TenantContext.runUnscoped(async () => {
      if (jobIds.length > 0) {
        await db
          .from('assist_calendar_recalc_jobs')
          .whereIn('assist_calendar_recalc_job_id', jobIds)
          .delete()
      }
    }, 'limpieza')
  })

  test('dos corridas simultaneas no recalculan el mismo trabajo', async ({ assert }) => {
    const id = await crearJob()

    const uno = servicioConEspia()
    const otro = servicioConEspia()
    const [a, b] = await Promise.all([uno.service.run(50), otro.service.run(50)])

    // Una se lo lleva y la otra se va con las manos vacias.
    const tomados = a.taken + b.taken
    assert.equal(tomados, 1, 'el trabajo debe tomarlo una sola corrida')
    assert.equal(uno.llamadas.length + otro.llamadas.length, 1)

    const row = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query()
          .where('assist_calendar_recalc_job_id', id)
          .firstOrFail(),
      'estado final'
    )
    assert.equal(row.assistCalendarRecalcJobStatus, 'done')
  })

  /**
   * Si la corrida muere a media tanda, sin esto el trabajo se queda reclamado
   * para siempre y ese calendario no se recalcula jamas.
   */
  test('un trabajo reclamado y abandonado vuelve a la cola', async ({ assert }) => {
    const viejo = DateTime.utc().minus({ minutes: CALENDAR_RECALC_STALE_MINUTES + 5 })
    const id = await crearJob('processing', viejo)

    const { service, llamadas } = servicioConEspia()
    const result = await service.run(50)

    assert.equal(result.recovered, 1)
    assert.equal(llamadas.length, 1, 'tras recuperarlo se procesa en la misma corrida')

    const row = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query().where('assist_calendar_recalc_job_id', id).firstOrFail(),
      'estado final'
    )
    assert.equal(row.assistCalendarRecalcJobStatus, 'done')
  })

  test('un trabajo reclamado hace un momento NO se le quita a quien lo tiene', async ({
    assert,
  }) => {
    const id = await crearJob('processing', DateTime.utc().minus({ minutes: 1 }))

    const { service, llamadas } = servicioConEspia()
    const result = await service.run(50)

    assert.equal(result.recovered, 0)
    assert.lengthOf(llamadas, 0)

    const row = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query().where('assist_calendar_recalc_job_id', id).firstOrFail(),
      'sigue reclamado'
    )
    assert.equal(row.assistCalendarRecalcJobStatus, 'processing')
  })

  test('un fallo sin agotar intentos vuelve a pending, no se queda reclamado', async ({
    assert,
  }) => {
    const id = await crearJob()
    const roto = {
      async setDateCalendar() {
        throw new Error('el motor de asistencia fallo')
      },
    } as unknown as SyncAssistsService

    const result = await new CalendarRecalcService(roto).run(50)
    assert.equal(result.failed, 1)

    const row = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query().where('assist_calendar_recalc_job_id', id).firstOrFail(),
      'estado tras el fallo'
    )
    assert.equal(row.assistCalendarRecalcJobStatus, 'pending')
    assert.equal(row.assistCalendarRecalcJobAttempts, 1)
    assert.isNull(row.assistCalendarRecalcJobClaimedBy)
  })
})

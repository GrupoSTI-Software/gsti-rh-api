import { test } from '@japa/runner'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import db from '@adonisjs/lucid/services/db'
import ReportJob, { type ReportJobFilters } from '#models/report_job'
import AssistsService from '#services/assist_service'
import ReportJobService from '#services/report_job_service'
import { TenantContext } from '#utils/tenant_context'
import {
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1789600808831 — N12 / CA-11 (R-8).
 * `processJob` debe abrir `TenantContext.run` con el alcance persistido al encolar,
 * también fuera de cualquier contexto previo (p. ej. recuperación tras reinicio).
 */

const FILTERS: ReportJobFilters = {
  filterDate: '2026-08-01',
  filterDateEnd: '2026-08-15',
  departmentsList: [],
  locale: 'es',
}

type GenerateAssistanceAllBuffer = AssistsService['generateAssistanceAllBuffer']
type AssistanceAllBufferResult = Awaited<ReturnType<GenerateAssistanceAllBuffer>>
type AssistanceAllBufferSuccess = Extract<AssistanceAllBufferResult, { type: 'success' }>

async function minimalAssistanceSuccessBuffer(): Promise<AssistanceAllBufferSuccess> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Reporte de asistencias')
  sheet.addRow(['ID de empleado', 'Nombre del empleado'])
  const buffer = await workbook.xlsx.writeBuffer()
  return {
    status: 201,
    type: 'success' as const,
    title: 'Reporte de prueba',
    message: 'OK',
    buffer,
  }
}

function installRunUnscopedCounter(onCall: () => void): () => void {
  const original = TenantContext.runUnscoped
  Object.defineProperty(TenantContext, 'runUnscoped', {
    configurable: true,
    writable: true,
    value: ((fn: () => unknown, reason: Parameters<typeof TenantContext.runUnscoped>[1], detail?: string) => {
      onCall()
      return original.call(TenantContext, fn, reason, detail)
    }) as typeof TenantContext.runUnscoped,
  })
  return () => {
    Object.defineProperty(TenantContext, 'runUnscoped', {
      configurable: true,
      writable: true,
      value: original,
    })
  }
}

test.group('ReportJobService.processJob — contexto de tenant (USRH1789600808831 / N12)', (group) => {
  let actor: TenantActor
  let service: ReportJobService
  let restoreAssist: (() => void) | null = null
  let restoreRunUnscoped: (() => void) | null = null
  let unscopedCalls = 0

  group.setup(async () => {
    actor = await createTenantActor('report-job-tenant')
    service = new ReportJobService()
  })

  group.teardown(async () => {
    restoreRunUnscoped?.()
    if (restoreAssist) restoreAssist()
    await ReportJob.query().where('user_id', actor.user.userId).delete()
    await cleanupTenantActor(actor)
  })

  group.each.setup(() => {
    unscopedCalls = 0
    restoreRunUnscoped = installRunUnscopedCounter(() => {
      unscopedCalls++
    })
  })

  group.each.teardown(() => {
    restoreRunUnscoped?.()
    restoreRunUnscoped = null
    if (restoreAssist) {
      restoreAssist()
      restoreAssist = null
    }
  })

  function stubAssists(handler: GenerateAssistanceAllBuffer) {
    const original = AssistsService.prototype.generateAssistanceAllBuffer
    AssistsService.prototype.generateAssistanceAllBuffer =
      handler as AssistsService['generateAssistanceAllBuffer']
    restoreAssist = () => {
      AssistsService.prototype.generateAssistanceAllBuffer = original
    }
  }

  async function createPendingJob(allowedIds: number[]): Promise<ReportJob> {
    return ReportJob.create({
      reportJobId: uuidv4(),
      userId: actor.user.userId,
      reportJobType: 'assistance_all',
      reportJobFilters: FILTERS,
      reportJobAllowedBusinessUnitIds: allowedIds,
      reportJobStatus: 'pending',
      reportJobProgressCurrent: 0,
      reportJobProgressTotal: 0,
      reportJobFileKey: null,
      reportJobFileName: null,
      reportJobErrorMessage: null,
      reportJobCompletedAt: null,
      reportJobExpiresAt: null,
    })
  }

  test('processJob fuera de contexto abre run([A]) y pasa ese alcance al generador', async ({
    assert,
  }) => {
    const unitA = actor.businessUnit.businessUnitId
    let seenAllowedIds: number[] | null = null
    let scopeWhileGenerating: number[] | null = null
    let tenantActiveWhileGenerating = false
    let tenantBypassedWhileGenerating = false

    stubAssists(async (_filters, _departments, allowedBusinessUnitIds, _onProgress) => {
      seenAllowedIds = allowedBusinessUnitIds
      scopeWhileGenerating = TenantContext.getScope()
      tenantActiveWhileGenerating = TenantContext.isActive()
      tenantBypassedWhileGenerating = TenantContext.isBypassed()
      return minimalAssistanceSuccessBuffer()
    })

    assert.isFalse(TenantContext.isActive())
    const job = await createPendingJob([unitA])
    await service.processJob(job.reportJobId)

    await job.refresh()
    assert.equal(job.reportJobStatus, 'completed')
    assert.isNotNull(job.reportJobFileKey)
    assert.isTrue(tenantActiveWhileGenerating)
    assert.isFalse(tenantBypassedWhileGenerating)
    assert.deepEqual(seenAllowedIds, [unitA])
    assert.deepEqual(scopeWhileGenerating, [unitA])
    assert.equal(unscopedCalls, 0)
  })

  test('alcance vacío completa el job sin abrir runUnscoped', async ({ assert }) => {
    let seenAllowedIds: number[] | null = null

    stubAssists(async (_filters, _departments, allowedBusinessUnitIds, _onProgress) => {
      seenAllowedIds = allowedBusinessUnitIds
      return minimalAssistanceSuccessBuffer()
    })

    const job = await createPendingJob([])
    await service.processJob(job.reportJobId)
    await job.refresh()

    assert.equal(job.reportJobStatus, 'completed')
    assert.deepEqual(seenAllowedIds, [])
    assert.equal(unscopedCalls, 0)
  })

  test('recoverStuckJobs reencola con el alcance persistido', async ({ assert }) => {
    const unitA = actor.businessUnit.businessUnitId
    let seenAllowedIds: number[] | null = null

    stubAssists(async (_filters, _departments, allowedBusinessUnitIds, _onProgress) => {
      seenAllowedIds = allowedBusinessUnitIds
      return minimalAssistanceSuccessBuffer()
    })

    const job = await createPendingJob([unitA])
    const staleAt = DateTime.now().minus({ minutes: 45 }).toSQL({ includeOffset: false })!
    await db
      .from(ReportJob.table)
      .where('report_job_id', job.reportJobId)
      .update({
        report_job_status: 'processing',
        updated_at: staleAt,
      })

    const recovered = await service.recoverStuckJobs()
    assert.equal(recovered, 1)

    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setTimeout(resolve, 250))

    await job.refresh()
    assert.equal(job.reportJobStatus, 'completed')
    assert.deepEqual(seenAllowedIds, [unitA])
    assert.equal(unscopedCalls, 0)
  })
})

import { DateTime } from 'luxon'
import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs'
import path from 'node:path'
import ReportJob, {
  type ReportJobFilters,
  type ReportJobType,
} from '#models/report_job'
import Employee from '#models/employee'
import AssistsService from '#services/assist_service'
import UploadService from '#services/upload_service'
import logger from '@adonisjs/core/services/logger'
import i18nManager from '@adonisjs/i18n/services/main'
import env from '#start/env'

/** Prefijo que indica que la key es una ruta local de disco (solo en desarrollo). */
const LOCAL_KEY_PREFIX = 'local://'

/**
 * Máximo de jobs en segundo plano que se ejecutan en paralelo en este proceso.
 * Si hay más jobs pendientes, se colan y esperan a que haya hueco.
 */
const MAX_CONCURRENT_JOBS = 3

/**
 * TTL en horas del archivo generado en S3 antes de que el comando de limpieza
 * lo elimine. Configurable sin migración.
 */
const FILE_TTL_HOURS = 24

/**
 * Semáforo simple para controlar la concurrencia de los jobs en memoria.
 * Node.js es monohilo: no hay race conditions estructurales, pero sí
 * se puede tener N funciones async "en vuelo" simultáneamente.
 */
class InMemorySemaphore {
  private running = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

const jobSemaphore = new InMemorySemaphore(MAX_CONCURRENT_JOBS)

/** Nombre del archivo Excel final (igual al que producía el flujo anterior). */
const REPORT_FILE_NAME = 'datos.xlsx'

/** Contenido-tipo del archivo. */
const REPORT_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default class ReportJobService {
  private readonly uploadService = new UploadService()

  /**
   * Crea un job de reporte en estado `pending`, lanza su procesamiento
   * en segundo plano (sin bloquear la respuesta HTTP) y devuelve el ID.
   *
   * @param userId                  - ID del usuario autenticado que solicita el reporte.
   * @param reportJobType           - Tipo de reporte (`'assistance_all'` por ahora).
   * @param filters                 - Filtros del reporte (periodo, empresa, etc.).
   * @param allowedBusinessUnitIds  - Snapshot del scope del usuario en este momento.
   */
  async enqueue(
    userId: number,
    reportJobType: ReportJobType,
    filters: ReportJobFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<ReportJob> {
    const job = await ReportJob.create({
      reportJobId: uuidv4(),
      userId,
      reportJobType,
      reportJobFilters: filters,
      reportJobAllowedBusinessUnitIds: allowedBusinessUnitIds,
      reportJobStatus: 'pending',
      reportJobProgressCurrent: 0,
      reportJobProgressTotal: 0,
      reportJobFileKey: null,
      reportJobFileName: null,
      reportJobErrorMessage: null,
      reportJobCompletedAt: null,
      reportJobExpiresAt: null,
    })

    setImmediate(() => {
      this.processJob(job.reportJobId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        logger.error({ jobId: job.reportJobId, err: message }, 'ReportJobService: error no capturado en processJob')
      })
    })

    return job
  }

  /**
   * Procesa un job de reporte existente.
   * Adquiere el semáforo de concurrencia, genera el Excel, sube a S3
   * y actualiza el estado en BD.
   */
  async processJob(jobId: string): Promise<void> {
    const job = await ReportJob.find(jobId)
    if (!job) {
      logger.warn({ jobId }, 'ReportJobService.processJob: job no encontrado')
      return
    }

    if (job.reportJobStatus !== 'pending') {
      return
    }

    await jobSemaphore.acquire()
    try {
      await job.merge({ reportJobStatus: 'processing' }).save()

      await this.runGeneration(job)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ jobId, err: message }, 'ReportJobService.processJob: fallo durante generación')
      await job.merge({
        reportJobStatus: 'failed',
        reportJobErrorMessage: message,
        reportJobCompletedAt: DateTime.now(),
      }).save()
    } finally {
      jobSemaphore.release()
    }
  }

  /**
   * Ejecuta la generación del Excel y persiste el resultado.
   * - En `development`: disco local (`storage/reports/<jobId>/datos.xlsx`).
   * - En `production`/`staging`: S3 privado vía `upload_service.ts`.
   * Actualiza `progress_current` y `progress_total` en BD según avanza.
   */
  private async runGeneration(job: ReportJob): Promise<void> {
    const filters = job.reportJobFilters
    const allowedIds = job.reportJobAllowedBusinessUnitIds

    const locale = filters.locale || i18nManager.defaultLocale
    const i18n = i18nManager.locale(locale)

    const assistsService = new AssistsService(i18n)
    const onProgress = async (current: number, total: number) => {
      await job.merge({
        reportJobProgressCurrent: current,
        reportJobProgressTotal: total,
      }).save()
    }

    let buffer:
      | Awaited<ReturnType<AssistsService['generateAssistanceAllBuffer']>>
      | Awaited<ReturnType<AssistsService['generateIncidentSummaryBuffer']>>
      | Awaited<ReturnType<AssistsService['generateIncidentSummaryPayrollBuffer']>>

    if (
      job.reportJobType === 'assistance_employee' ||
      job.reportJobType === 'assistance_incident_summary' ||
      job.reportJobType === 'assistance_incident_summary_payroll'
    ) {
      const employeeId = filters.employeeId
      // El resumen de incidencias (nómina o no) también existe en variante
      // "toda la empresa" (sin employeeId): esa rama cae al `else` de abajo.
      if (job.reportJobType === 'assistance_employee' && !employeeId) {
        throw new Error('Falta employeeId para el reporte por empleado')
      }
      if (job.reportJobType === 'assistance_incident_summary_payroll' && employeeId) {
        const employee = await Employee.query()
          .withTrashed()
          .where('employee_id', employeeId)
          .preload('position')
          .preload('department')
          .preload('person')
          .preload('businessUnit')
          .preload('payrollBusinessUnit')
          .first()
        if (!employee) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        if (!allowedIds.includes(employee.businessUnitId)) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        buffer = await assistsService.generateIncidentSummaryPayrollEmployeeBuffer(
          employee,
          {
            employeeId,
            filterDate: filters.filterDate,
            filterDateEnd: filters.filterDateEnd,
            filterDatePay: filters.filterDatePay ?? '',
          },
          onProgress
        )
      } else if (job.reportJobType === 'assistance_incident_summary' && employeeId) {
        const employee = await Employee.query()
          .withTrashed()
          .where('employee_id', employeeId)
          .preload('position')
          .preload('department')
          .preload('person')
          .preload('businessUnit')
          .preload('payrollBusinessUnit')
          .first()
        if (!employee) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        if (!allowedIds.includes(employee.businessUnitId)) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        buffer = await assistsService.generateIncidentSummaryEmployeeBuffer(
          employee,
          {
            employeeId,
            filterDate: filters.filterDate,
            filterDateEnd: filters.filterDateEnd,
            filterDatePay: filters.filterDatePay ?? '',
          },
          filters.canDisplayPaymentsSummary ?? false,
          filters.canDisplayDiscountsSummary ?? false,
          onProgress
        )
      } else if (job.reportJobType === 'assistance_incident_summary_payroll') {
        // `assistance_incident_summary_payroll` sin employeeId: toda la empresa.
        const excelFilters = {
          ...filters,
          userResponsibleId: filters.userResponsibleId ?? undefined,
        }
        buffer = await assistsService.generateIncidentSummaryPayrollBuffer(
          excelFilters,
          filters.departmentsList,
          allowedIds,
          onProgress
        )
      } else if (employeeId) {
        const employee = await Employee.query()
          .withTrashed()
          .where('employee_id', employeeId)
          .preload('position')
          .preload('department')
          .preload('person')
          .first()
        if (!employee) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        if (!allowedIds.includes(employee.businessUnitId)) {
          throw new Error('Empleado no encontrado al generar el reporte')
        }
        buffer = await assistsService.generateAssistanceEmployeeBuffer(
          employee,
          {
            employeeId,
            filterDate: filters.filterDate,
            filterDateEnd: filters.filterDateEnd,
            filterDatePay: filters.filterDatePay ?? '',
          },
          onProgress
        )
      } else {
        // `assistance_incident_summary` sin employeeId: reporte de toda la empresa.
        const excelFilters = {
          ...filters,
          userResponsibleId: filters.userResponsibleId ?? undefined,
        }
        buffer = await assistsService.generateIncidentSummaryBuffer(
          excelFilters,
          filters.departmentsList,
          allowedIds,
          filters.canDisplayPaymentsSummary ?? false,
          filters.canDisplayDiscountsSummary ?? false,
          onProgress
        )
      }
    } else {
      // `ReportJobFilters` admite `userResponsibleId: null` (JSON); el Excel espera `undefined`.
      const excelFilters = {
        ...filters,
        userResponsibleId: filters.userResponsibleId ?? undefined,
      }
      buffer = await assistsService.generateAssistanceAllBuffer(
        excelFilters,
        filters.departmentsList,
        allowedIds,
        onProgress
      )
    }

    if (!buffer || buffer.status !== 201 || !('buffer' in buffer)) {
      throw new Error(
        'buffer' in (buffer ?? {}) ? String((buffer as any).message) : 'Error generando el reporte'
      )
    }

    const fileBuffer = Buffer.from(buffer.buffer as ArrayBuffer)
    const displayFileName =
      job.reportJobType === 'assistance_employee'
        ? `${i18n.formatMessage('assistance_report')}.xlsx`
        : job.reportJobType === 'assistance_incident_summary'
          ? `${i18n.formatMessage('incident_summary')}.xlsx`
          : job.reportJobType === 'assistance_incident_summary_payroll'
            ? `${i18n.formatMessage('incident_summary_payroll_report')}.xlsx`
            : REPORT_FILE_NAME
    let savedKey: string

    if (env.get('NODE_ENV') !== 'production') {
      savedKey = await this.saveToLocalDisk(job.reportJobId, fileBuffer)
    } else {
      const s3Key = `reports/${job.reportJobId}/${REPORT_FILE_NAME}`
      const uploadedKey = await this.uploadService.uploadPrivateBuffer(
        s3Key,
        fileBuffer,
        REPORT_CONTENT_TYPE
      )
      if (!uploadedKey) {
        throw new Error('No se pudo subir el reporte generado a S3')
      }
      savedKey = uploadedKey
    }

    await job.merge({
      reportJobStatus: 'completed',
      reportJobFileKey: savedKey,
      reportJobFileName: displayFileName,
      reportJobProgressCurrent: job.reportJobProgressTotal,
      reportJobCompletedAt: DateTime.now(),
      reportJobExpiresAt: DateTime.now().plus({ hours: FILE_TTL_HOURS }),
    }).save()
  }

  /**
   * Guarda el buffer en disco local bajo `storage/reports/<jobId>/datos.xlsx`.
   * Solo se usa en entornos distintos de producción.
   * Devuelve la key con prefijo `local://` para distinguirla de las keys de S3.
   */
  private async saveToLocalDisk(jobId: string, fileBuffer: Buffer): Promise<string> {
    const dir = path.join(process.cwd(), 'storage', 'reports', jobId)
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, REPORT_FILE_NAME)
    await fs.promises.writeFile(filePath, Uint8Array.from(fileBuffer))
    return `${LOCAL_KEY_PREFIX}${filePath}`
  }

  /**
   * Devuelve el estado actual de un job.
   * Verifica que pertenezca al usuario solicitante (anti-IDOR).
   */
  async getStatus(jobId: string, userId: number): Promise<ReportJob | null> {
    return ReportJob.query()
      .where('reportJobId', jobId)
      .where('userId', userId)
      .first()
  }

  /**
   * Indica si la key almacenada corresponde a un archivo en disco local (desarrollo).
   */
  isLocalKey(key: string): boolean {
    return key.startsWith(LOCAL_KEY_PREFIX)
  }

  /**
   * Extrae la ruta absoluta en disco a partir de una key local.
   */
  resolveLocalPath(key: string): string {
    return key.slice(LOCAL_KEY_PREFIX.length)
  }

  /**
   * Genera una URL firmada de S3 para descargar el archivo del job completado.
   * En desarrollo devuelve `null` (el controlador sirve el archivo directamente).
   * Devuelve `null` si el job no existe, no pertenece al usuario o no está completado.
   */
  async getDownloadUrl(jobId: string, userId: number): Promise<string | null> {
    const job = await this.getStatus(jobId, userId)
    if (!job || job.reportJobStatus !== 'completed' || !job.reportJobFileKey) {
      return null
    }
    if (this.isLocalKey(job.reportJobFileKey)) {
      return null
    }
    const url = await this.uploadService.getDownloadLink(job.reportJobFileKey, 60 * 60)
    if (typeof url !== 'string') return null
    return url
  }

  /**
   * Recupera jobs que quedaron en estado `processing` por un reinicio del servidor
   * y los vuelve a encolar. Llamado por el comando de scheduler.
   *
   * Deuda conocida (USRH1786566437097, §15.4): el re-despacho no envuelve
   * `processJob` en `TenantContext.run` — queda fuera de alcance de esta HU.
   */
  async recoverStuckJobs(): Promise<number> {
    const stuckThreshold = DateTime.now().minus({ minutes: 30 })
    const stuckJobs = await ReportJob.query()
      .where('reportJobStatus', 'processing')
      .where('updatedAt', '<', stuckThreshold.toSQL()!)

    let recovered = 0
    for (const job of stuckJobs) {
      await job.merge({ reportJobStatus: 'pending' }).save()
      setImmediate(() => {
        this.processJob(job.reportJobId).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          logger.error({ jobId: job.reportJobId, err: message }, 'ReportJobService: error recuperando job atascado')
        })
      })
      recovered++
    }

    return recovered
  }

  /**
   * Elimina de S3 y de la BD los jobs expirados.
   * Llamado por el comando de scheduler diario.
   */
  async cleanupExpiredJobs(): Promise<number> {
    const now = DateTime.now()
    const expiredJobs = await ReportJob.query()
      .where('reportJobStatus', 'completed')
      .where('reportJobExpiresAt', '<', now.toSQL()!)

    let deleted = 0
    for (const job of expiredJobs) {
      if (job.reportJobFileKey) {
        await this.deleteStoredFile(job.reportJobFileKey)
      }
      await job.delete()
      deleted++
    }

    const failedOld = await ReportJob.query()
      .whereIn('reportJobStatus', ['failed', 'pending'])
      .where('createdAt', '<', now.minus({ hours: FILE_TTL_HOURS * 2 }).toSQL()!)
    for (const job of failedOld) {
      await job.delete()
      deleted++
    }

    return deleted
  }

  private async deleteStoredFile(key: string): Promise<void> {
    try {
      if (this.isLocalKey(key)) {
        const filePath = this.resolveLocalPath(key)
        const dir = path.dirname(filePath)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        try { fs.rmdirSync(dir) } catch { /* ignora si el directorio no está vacío */ }
        return
      }
      await (this.uploadService as any).deleteFile?.(key)
    } catch {
      logger.warn({ key }, 'ReportJobService.deleteStoredFile: no se pudo eliminar el archivo')
    }
  }
}

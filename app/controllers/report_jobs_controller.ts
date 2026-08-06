import fs from 'node:fs'
import type { HttpContext } from '@adonisjs/core/http'
import ReportJobService from '#services/report_job_service'
import UserService from '#services/user_service'
import env from '#start/env'
import type { ReportJobFilters } from '#models/report_job'

export default class ReportJobsController {
  /**
   * POST /api/v1/assists/reports
   *
   * Crea un job de generación de reporte en segundo plano.
   * Responde 202 inmediatamente con el ID del job.
   *
   * Body:
   *   date, date-end, reportType, businessUnitId?, payrollBusinessUnitId?,
   *   branchNameIds?
   */
  async create({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        response.status(401)
        return { type: 'error', title: t('user_actions.unauthorized'), message: t('user_actions.unauthorized') }
      }

      await user.load('role')
      const userService = new UserService(i18n)

      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')
      const filterDatePay = request.input('datePay')
      const businessUnitIdRaw = request.input('businessUnitId')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
        ? Number(request.input('payrollBusinessUnitId'))
        : undefined
      const businessUnitId =
        businessUnitIdRaw !== null && businessUnitIdRaw !== undefined && Number(businessUnitIdRaw) > 0
          ? Number(businessUnitIdRaw)
          : undefined

      if (!filterDate || !filterDateEnd) {
        response.status(400)
        return {
          type: 'warning',
          title: t('report_type'),
          message: t('entity_is_not_valid', { entity: 'date' }),
        }
      }

      let userResponsibleId: number | null = null
      if (user.role.roleSlug !== 'root') {
        userResponsibleId = user.userId
      }

      const departmentsList = await userService.getRoleDepartments(user.userId)
      const allowedBusinessUnitIds =
        businessUnitId !== undefined ? [businessUnitId] : businessUnitScope

      const filters: ReportJobFilters = {
        filterDate,
        filterDateEnd,
        filterDatePay: filterDatePay ?? undefined,
        userResponsibleId,
        businessUnitId,
        payrollBusinessUnitId,
        branchNameIds: undefined,
        departmentsList,
        locale: i18n.locale,
      }

      const reportJobService = new ReportJobService()
      const job = await reportJobService.enqueue(
        user.userId,
        'assistance_all',
        filters,
        allowedBusinessUnitIds
      )

      response.status(202)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: {
          reportJobId: job.reportJobId,
          status: job.reportJobStatus,
        },
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('ReportJobsController.create: error inesperado', err)
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: err.message,
        ...(env.get('NODE_ENV') !== 'production' ? { errorDetail: err.stack } : {}),
      }
    }
  }

  /**
   * GET /api/v1/assists/reports/:id/status
   *
   * Consulta el estado de un job de reporte.
   * Verifica que el job pertenezca al usuario autenticado (anti-IDOR).
   */
  async status({ auth, params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        response.status(401)
        return { type: 'error', title: t('user_actions.unauthorized'), message: t('user_actions.unauthorized') }
      }

      const { id } = params
      const reportJobService = new ReportJobService()
      const job = await reportJobService.getStatus(id, user.userId)

      if (!job) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: 'report_job' }),
          message: t('entity_was_not_found', { entity: 'report_job' }),
          data: { reportJobId: id },
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: {
          reportJobId: job.reportJobId,
          status: job.reportJobStatus,
          progressCurrent: job.reportJobProgressCurrent,
          progressTotal: job.reportJobProgressTotal,
          fileName: job.reportJobFileName,
          errorMessage: job.reportJobErrorMessage,
          completedAt: job.reportJobCompletedAt?.toISO() ?? null,
          expiresAt: job.reportJobExpiresAt?.toISO() ?? null,
        },
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('ReportJobsController.status: error inesperado', err)
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: err.message,
      }
    }
  }

  /**
   * GET /api/v1/assists/reports/:id/download
   *
   * Descarga el archivo Excel de un job completado.
   * Verifica que el job pertenezca al usuario autenticado.
   * Si el job no está completado, devuelve 409.
   */
  async download({ auth, params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        response.status(401)
        return { type: 'error', title: t('user_actions.unauthorized'), message: t('user_actions.unauthorized') }
      }

      const { id } = params
      const reportJobService = new ReportJobService()
      const job = await reportJobService.getStatus(id, user.userId)

      if (!job) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: 'report_job' }),
          message: t('entity_was_not_found', { entity: 'report_job' }),
          data: { reportJobId: id },
        }
      }

      if (job.reportJobStatus === 'failed') {
        response.status(422)
        return {
          type: 'error',
          title: t('server_error'),
          message: job.reportJobErrorMessage ?? t('an_unexpected_error_has_occurred_on_the_server'),
          data: { reportJobId: id, status: job.reportJobStatus },
        }
      }

      if (job.reportJobStatus !== 'completed' || !job.reportJobFileKey) {
        response.status(409)
        return {
          type: 'warning',
          title: t('resource'),
          message: 'El reporte aún no está disponible para descarga',
          data: {
            reportJobId: id,
            status: job.reportJobStatus,
            progressCurrent: job.reportJobProgressCurrent,
            progressTotal: job.reportJobProgressTotal,
          },
        }
      }

      const fileName = job.reportJobFileName ?? 'datos.xlsx'

      // En desarrollo (key local), el API sirve el archivo directamente.
      if (reportJobService.isLocalKey(job.reportJobFileKey)) {
        const localPath = reportJobService.resolveLocalPath(job.reportJobFileKey)
        if (!fs.existsSync(localPath)) {
          response.status(404)
          return {
            type: 'error',
            title: t('server_error'),
            message: 'El archivo del reporte ya no está disponible en disco. Vuelve a solicitarlo.',
          }
        }
        response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response.header('Content-Disposition', `attachment; filename="${fileName}"`)
        response.status(200)
        return response.stream(fs.createReadStream(localPath))
      }

      // En producción: URL firmada de S3.
      const downloadUrl = await reportJobService.getDownloadUrl(id, user.userId)
      if (!downloadUrl) {
        response.status(500)
        return {
          type: 'error',
          title: t('server_error'),
          message: t('an_unexpected_error_has_occurred_on_the_server'),
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_found_successfully'),
        data: {
          downloadUrl,
          fileName,
          expiresAt: job.reportJobExpiresAt?.toISO() ?? null,
        },
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('ReportJobsController.download: error inesperado', err)
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: err.message,
      }
    }
  }
}

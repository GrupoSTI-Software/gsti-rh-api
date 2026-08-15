import fs from 'node:fs'
import type { HttpContext } from '@adonisjs/core/http'
import ReportJobService from '#services/report_job_service'
import UserService from '#services/user_service'
import RoleService from '#services/role_service'
import env from '#start/env'
import type { ReportJobFilters, ReportJobType } from '#models/report_job'
import Employee from '#models/employee'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { employeesAttendanceReportJobDeclaration } from '#constants/employees_download_permission_declarations'

const ATTENDANCE_MONITOR_MODULE_SLUG = 'employees-attendance-monitor'

export default class ReportJobsController {
  /** Ídem `AssistsController.parseBranchNameIds`: CSV de ids → number[] o `undefined`. */
  private parseBranchNameIds(value: unknown): number[] | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined
    }
    const parts = String(value)
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => !Number.isNaN(id) && id > 0)
    return parts.length > 0 ? parts : undefined
  }

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
  async create(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
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
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))
      const businessUnitId =
        businessUnitIdRaw !== null && businessUnitIdRaw !== undefined && Number(businessUnitIdRaw) > 0
          ? Number(businessUnitIdRaw)
          : undefined
      const reportTypeRaw = request.input('reportType') ?? 'assistance_all'
      const employeeIdRaw = request.input('employeeId')
      const employeeId =
        employeeIdRaw !== null && employeeIdRaw !== undefined && Number(employeeIdRaw) > 0
          ? Number(employeeIdRaw)
          : undefined

      const validTypes: ReportJobType[] = [
        'assistance_all',
        'assistance_employee',
        'assistance_incident_summary',
        'assistance_incident_summary_payroll',
      ]
      if (!validTypes.includes(reportTypeRaw)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('report_type'),
          message: t('entity_is_not_valid', { entity: t('report_type') }),
          data: { reportType: reportTypeRaw },
        }
      }
      const reportJobType = reportTypeRaw as ReportJobType

      // Gate server-side del resumen de incidencias: la decisión de qué
      // columnas salariales incluye el archivo (y si se puede descargar)
      // la toma el rol de quien descarga, NUNCA un flag del cliente.
      let canDisplayPaymentsSummary = false
      let canDisplayDiscountsSummary = false
      if (reportJobType === 'assistance_incident_summary') {
        const roleService = new RoleService()
        const canDownloadSummary = await roleService.hasAccess(
          user.role.roleId,
          ATTENDANCE_MONITOR_MODULE_SLUG,
          'download-summary'
        )
        if (!canDownloadSummary) {
          response.status(403)
          return {
            type: 'warning',
            title: t('user_actions.unauthorized'),
            message: t('user_actions.unauthorized'),
            data: { key: 'descarga-resumen-sin-permiso' },
          }
        }
        canDisplayPaymentsSummary = await roleService.hasAccess(
          user.role.roleId,
          ATTENDANCE_MONITOR_MODULE_SLUG,
          'display-payments-summary'
        )
        canDisplayDiscountsSummary = await roleService.hasAccess(
          user.role.roleId,
          ATTENDANCE_MONITOR_MODULE_SLUG,
          'display-discounts-summary'
        )
      }

      // Gate server-side del reporte de nómina (USRH1785766125045): la
      // única fuente de verdad de "quién puede ver el modo de nómina" es
      // el permiso `see-payroll`, NUNCA el modo de visualización elegido
      // en el cliente. Se rechaza antes de encolar (antes del primer byte).
      if (reportJobType === 'assistance_incident_summary_payroll') {
        const roleService = new RoleService()
        const canSeePayroll = await roleService.hasAccess(
          user.role.roleId,
          ATTENDANCE_MONITOR_MODULE_SLUG,
          'see-payroll'
        )
        if (!canSeePayroll) {
          response.status(403)
          return {
            type: 'warning',
            title: t('user_actions.unauthorized'),
            message: t('user_actions.unauthorized'),
            data: { key: 'descarga-nomina-sin-permiso' },
          }
        }
      }

      const allowed = await ensureSecondaryPermission(
        ctx,
        employeesAttendanceReportJobDeclaration(reportJobType, employeeId)
      )
      if (!allowed) return

      if (!filterDate || !filterDateEnd) {
        response.status(400)
        return {
          type: 'warning',
          title: t('report_type'),
          message: t('entity_is_not_valid', { entity: 'date' }),
        }
      }

      const allowedBusinessUnitIds =
        businessUnitId !== undefined ? [businessUnitId] : businessUnitScope

      // No-oráculo: inexistente y fuera de scope responden exactamente igual.
      // El resumen de incidencias por empleado (nómina o no) reutiliza este
      // mismo gate (misma ruta by-employee).
      if (
        reportJobType === 'assistance_employee' ||
        ((reportJobType === 'assistance_incident_summary' ||
          reportJobType === 'assistance_incident_summary_payroll') &&
          employeeId)
      ) {
        if (!employeeId) {
          response.status(400)
          const entity = t('employee')
          return {
            type: 'warning',
            title: t('entity_was_not_found', { entity }),
            message: t('entity_was_not_found_with_entered_id', { entity }),
            data: { key: 'empleado-no-encontrado' },
          }
        }
        const employee = await Employee.query()
          .withTrashed()
          .where('employee_id', employeeId)
          .first()
        const inScope =
          !!employee &&
          (allowedBusinessUnitIds.length === 0 ||
            allowedBusinessUnitIds.includes(employee.businessUnitId))
        if (!inScope) {
          response.status(400)
          const entity = t('employee')
          return {
            type: 'warning',
            title: t('entity_was_not_found', { entity }),
            message: t('entity_was_not_found_with_entered_id', { entity }),
            data: { key: 'empleado-no-encontrado' },
          }
        }
      }

      let userResponsibleId: number | null = null
      if (user.role.roleSlug !== 'root') {
        userResponsibleId = user.userId
      }

      const departmentsList = await userService.getRoleDepartments(user.userId)

      const filters: ReportJobFilters = {
        filterDate,
        filterDateEnd,
        filterDatePay: filterDatePay ?? undefined,
        userResponsibleId,
        businessUnitId,
        payrollBusinessUnitId,
        branchNameIds,
        departmentsList,
        locale: i18n.locale,
        employeeId,
        canDisplayPaymentsSummary,
        canDisplayDiscountsSummary,
      }

      const reportJobService = new ReportJobService()
      const job = await reportJobService.enqueue(
        user.userId,
        reportJobType,
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
  async download(ctx: HttpContext) {
    const { auth, params, response, i18n } = ctx
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

      const allowed = await ensureSecondaryPermission(
        ctx,
        employeesAttendanceReportJobDeclaration(job.reportJobType, job.reportJobFilters?.employeeId)
      )
      if (!allowed) return

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

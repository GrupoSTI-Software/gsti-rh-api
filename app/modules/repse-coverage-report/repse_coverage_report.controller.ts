import type { HttpContext } from '@adonisjs/core/http'
import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '../../helpers/compliance_repse_rbac.js'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '#constants/contrato_servicio_especializado_error_codes'
import RepseCoverageReportService from './repse_coverage_report.service.js'
import {
  getRepseCoverageReportExportValidator,
  getRepseCoverageReportValidator,
} from './validators/get_repse_coverage_report.validator.js'

const MODULE_SLUG = 'compliance-contratos'
const RBAC_FORBIDDEN = {
  errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'contrato_servicio_especializado',
}
const MAX_REPORT_RANGE_DAYS = 366

export default class RepseCoverageReportController {
  /**
   * @swagger
   * /api/repse/coverage-report:
   *   get:
   *     summary: Reporte de cobertura REPSE por empleado y empresa
   *     tags: [RepseCoverageReport]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         required: true
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         required: true
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: companyId
   *         schema: { type: integer }
   *       - in: query
   *         name: employeeId
   *         schema: { type: integer }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: perPage
   *         schema: { type: integer, minimum: 1, maximum: 500, default: 20 }
   *     responses:
   *       '200':
   *         description: Reporte calculado correctamente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Resources
   *               message: Resources were found successfully
   *               data:
   *                 meta:
   *                   total: 1
   *                   perPage: 20
   *                   currentPage: 1
   *                   lastPage: 1
   *                 data:
   *                   - employeeId: 1
   *                     employeeName: Empleado Temporal Repse
   *                     employeeCode: TRC-E001
   *                     diasLaborados: 5
   *                     companies:
   *                       - companyId: 1
   *                         companyName: Empresa temporal REPSE Coverage
   *                         diasBase: 0
   *                         diasPrestados: 5
   *                         diasServidos: 5
   *                         porcentajeObservado: 100
   *                         porcentajeDeclarado: 100
   *                         diferencia: 0
   *                     movimientos:
   *                       - assignmentId: 1
   *                         startDate: '2026-06-10'
   *                         endDate: '2026-06-16'
   *                         effectiveEndDate: '2026-06-16'
   *                         sourceBranchId: 1
   *                         sourceBranchName: TEMP_REPSE_COVERAGE ORIGEN
   *                         sourceCompanyId: null
   *                         sourceCompanyName: null
   *                         targetBranchId: 2
   *                         targetBranchName: TEMP_REPSE_COVERAGE DESTINO
   *                         targetCompanyId: 1
   *                         targetCompanyName: Empresa temporal REPSE Coverage
   *                         reason: cobertura
   *       '401':
   *         description: No autenticado
   *       '403':
   *         description: Sin permiso read o gestion
   *       '422':
   *         description: key rango-fechas-invalido
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    if (!(await this.assertAuthenticated(ctx))) return
    if (!(await this.assertHasPermission(ctx, 'read'))) return

    try {
      const payload = await request.validateUsing(getRepseCoverageReportValidator, {
        data: request.qs(),
      })
      const from = normalizeDate(payload.from)
      const to = normalizeDate(payload.to)
      if (this.validateDateRange(from, to, ctx)) return

      const service = new RepseCoverageReportService(i18n)
      const report = await service.getReport({
        from: from.iso,
        to: to.iso,
        companyId: payload.companyId,
        employeeId: payload.employeeId,
        page: payload.page ?? 1,
        perPage: payload.perPage ?? 20,
      })

      return response.status(200).json({
        type: 'success',
        title: i18n.t('resources', undefined, 'Recursos'),
        message: i18n.t(
          'resources_were_found_successfully',
          undefined,
          'Los recursos fueron encontrados correctamente'
        ),
        data: report,
      })
    } catch (error) {
      return this.validationOrUnhandledError(error, ctx, 500)
    }
  }

  /**
   * @swagger
   * /api/repse/coverage-report/export:
   *   get:
   *     summary: Exporta reporte de cobertura REPSE a Excel
   *     tags: [RepseCoverageReport]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         required: true
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         required: true
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: companyId
   *         schema: { type: integer }
   *       - in: query
   *         name: employeeId
   *         schema: { type: integer }
   *       - in: query
   *         name: format
   *         schema: { type: string, enum: [xlsx] }
   *     responses:
   *       '200':
   *         description: Archivo XLSX generado correctamente
   *       '401':
   *         description: No autenticado
   *       '403':
   *         description: Sin permiso read o gestion
   *       '422':
   *         description: key rango-fechas-invalido
   */
  async export(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    if (!(await this.assertAuthenticated(ctx))) return
    if (!(await this.assertHasPermission(ctx, 'read'))) return

    try {
      const payload = await request.validateUsing(getRepseCoverageReportExportValidator, {
        data: request.qs(),
      })
      const from = normalizeDate(payload.from)
      const to = normalizeDate(payload.to)
      if (this.validateDateRange(from, to, ctx)) return

      const service = new RepseCoverageReportService(i18n)
      const rows = await service.getExportRows({
        from: from.iso,
        to: to.iso,
        companyId: payload.companyId,
        employeeId: payload.employeeId,
      })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Reporte REPSE')
      worksheet.columns = [
        { header: 'Empleado', key: 'employeeName', width: 32 },
        { header: 'Código Empleado', key: 'employeeCode', width: 18 },
        { header: 'Empresa Contratante', key: 'companyName', width: 30 },
        { header: 'Días Laborados', key: 'diasLaborados', width: 14 },
        { header: 'Días Base', key: 'diasBase', width: 12 },
        { header: 'Días Prestados', key: 'diasPrestados', width: 14 },
        { header: 'Días Servidos', key: 'diasServidos', width: 14 },
        { header: '% Observado', key: 'porcentajeObservado', width: 12 },
        { header: '% Declarado', key: 'porcentajeDeclarado', width: 12 },
        { header: 'Diferencia', key: 'diferencia', width: 12 },
      ]

      for (const row of rows) {
        worksheet.addRow({
          ...row,
          porcentajeObservado: row.porcentajeObservado.toFixed(2),
          porcentajeDeclarado:
            row.porcentajeDeclarado === null ? null : row.porcentajeDeclarado.toFixed(2),
          diferencia: row.diferencia === null ? null : row.diferencia.toFixed(2),
        })
      }

      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      const buffer = await workbook.xlsx.writeBuffer()
      const filename = `repse-coverage-report_${from.iso}_${to.iso}.xlsx`

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header('Content-Disposition', `attachment; filename="${filename}"`)
      return response.send(buffer)
    } catch (error) {
      return this.validationOrUnhandledError(error, ctx, 500)
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (ctx.auth.user) return true

    ctx.response.status(401).json({
      type: 'error',
      title: ctx.i18n.t('unauthenticated', undefined, 'No autenticado'),
      message: ctx.i18n.t('unauthenticated', undefined, 'No autenticado'),
      data: null,
    })
    return false
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private validationOrUnhandledError(error: unknown, ctx: HttpContext, fallbackStatus: number) {
    if ((error as { code?: string })?.code === 'E_VALIDATION_ERROR') {
      return ctx.response.status(400).json({
        type: 'error',
        title: ctx.i18n.t('validation_error', undefined, 'Error de validación'),
        message:
          (error as { messages?: Array<{ message: string }> })?.messages?.[0]?.message ??
          ctx.i18n.t('invalid_data', undefined, 'Datos inválidos'),
        key: 'query-invalida',
        data: {
          errors: (error as { messages?: unknown })?.messages ?? null,
        },
      })
    }

    return ctx.response.status(fallbackStatus).json({
      type: 'error',
      title: ctx.i18n.t('server_error', undefined, 'Error del servidor'),
      message: ctx.i18n.t(
        'an_unexpected_error_has_occurred_on_the_server',
        undefined,
        'Ocurrió un error inesperado en el servidor'
      ),
      data: null,
    })
  }

  private validateDateRange(
    from: { iso: string; epochMs: number; isValid: boolean },
    to: { iso: string; epochMs: number; isValid: boolean },
    ctx: HttpContext
  ) {
    if (!from.isValid || !to.isValid) {
      ctx.response.status(400).json({
        type: 'error',
        title: ctx.i18n.t('validation_error', undefined, 'Error de validación'),
        message: ctx.i18n.t('invalid_data', undefined, 'Datos inválidos'),
        key: 'query-invalida',
        data: null,
      })
      return true
    }

    if (from.epochMs > to.epochMs) {
      ctx.response.status(422).json({
        type: 'error',
        title: ctx.i18n.t('validation_error', undefined, 'Error de validación'),
        message: ctx.i18n.t(
          'attendance_stats_invalid_range',
          undefined,
          'El rango de fechas es inválido.'
        ),
        key: 'rango-fechas-invalido',
        data: null,
      })
      return true
    }

    const fromDate = DateTime.fromISO(from.iso)
    const toDate = DateTime.fromISO(to.iso)
    if (!fromDate.isValid || !toDate.isValid) return null

    const rangeDays = Math.floor(toDate.diff(fromDate, 'days').days) + 1
    if (rangeDays > MAX_REPORT_RANGE_DAYS) {
      ctx.response.status(422).json({
        type: 'error',
        title: ctx.i18n.t('validation_error', undefined, 'Error de validación'),
        message: ctx.i18n.t(
          'repse_coverage_report_range_too_large',
          undefined,
          `El rango no puede ser mayor a ${MAX_REPORT_RANGE_DAYS} días.`
        ),
        key: 'rango-maximo-excedido',
        data: {
          maxDays: MAX_REPORT_RANGE_DAYS,
        },
      })
      return true
    }

    return false
  }
}

function normalizeDate(value: string | Date): { iso: string; epochMs: number; isValid: boolean } {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: 'UTC' })
      : DateTime.fromISO(String(value), { zone: 'UTC' })

  const safe = dt.isValid ? dt.startOf('day') : DateTime.invalid('invalid-date')
  return {
    iso: safe.isValid ? safe.toFormat('yyyy-MM-dd') : String(value).slice(0, 10),
    epochMs: safe.isValid ? safe.toMillis() : Number.NaN,
    isValid: safe.isValid,
  }
}

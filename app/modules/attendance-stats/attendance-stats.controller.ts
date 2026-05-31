import { HttpContext } from '@adonisjs/core/http'
import AttendanceStatsService from './attendance-stats.service.js'
import { getAttendanceStatsValidator } from './validators/get-attendance-stats.validator.js'
import type { AttendanceStatsFilters, ResolvedScope } from './dto/attendance-stats.dto.js'

/**
 * Controller del módulo attendance-stats.
 *
 * Expone 3 endpoints de agregación de asistencias para reemplazar el patrón
 * actual de N requests al calendar individual desde el frontend.
 */
export default class AttendanceStatsController {

  /**
   * @swagger
   * /api/v1/attendance-stats/overview:
   *   get:
   *     summary: Estadísticas agregadas globales del período
   *     description: |
   *       Devuelve contadores y porcentajes (ontime, tolerance, delay, fault, early-out) agregados sobre todos los empleados del scope del usuario, filtrados opcionalmente por departamento/empleado/unidad de negocio/sucursal.
   *
   *       Incluye además `daily`: un arreglo con las mismas estadísticas desglosadas por cada día del rango `[startDay, endDay]` inclusive, ordenado ascendente. Los días sin registros evaluables aparecen con `totalAvailable: 0`.
   *
   *       **Huso horario**: `startDay`/`endDay` se interpretan como días laborales en huso México (UTC-6). El servidor no acepta `Timezone` header; el cliente es responsable de enviar la fecha mexicana correcta (no la fecha local del cliente si está fuera de México).
   *     security:
   *       - bearerAuth: []
   *     tags: [AttendanceStats]
   *     parameters:
   *       - name: startDay
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2026-05-11" }
   *       - name: endDay
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2026-05-17" }
   *       - name: departmentIds
   *         in: query
   *         schema: { type: string, example: "1,2,3" }
   *       - name: employeeIds
   *         in: query
   *         schema: { type: string, example: "10,11,12" }
   *       - name: businessUnitId
   *         in: query
   *         schema: { type: integer }
   *       - name: payrollBusinessUnitId
   *         in: query
   *         schema: { type: integer }
   *       - name: branchOfficeIds
   *         in: query
   *         schema: { type: string, example: "5,7" }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Validation error }
   *       401: { description: Unauthenticated }
   *       403: { description: Scope insuficiente }
   *       500: { description: Server error }
   */
  async overview(ctx: HttpContext) {
    return this.handle(ctx, 'overview')
  }

  /**
   * @swagger
   * /api/v1/attendance-stats/by-department:
   *   get:
   *     summary: Estadísticas agregadas por departamento
   *     description: |
   *       Array con un objeto por departamento (clean counters + informational + porcentajes).
   *
   *       **Huso horario**: `startDay`/`endDay` se interpretan como días laborales en huso México (UTC-6). El servidor no acepta `Timezone` header.
   *     security: [{ bearerAuth: [] }]
   *     tags: [AttendanceStats]
   *     parameters:
   *       - { name: startDay, in: query, required: true, schema: { type: string } }
   *       - { name: endDay, in: query, required: true, schema: { type: string } }
   *       - { name: departmentIds, in: query, schema: { type: string } }
   *       - { name: employeeIds, in: query, schema: { type: string } }
   *       - { name: businessUnitId, in: query, schema: { type: integer } }
   *       - { name: payrollBusinessUnitId, in: query, schema: { type: integer } }
   *       - { name: branchOfficeIds, in: query, schema: { type: string } }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Validation error }
   *       401: { description: Unauthenticated }
   *       403: { description: Scope insuficiente }
   *       500: { description: Server error }
   */
  async byDepartment(ctx: HttpContext) {
    return this.handle(ctx, 'byDepartment')
  }

  /**
   * @swagger
   * /api/v1/attendance-stats/by-employee:
   *   get:
   *     summary: Estadísticas agregadas por empleado (sin calendario detallado)
   *     description: |
   *       Array con un objeto por empleado (clean counters + informational + porcentajes). No incluye el calendar individual — para detalle día por día usar /api/v1/employee-assist-calendars.
   *
   *       **Huso horario**: `startDay`/`endDay` se interpretan como días laborales en huso México (UTC-6). El servidor no acepta `Timezone` header.
   *     security: [{ bearerAuth: [] }]
   *     tags: [AttendanceStats]
   *     parameters:
   *       - { name: startDay, in: query, required: true, schema: { type: string } }
   *       - { name: endDay, in: query, required: true, schema: { type: string } }
   *       - { name: departmentIds, in: query, schema: { type: string } }
   *       - { name: employeeIds, in: query, schema: { type: string } }
   *       - { name: businessUnitId, in: query, schema: { type: integer } }
   *       - { name: payrollBusinessUnitId, in: query, schema: { type: integer } }
   *       - { name: branchOfficeIds, in: query, schema: { type: string } }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Validation error }
   *       401: { description: Unauthenticated }
   *       403: { description: Scope insuficiente }
   *       500: { description: Server error }
   */
  async byEmployee(ctx: HttpContext) {
    return this.handle(ctx, 'byEmployee')
  }

  /**
   * Handler genérico — orquesta parseo, validación, scope y delega al service.
   * Centraliza el flujo para que los 3 endpoints comparten exactamente el
   * mismo comportamiento de errores (400 / 401 / 403 / 500).
   */
  private async handle(
    ctx: HttpContext,
    op: 'overview' | 'byDepartment' | 'byEmployee'
  ) {
    const { request, response, i18n, businessUnitScope } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const raw = {
        startDay: request.input('startDay'),
        endDay: request.input('endDay'),
        departmentIds: this.parseIdList(request.input('departmentIds')),
        employeeIds: this.parseIdList(request.input('employeeIds')),
        businessUnitId: this.parseId(request.input('businessUnitId')),
        payrollBusinessUnitId: this.parseId(request.input('payrollBusinessUnitId')),
        branchOfficeIds: this.parseIdList(
          request.input('branchOfficeIds') ?? request.input('branchNameIds')
        ),
      }

      let validated
      try {
        validated = await getAttendanceStatsValidator.validate(raw)
      } catch (e: unknown) {
        const messages = (e as { messages?: unknown })?.messages
        return response.status(400).json({
          type: 'error',
          title: t('validation_error'),
          message: t('attendance_stats_invalid_input'),
          key: 'entrada-invalida',
          details: messages,
        })
      }

      const filters: AttendanceStatsFilters = validated

      const service = new AttendanceStatsService(i18n)

      const rangeError = service.validateRange(filters)
      if (rangeError) {
        return response.status(rangeError.status).json({
          type: rangeError.type,
          title: rangeError.title,
          message: rangeError.message,
          key: rangeError.key,
        })
      }

      const scope: ResolvedScope = { allowedBusinessUnitIds: businessUnitScope }

      let result
      if (op === 'overview') result = await service.getOverview(filters, scope)
      else if (op === 'byDepartment') result = await service.getByDepartment(filters, scope)
      else result = await service.getByEmployee(filters, scope)

      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        key: result.key,
        data: result.data,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return response.status(500).json({
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: message,
      })
    }
  }

  private parseId(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  private parseIdList(value: unknown): number[] | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const list = Array.isArray(value)
      ? value
      : String(value).split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    const ids = list
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0)
    return ids.length > 0 ? ids : undefined
  }
}

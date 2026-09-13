import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import RoleService from '#services/role_service'
import AttendanceStatsService from './attendance-stats.service.js'
import { getAttendanceStatsValidator } from './validators/get-attendance-stats.validator.js'
import { getAttendanceCoverageValidator } from './validators/get-attendance-coverage.validator.js'
import type { AttendanceStatsFilters, ResolvedScope } from './dto/attendance-stats.dto.js'

/** Módulo y permiso que exige el drawer de cobertura (sembrados en el catálogo). */
const ATTENDANCE_MONITOR_MODULE_SLUG = 'employees-attendance-monitor'
const SHIFT_COVERAGE_PERMISSION_SLUG = 'shift-coverage'

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
   *       **Serie mensual** (modo anual del monitor): con `granularity=month` agrega `monthly`, un arreglo `{ month: 'yyyy-MM', statistics }` con una entrada por cada mes calendario entre `startDay` y `endDay` inclusive, ordenado ascendente. Cada mes suma los contadores de sus días con el mismo cierre al 100% que `statistics`; `employeesQty` cuenta los empleados con al menos un día evaluable en ese mes. Los meses sin registros aparecen en cero. Con `granularity=day` o sin el parámetro la respuesta no trae `monthly`; `statistics` y `daily` no cambian en ningún caso.
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
   *       - name: granularity
   *         in: query
   *         required: false
   *         description: Serie adicional. `day` (default) solo trae `daily`; `month` agrega `monthly`.
   *         schema: { type: string, enum: [day, month], default: day }
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
   * @swagger
   * /api/v1/attendance-stats/coverage:
   *   get:
   *     summary: Cobertura de plantilla por sitio y turno
   *     description: |
   *       Compara presentes contra cuota por sitio de servicio y turno del día.
   *       Requiere día único (startDay igual a endDay) y empresaContratanteId.
   *
   *       Exige el permiso `shift-coverage` del módulo `employees-attendance-monitor`
   *       (root y owner pasan). Los conteos del semáforo son de la plantilla completa
   *       del sitio; los candidatos solo incluyen colaboradores visibles para el usuario
   *       con la regla del listado de empleados.
   *
   *       No acepta `companyId`: el middleware de alcance lo trata como alias legacy de
   *       unidad de negocio.
   *     security:
   *       - bearerAuth: []
   *     tags: [AttendanceStats]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Código público (UUID v4) de la unidad de negocio activa.
   *         schema: { type: string, format: uuid }
   *       - name: startDay
   *         in: query
   *         required: true
   *         schema: { type: string, format: date, example: "2026-06-14" }
   *       - name: endDay
   *         in: query
   *         required: true
   *         schema: { type: string, format: date, example: "2026-06-14" }
   *       - name: empresaContratanteId
   *         in: query
   *         required: true
   *         description: ID de la empresa contratante cuyos sitios de servicio se evalúan.
   *         schema: { type: integer, minimum: 1, example: 1 }
   *       - name: branchOfficeIds
   *         in: query
   *         schema: { type: string, example: "1,2" }
   *       - name: employeeIds
   *         in: query
   *         schema: { type: string, example: "1,2" }
   *       - name: businessUnitId
   *         in: query
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Cobertura calculada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceCoverageSuccess'
   *       '400':
   *         description: Entrada inválida o día único requerido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceCoverageApiError'
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceCoverageApiError'
   *       '403':
   *         description: Sin permiso shift-coverage (key sin-permiso, cuerpo title/detail/key) o scope insuficiente (key scope-insuficiente)
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - $ref: '#/components/schemas/AttendanceCoverageApiError'
   *                 - type: object
   *                   required: [title, detail, key]
   *                   properties:
   *                     title: { type: string }
   *                     detail: { type: string }
   *                     key: { type: string, enum: [sin-permiso] }
   *             example:
   *               title: Sin permiso
   *               detail: No tienes permiso para consultar la cobertura de plantilla.
   *               key: sin-permiso
   *       '404':
   *         description: Empresa contratante no encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceCoverageApiError'
   *       '500':
   *         description: Error interno del servidor
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceCoverageApiError'
   */
  async coverage(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope, auth } = ctx
    const t = i18n.formatMessage.bind(i18n)

    try {
      // Antes de validar: sin permiso no se revela qué parámetros espera.
      const user = auth.getUserOrFail()
      const canSeeCoverage = await new RoleService().hasAccess(
        user.roleId,
        ATTENDANCE_MONITOR_MODULE_SLUG,
        SHIFT_COVERAGE_PERMISSION_SLUG
      )
      if (!canSeeCoverage) {
        return response.status(403).json({
          title: t('attendance_stats_coverage_forbidden_title'),
          detail: t('attendance_stats_coverage_forbidden_detail'),
          key: 'sin-permiso',
        })
      }

      const raw = {
        startDay: request.input('startDay'),
        endDay: request.input('endDay'),
        empresaContratanteId: this.parseId(request.input('empresaContratanteId')),
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
        validated = await getAttendanceCoverageValidator.validate(raw)
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

      const filters = validated
      const service = new AttendanceStatsService(i18n)
      const scope: ResolvedScope = { allowedBusinessUnitIds: businessUnitScope }
      const result = await service.getCoverage(filters, scope, user.userId)

      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        key: result.key,
        data: result.data,
      })
    } catch (error: unknown) {
      // El detalle va al log, nunca a la respuesta: puede traer SQL o rutas internas.
      logger.error({ err: error }, 'attendance-stats: error inesperado al calcular la cobertura')
      return response.status(500).json({
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
      })
    }
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
        granularity: request.input('granularity'),
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
      logger.error({ err: error, op }, 'attendance-stats: error inesperado al calcular estadísticas')
      return response.status(500).json({
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
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

import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import AttendanceStatsService from './attendance-stats.service.js'
import { getAttendanceStatsValidator } from './validators/get-attendance-stats.validator.js'
import {
  getAttendanceAbsencesValidator,
  splitBranchOfficeIdsQuery,
} from './validators/get-attendance-absences.validator.js'
import type {
  AbsencesFilters,
  AttendanceStatsFilters,
  ResolvedScope,
} from './dto/attendance-stats.dto.js'

/**
 * Controller del módulo attendance-stats.
 *
 * Expone los endpoints de agregación de asistencias que reemplazan el patrón
 * de N requests al calendar individual desde el frontend.
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
   *       **Serie mensual** (modo anual del monitor): con `granularity=month` agrega `monthly`, un arreglo `{ month: 'yyyy-MM', statistics }` con una entrada por cada mes calendario entre `startDay` y `endDay` inclusive, ordenado ascendente. Cada mes suma los contadores de sus días con el mismo cierre al 100% que `statistics`; `employeesQty` cuenta los empleados con al menos un día evaluable en ese mes. Los meses sin registros aparecen en cero. Con `granularity=day`, vacío (`granularity=`) o sin el parámetro la respuesta no trae `monthly`; `statistics` y `daily` no cambian en ningún caso.
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
   *         description: Serie adicional. `day` (default) solo trae `daily`; `month` agrega `monthly`. Vacío equivale a omitirlo; cualquier otro valor responde 400. Solo aplica a overview.
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
   * /api/v1/attendance-stats/absences:
   *   get:
   *     summary: Ausencias por día con sucursal efectiva y empresa contratante
   *     description: |
   *       Motor único del drawer de Ausencias del monitor: quién faltó cada día del periodo
   *       `[startDay, endDay]` inclusive (máximo 62 días) y en qué sucursal efectiva. El cliente agrupa
   *       las mismas entradas en Organigrama (por departamento), Sucursales (sucursal sin empresa
   *       contratante o sin sucursal) y Clientes REPSE (sucursal con empresa contratante).
   *
   *       Un colaborador faltó el día D cuando D es evaluable (no es futuro, descanso, vacaciones,
   *       festivo, incapacidad ni excepción no general) y el día cuenta exactamente una falta. La
   *       sucursal efectiva es el destino del préstamo temporal vigente ese día (no borrado, sin
   *       cancelar a esa fecha, origen y destino del tenant; con varios gana el de inicio más reciente
   *       y, empatando, el de id mayor) o, sin préstamo, la sucursal base activa HOY (con varias, la de
   *       id menor); `null` si no tiene ninguna. Para periodos pasados no se reconstruye la asignación
   *       histórica.
   *
   *       Universo: la plantilla del tenant (no borrados, sin discriminador de asistencia). Con
   *       `branchOfficeIds`, solo quien tiene base activa en esas sucursales o un préstamo hacia ellas
   *       en el periodo; sus faltas salen con la sucursal efectiva de cada día aunque sea otra.
   *
   *       Sin permiso propio (paridad con el drawer): nunca responde 403 por permiso. Días, empleados
   *       y sucursales solo incluyen colaboradores que el usuario puede ver con la regla del listado
   *       de empleados.
   *
   *       `days` trae todos los días del periodo (con `entries` vacío si nadie faltó); `entries` va
   *       ordenado por nombre completo y, empatando, por id. `employees` lista una vez a cada
   *       colaborador de `days`, con alias de puesto y departamento cuando existe. `branches` solo
   *       trae las sucursales referenciadas; la empresa contratante solo si está viva y es del tenant.
   *
   *       La empresa contratante exige además el permiso `shift-coverage` del módulo
   *       `employees-attendance-monitor` (root y owner pasan). Sin él, `empresaContratanteId` y
   *       `empresaContratanteName` van en `null` en todas las sucursales, con la misma forma de `data`.
   *
   *       Los errores traen `title`, `detail` y `key`.
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
   *         schema: { type: string, format: date, example: "2026-09-01" }
   *       - name: endDay
   *         in: query
   *         required: true
   *         schema: { type: string, format: date, example: "2026-09-15" }
   *       - name: branchOfficeIds
   *         in: query
   *         description: CSV de IDs de sucursales que acotan el universo. Cada pieza debe ser un entero decimal sin signo ni ceros a la izquierda (1 a Number.MAX_SAFE_INTEGER); notaciones como 0x10, 1e3 o 5.0 responden 400 entrada-invalida con details, nunca se ignoran.
   *         schema: { type: string, example: "5,7" }
   *       - name: payrollBusinessUnitId
   *         in: query
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Ausencias calculadas correctamente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AttendanceAbsencesSuccess'
   *       '400':
   *         description: Entrada inválida (entrada-invalida, con details por campo; incluye fecha inexistente y branchOfficeIds inválido), rango inválido (rango-invalido) o de más de 62 días (rango-maximo-excedido)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *       '401':
   *         description: No autenticado
   *       '403':
   *         description: Scope insuficiente (scope-insuficiente)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   *       '500':
   *         description: Error interno del servidor
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ApiError'
   */
  async absences(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope, auth } = ctx
    const t = i18n.formatMessage.bind(i18n)

    try {
      const user = auth.getUserOrFail()
      const raw = {
        startDay: request.input('startDay'),
        endDay: request.input('endDay'),
        // Sin parseIdList: un id inválido responde 400 en vez de quitar el filtro de sucursales.
        branchOfficeIds: splitBranchOfficeIdsQuery(request.input('branchOfficeIds')),
        payrollBusinessUnitId: this.parseId(request.input('payrollBusinessUnitId')),
      }

      let filters: AbsencesFilters
      try {
        filters = await getAttendanceAbsencesValidator.validate(raw)
      } catch (e: unknown) {
        const messages = (e as { messages?: unknown })?.messages
        return response.status(400).json({
          type: 'error',
          title: t('validation_error'),
          message: t('attendance_stats_invalid_input'),
          detail: t('attendance_stats_invalid_input'),
          key: 'entrada-invalida',
          details: messages,
        })
      }

      const service = new AttendanceStatsService(i18n)
      const scope: ResolvedScope = { allowedBusinessUnitIds: businessUnitScope }
      const result = await service.getAbsences(filters, scope, {
        userId: user.userId,
        roleId: user.roleId,
      })
      const isError = result.status >= 400

      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        // Los errores de este endpoint llevan title/detail/key; message se conserva por el envoltorio del módulo.
        ...(isError ? { detail: result.message } : {}),
        key: result.key,
        data: result.data,
      })
    } catch (error: unknown) {
      // El detalle va al log, nunca a la respuesta: puede traer SQL o rutas internas.
      logger.error({ err: error }, 'attendance-stats: error inesperado al calcular las ausencias por día')
      return response.status(500).json({
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        detail: t('an_unexpected_error_has_occurred_on_the_server'),
        key: 'error-inesperado',
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
        // Solo overview lee granularity; en los otros dos se ignora. El vacío equivale a omitirlo.
        ...(op === 'overview' ? { granularity: request.input('granularity') || undefined } : {}),
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

import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import EmployeeLactationPeriodService, {
  type EmployeeLactationPeriodCreatePayload,
  type EmployeeLactationPeriodUpdatePayload,
} from '#services/employee_lactation_period_service'
import {
  createEmployeeLactationPeriodValidator,
  employeeLactationPeriodListValidator,
  updateEmployeeLactationPeriodValidator,
} from '#validators/employee_lactation_period'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'
import { resolveEmployeeLactationPeriodApiError } from '../helpers/employee_lactation_period_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

/**
 * Esta funcionalidad NO tiene módulo propio en `system_modules`: vive
 * embebida en el apartado de "Información del empleado". Por eso los
 * checks de RBAC se hacen contra el módulo `employees`:
 *  - listar / consultar  → permiso `read`.
 *  - crear / editar / eliminar → permiso `update-information`
 *    (mismo permiso que usa medical conditions y otras secciones del perfil).
 */
const PARENT_MODULE_SLUG = 'employees'
const ACTION_PERMISSION_MAP: Record<'read' | 'create' | 'update' | 'delete', string> = {
  read: 'read',
  create: 'update-information',
  update: 'update-information',
  delete: 'update-information',
}

/**
 * Controlador REST del catálogo de periodos de lactancia (NOM-037-STPS-2023 / LFT 170).
 *
 * Expone CRUD completo bajo /api/employee-lactation-periods.
 * Aísla por empresa (vía `EmployeeLactationPeriodService`) y aplica
 * permisos del módulo `employees` a través de `RoleService` (root bypass).
 */
export default class EmployeeLactationPeriodsController {
  /**
   * @swagger
   * /api/employee-lactation-periods:
   *   get:
   *     summary: Lista paginada de periodos de lactancia (filtrada por empresa)
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         required: true
   *         schema: { type: integer, minimum: 1, maximum: 500 }
   *       - in: query
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado paginado ordenado por start_date DESC }
   *       '400': { description: Validación inválida (page/limit/employeeId) }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo }
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(employeeLactationPeriodListValidator)
      const service = new EmployeeLactationPeriodService()
      const bundle = await service.listPaginated(
        filters.page,
        filters.limit,
        filters.employeeId
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        'Employee Lactation Periods',
        'Periodos de lactancia obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods:
   *   post:
   *     summary: Crear periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - employeeId
   *               - employeeLactationPeriodStartDate
   *               - employeeLactationPeriodEndDate
   *               - employeeLactationPeriodType
   *             properties:
   *               employeeId: { type: integer }
   *               employeeLactationPeriodStartDate: { type: string, format: date }
   *               employeeLactationPeriodEndDate: { type: string, format: date }
   *               employeeLactationPeriodType:
   *                 type: string
   *                 enum: [two_rest_periods, reduced_hour]
   *               employeeLactationPeriodReductionApplication:
   *                 type: string
   *                 enum: [start, end, split]
   *               employeeLactationPeriodNotes:
   *                 type: string
   *                 nullable: true
   *                 maxLength: 500
   *     responses:
   *       '201': { description: Creado }
   *       '400': { description: Validación VineJS o end <= start }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'create' }
   *       '404': { description: Empleada inexistente o ajena a la empresa }
   *       '409':
   *         description: Traslape contra otro periodo activo (key `lactation-period-overlap`)
   *       '422':
   *         description: |
   *           Rango inválido contra los extremos legales/operativos.
   *           Posibles `key`:
   *           - `lactation-period-below-legal-minimum` (rango < 6 meses, LFT 170 IV)
   *           - `lactation-period-unreasonable-range` (rango > 24 meses, sanity check)
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createEmployeeLactationPeriodValidator)
      const payload = this.toCreatePayload(body)
      const service = new EmployeeLactationPeriodService()
      const created = await service.create(payload)

      return StandardResponseFormatter.success(
        response,
        created,
        'Employee Lactation Period',
        'Periodo de lactancia creado correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}:
   *   put:
   *     summary: Actualizar periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId: { type: integer }
   *               employeeLactationPeriodStartDate: { type: string, format: date }
   *               employeeLactationPeriodEndDate: { type: string, format: date }
   *               employeeLactationPeriodType:
   *                 type: string
   *                 enum: [two_rest_periods, reduced_hour]
   *               employeeLactationPeriodReductionApplication:
   *                 type: string
   *                 enum: [start, end, split]
   *               employeeLactationPeriodNotes:
   *                 type: string
   *                 nullable: true
   *                 maxLength: 500
   *     responses:
   *       '200': { description: Actualizado }
   *       '400': { description: Validación VineJS o coherencia de fechas }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update' }
   *       '404': { description: Recurso ajeno o inexistente }
   *       '409':
   *         description: Traslape contra otro periodo activo (key `lactation-period-overlap`)
   *       '422':
   *         description: |
   *           Rango inválido contra los extremos legales/operativos.
   *           Posibles `key`:
   *           - `lactation-period-below-legal-minimum` (rango < 6 meses, LFT 170 IV)
   *           - `lactation-period-unreasonable-range` (rango > 24 meses, sanity check)
   */
  async update(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateEmployeeLactationPeriodValidator)
      const payload = this.toUpdatePayload(body)

      const service = new EmployeeLactationPeriodService()
      const updated = await service.update(id, payload)

      return StandardResponseFormatter.success(
        response,
        updated,
        'Employee Lactation Period',
        'Periodo de lactancia actualizado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}:
   *   delete:
   *     summary: Soft delete del periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Borrado lógico aplicado }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'delete' }
   *       '404': { description: Recurso ajeno o inexistente }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseResourceId(params.id)
      const service = new EmployeeLactationPeriodService()
      const deleted = await service.destroy(id)

      return StandardResponseFormatter.success(
        response,
        deleted,
        'Employee Lactation Period',
        'Periodo de lactancia eliminado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Devuelve `true` si el usuario está autenticado; en caso contrario emite 401. */
  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: 'No autorizado',
        message: 'Usuario no autenticado',
        errorCode: ELP_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  /**
   * Permite la operación si el usuario es root del tenant; de otro modo
   * verifica el permiso solicitado en el módulo. 403 si no aplica.
   */
  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'update' | 'delete'
  ) {
    const user = ctx.auth.user!
    await user.preload('role')
    const isRoot = user.role?.roleSlug === 'root'
    if (isRoot) {
      return true
    }
    const roleService = new RoleService()
    const permissionSlug = ACTION_PERMISSION_MAP[action]
    const allowed = await roleService.hasAccess(
      user.roleId,
      PARENT_MODULE_SLUG,
      permissionSlug
    )
    if (!allowed) {
      ctx.response.status(403).json({
        type: 'error',
        title: 'Sin permiso',
        message: 'No tienes permiso para esta operación sobre periodos de lactancia.',
        key: 'sin-permiso',
        errorCode: ELP_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new EmployeeLactationPeriodError(
        'El identificador del periodo es inválido.',
        ELP_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): EmployeeLactationPeriodCreatePayload {
    return {
      employeeId: Number(body.employeeId),
      employeeLactationPeriodStartDate: this.dateLikeToIso(
        body.employeeLactationPeriodStartDate
      ),
      employeeLactationPeriodEndDate: this.dateLikeToIso(
        body.employeeLactationPeriodEndDate
      ),
      employeeLactationPeriodType:
        body.employeeLactationPeriodType as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodType'],
      employeeLactationPeriodReductionApplication:
        body.employeeLactationPeriodReductionApplication as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodReductionApplication'],
      employeeLactationPeriodNotes:
        body.employeeLactationPeriodNotes === undefined
          ? null
          : (body.employeeLactationPeriodNotes as string | null),
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): EmployeeLactationPeriodUpdatePayload {
    const payload: EmployeeLactationPeriodUpdatePayload = {}
    if (body.employeeId !== undefined) {
      payload.employeeId = Number(body.employeeId)
    }
    if (body.employeeLactationPeriodStartDate !== undefined) {
      payload.employeeLactationPeriodStartDate = this.dateLikeToIso(
        body.employeeLactationPeriodStartDate
      )
    }
    if (body.employeeLactationPeriodEndDate !== undefined) {
      payload.employeeLactationPeriodEndDate = this.dateLikeToIso(
        body.employeeLactationPeriodEndDate
      )
    }
    if (body.employeeLactationPeriodType !== undefined) {
      payload.employeeLactationPeriodType =
        body.employeeLactationPeriodType as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodType']
    }
    if (body.employeeLactationPeriodReductionApplication !== undefined) {
      payload.employeeLactationPeriodReductionApplication =
        body.employeeLactationPeriodReductionApplication as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodReductionApplication']
    }
    if (body.employeeLactationPeriodNotes !== undefined) {
      payload.employeeLactationPeriodNotes = body.employeeLactationPeriodNotes as
        | string
        | null
    }
    return payload
  }

  /**
   * Vine convierte `vine.date()` a un `Date` JS. Aquí lo normalizamos al
   * formato ISO YYYY-MM-DD que consume el servicio.
   */
  private dateLikeToIso(value: unknown): string {
    if (value instanceof Date) {
      const iso = value.toISOString()
      return iso.substring(0, 10)
    }
    return String(value)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number
  ) {
    const resolved = resolveEmployeeLactationPeriodApiError(error, fallback)
    if (resolved.key) {
      const titleByCode: Partial<Record<string, string>> = {
        [ELP_ERROR_CODES.PERIOD_OVERLAP]: 'Periodo de lactancia traslapado',
        [ELP_ERROR_CODES.RANGE_UNREASONABLE]: 'Rango de lactancia inverosímil',
        [ELP_ERROR_CODES.RANGE_BELOW_LEGAL_MINIMUM]:
          'Periodo de lactancia por debajo del mínimo legal',
      }
      return response.status(resolved.status).json({
        type: 'error',
        title: titleByCode[resolved.errorCode] ?? 'Error',
        key: resolved.key,
        detail: resolved.message,
        message: resolved.message,
        errorCode: resolved.errorCode,
        data: null,
      })
    }
    return StandardResponseFormatter.error(
      response,
      resolved.message,
      resolved.status,
      resolved.errorCode
    )
  }
}

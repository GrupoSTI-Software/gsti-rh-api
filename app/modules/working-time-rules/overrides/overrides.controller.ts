import { HttpContext } from '@adonisjs/core/http'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'
import type { WorkingTimeRuleErrorKey } from '#exceptions/working_time_rule_error'
import OverridesService from './overrides.service.js'
import { createOverrideValidator } from './validators/create_override.validator.js'
import { updateOverrideValidator } from './validators/update_override.validator.js'
import type { CreateOverrideInput } from './dto/override.dto.js'

/** Mapea cada key de error de dominio a su código HTTP. */
const ERROR_STATUS: Record<WorkingTimeRuleErrorKey, number> = {
  'vigencia-solapada': 409,
  'override-excede-federal': 422,
  'valor-fuera-de-rango': 422,
  'valores-invalidos': 422,
}

/**
 * Controller del submódulo de overrides de jornada por empresa.
 *
 * Seguridad: cada operación valida que la empresa objetivo esté dentro del
 * `businessUnitScope` del usuario (anti-IDOR). Requiere middleware.auth() +
 * middleware.businessScope() en la ruta.
 */
export default class OverridesController {
  /**
   * @swagger
   * /api/v1/working-time-rules/overrides:
   *   get:
   *     summary: Lista los overrides de jornada de una empresa
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleOverrides]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Empresa (tenant) activa. Define la unidad de negocio del listado.
   *         schema: { type: integer }
   *     responses:
   *       200: { description: OK }
   *       400: { description: Header X-Business-Unit-Id faltante o inválido }
   *       403: { description: Sin permiso sobre la empresa }
   */
  async index(ctx: HttpContext) {
    const { response } = ctx

    // La empresa proviene del header X-Business-Unit-Id, resuelto por el middleware
    // de scope. No se acepta por query: el header es la única fuente de verdad.
    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    const service = new OverridesService()
    const data = await service.list(businessUnitId)
    return response.status(200).json({
      type: 'success',
      title: 'Overrides de jornada',
      message: 'Overrides encontrados correctamente.',
      data,
    })
  }

  /**
   * @swagger
   * /api/v1/working-time-rules/overrides:
   *   post:
   *     summary: Crea un override de jornada para una empresa
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleOverrides]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Empresa (tenant) activa. Define la unidad de negocio del override.
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [effectiveYear, validFrom, maxWeeklyHours, maxWeeklyOvertimeHours, maxDailyOvertimeHours, maxOvertimeDaysPerWeek, dailyHoursDay, dailyHoursNight, dailyHoursMixed, workDaysPerRestDay, exceedsFederalAck]
   *             properties:
   *               effectiveYear: { type: integer }
   *               validFrom: { type: string, example: "2027-01-01" }
   *               validTo: { type: string, nullable: true, example: "2027-12-31" }
   *               maxWeeklyHours: { type: number }
   *               maxWeeklyOvertimeHours: { type: number }
   *               maxDailyOvertimeHours: { type: number }
   *               maxOvertimeDaysPerWeek: { type: number }
   *               dailyHoursDay: { type: number }
   *               dailyHoursNight: { type: number }
   *               dailyHoursMixed: { type: number }
   *               workDaysPerRestDay: { type: number }
   *               exceedsFederalAck: { type: boolean }
   *               overrideJustification: { type: string, nullable: true }
   *     responses:
   *       201: { description: Override creado }
   *       403: { description: Sin permiso sobre la empresa }
   *       409: { description: Vigencia solapada }
   *       422: { description: Validación / excede federal / fuera de rango }
   */
  async store(ctx: HttpContext) {
    const { request, response, auth } = ctx

    let payload
    try {
      payload = await createOverrideValidator.validate(request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    if (payload.exceedsFederalAck === true && !payload.overrideJustification) {
      return this.justificationRequired(ctx)
    }

    // La empresa proviene del header X-Business-Unit-Id, resuelto por el middleware
    // de scope. No se acepta por body: el header es la única fuente de verdad.
    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    const input: CreateOverrideInput = {
      ...payload,
      businessUnitId,
      validTo: payload.validTo ?? null,
      overrideJustification: payload.overrideJustification ?? null,
    }

    try {
      const service = new OverridesService()
      const created = await service.create(input, auth.user!.userId)
      return response.status(201).json({
        type: 'success',
        title: 'Override de jornada',
        message: 'Override creado correctamente.',
        data: created,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/v1/working-time-rules/overrides/{id}:
   *   patch:
   *     summary: Actualiza parcialmente un override de jornada
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleOverrides]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Empresa (tenant) activa. Debe coincidir con la del override.
   *         schema: { type: integer }
   *       - name: id
   *         in: path
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Override actualizado }
   *       403: { description: Sin permiso sobre la empresa }
   *       404: { description: Override no encontrado }
   *       409: { description: Vigencia solapada }
   *       422: { description: Validación / excede federal / fuera de rango }
   */
  async update(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const id = Number(request.param('id'))

    const service = new OverridesService()
    const existing = await service.findById(id)
    if (!existing?.businessUnitId) {
      return this.notFound(ctx)
    }

    if (!this.canAccess(ctx, existing.businessUnitId)) {
      return this.forbidden(ctx)
    }

    let payload
    try {
      payload = await updateOverrideValidator.validate(request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    if (
      payload.exceedsFederalAck === true &&
      !payload.overrideJustification &&
      !existing.workingTimeRuleOverrideJustification
    ) {
      return this.justificationRequired(ctx)
    }

    try {
      const updated = await service.update(existing, payload, auth.user!.userId)
      return response.status(200).json({
        type: 'success',
        title: 'Override de jornada',
        message: 'Override actualizado correctamente.',
        data: updated,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/v1/working-time-rules/overrides/{id}:
   *   delete:
   *     summary: Elimina un override de jornada
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleOverrides]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Empresa (tenant) activa. Debe coincidir con la del override.
   *         schema: { type: integer }
   *       - name: id
   *         in: path
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Override eliminado }
   *       403: { description: Sin permiso sobre la empresa }
   *       404: { description: Override no encontrado }
   */
  async destroy(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.param('id'))

    const service = new OverridesService()
    const existing = await service.findById(id)
    if (!existing?.businessUnitId) {
      return this.notFound(ctx)
    }

    if (!this.canAccess(ctx, existing.businessUnitId)) {
      return this.forbidden(ctx)
    }

    try {
      await service.delete(existing)
      return response.status(200).json({
        type: 'success',
        title: 'Override de jornada',
        message: 'Override eliminado correctamente.',
        data: { id },
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Verifica que la empresa objetivo esté dentro del scope del usuario (anti-IDOR). */
  private canAccess(ctx: HttpContext, businessUnitId: number): boolean {
    return ctx.businessUnitScope?.includes(businessUnitId) ?? false
  }

  private forbidden(ctx: HttpContext) {
    const detail = 'No tiene permiso de administración sobre la empresa objetivo.'
    return ctx.response.status(403).json({
      type: 'error',
      title: 'Sin permiso',
      message: detail,
      detail,
      key: 'sin-permiso',
    })
  }

  private notFound(ctx: HttpContext) {
    const detail = 'No existe un override con el id indicado.'
    return ctx.response.status(404).json({
      type: 'warning',
      title: 'Override no encontrado',
      message: detail,
      detail,
      key: 'no-encontrado',
    })
  }

  private justificationRequired(ctx: HttpContext) {
    const detail = 'La justificación es obligatoria cuando exceedsFederalAck es true.'
    return ctx.response.status(422).json({
      type: 'error',
      title: 'Parámetros inválidos',
      message: detail,
      detail,
      key: 'entrada-invalida',
    })
  }

  private validationError(ctx: HttpContext, error: unknown) {
    const messages = (error as { messages?: unknown })?.messages
    const detail = 'La entrada no es válida.'
    return ctx.response.status(422).json({
      type: 'error',
      title: 'Parámetros inválidos',
      message: detail,
      detail,
      key: 'entrada-invalida',
      details: messages,
    })
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof WorkingTimeRuleError) {
      return ctx.response.status(ERROR_STATUS[error.key]).json({
        type: 'error',
        title: error.title,
        message: error.detail,
        detail: error.detail,
        key: error.key,
      })
    }
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return ctx.response.status(500).json({
      type: 'error',
      title: 'Error del servidor',
      message: 'Ocurrió un error inesperado en el servidor.',
      error: message,
    })
  }
}

import { HttpContext } from '@adonisjs/core/http'
import EffectiveService from './effective.service.js'
import { getEffectiveValidator } from './validators/get_effective.validator.js'

/**
 * Controller de la jornada efectiva por empresa y fecha.
 *
 * Seguridad: valida que la empresa objetivo esté dentro del `businessUnitScope` del
 * usuario (anti-IDOR). Requiere middleware.auth() + middleware.businessScope() en la ruta.
 */
export default class EffectiveController {
  /**
   * @swagger
   * /api/v1/working-time-rules/effective:
   *   get:
   *     summary: Resuelve la jornada efectiva de una empresa en una fecha
   *     description: >
   *       Devuelve la regla aplicable (override o federal), el baseline federal del
   *       mismo periodo y si el override excede al federal. Resultado cacheado e
   *       invalidado por el CRUD de overrides.
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkingTimeRuleEffective]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: Empresa (tenant) activa. Define la unidad de negocio de la consulta.
   *         schema: { type: integer }
   *       - name: date
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2027-03-15" }
   *       - name: countryCode
   *         in: query
   *         required: false
   *         schema: { type: string, example: "MX" }
   *     responses:
   *       200: { description: Jornada efectiva resuelta }
   *       400: { description: Query inválido (date) o header faltante }
   *       403: { description: Sin permiso sobre la empresa }
   *       404: { description: No hay regla vigente (jornada-no-resuelta) }
   */
  async show(ctx: HttpContext) {
    const { request, response } = ctx

    let payload
    try {
      payload = await getEffectiveValidator.validate(request.qs())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    // La empresa proviene del header X-Business-Unit-Id, resuelto por el middleware
    // de scope. No se acepta por query: el header es la única fuente de verdad.
    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    const service = new EffectiveService()
    const result = await service.getRulesForDate(
      businessUnitId,
      payload.date,
      payload.countryCode
    )

    if (result.effective === null) {
      return this.unresolved(ctx)
    }

    return response.status(200).json({
      type: 'success',
      title: 'Jornada efectiva',
      message: 'Jornada efectiva resuelta correctamente.',
      data: result,
    })
  }

  private forbidden(ctx: HttpContext) {
    const detail = 'No tiene permiso de consulta sobre la empresa objetivo.'
    return ctx.response.status(403).json({
      type: 'error',
      title: 'Sin permiso',
      message: detail,
      detail,
      key: 'sin-permiso',
    })
  }

  private unresolved(ctx: HttpContext) {
    const detail = 'No existe regla federal ni override vigente para la fecha indicada.'
    return ctx.response.status(404).json({
      type: 'warning',
      title: 'Jornada no resuelta',
      message: detail,
      detail,
      key: 'jornada-no-resuelta',
    })
  }

  private validationError(ctx: HttpContext, error: unknown) {
    const messages = (error as { messages?: unknown })?.messages
    const detail = 'El query no es válido: revise date (YYYY-MM-DD).'
    return ctx.response.status(400).json({
      type: 'error',
      title: 'Parámetros inválidos',
      message: detail,
      detail,
      key: 'entrada-invalida',
      details: messages,
    })
  }
}

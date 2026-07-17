import type { HttpContext } from '@adonisjs/core/http'
import WorkingTimeReformSimulator from '../services/reform_simulator_service.js'
import type { ReformSimulationTargetYear } from '#constants/reform_simulator.constants'
import { simulateReformValidator } from '#validators/reform_simulator'

/**
 * Controller del simulador de reforma de jornada (proyección roster × tope futuro).
 *
 * Seguridad: la empresa proviene del header X-Business-Unit-Id resuelto por
 * middleware.businessScope(); nunca se acepta por query. Requiere auth en la ruta.
 */
export default class ReformSimulatorController {
  private readonly service = new WorkingTimeReformSimulator()

  /**
   * @swagger
   * /api/v1/working-time-rules/reform-simulation:
   *   get:
   *     tags:
   *       - WorkingTimeRules
   *     summary: Proyectar trabajadores afectados por un escalón de la reforma 40h
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Cruza el roster activo de la empresa contra el tope legal de jornada de un año
   *       objetivo (2026–2030) y devuelve totales, detalle por empleado y comparativa de
   *       los cinco escalones en una sola respuesta.
   *
   *       Las horas semanales programadas se derivan del turno vigente:
   *       `shiftActiveHours × (7 − días de descanso del turno)`.
   *
   *       Los topes provienen exclusivamente de `getRulesForDate` con fecha `{año}-01-01`;
   *       nunca se cablean en el simulador.
   *
   *       La empresa se resuelve del header `X-Business-Unit-Id`; nunca del query
   *       (anti-IDOR).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Código público (UUID v4) de la empresa activa
   *       - in: query
   *         name: targetYear
   *         required: true
   *         schema:
   *           type: integer
   *           enum: [2026, 2027, 2028, 2029, 2030]
   *           example: 2030
   *         description: Año objetivo del escenario de reforma (2026 = base actual)
   *     responses:
   *       '200':
   *         description: Simulación calculada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '401':
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Sin permiso sobre la empresa (sin-permiso)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: sin-permiso
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: Año objetivo inválido (entrada-invalida)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: entrada-invalida
   *                 details:
   *                   type: object
   *                   nullable: true
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '500':
   *         description: Error interno del cálculo (simulacion-no-resuelta)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: simulacion-no-resuelta
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Error inesperado del servidor
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async simulate(ctx: HttpContext) {
    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.service.respondForbidden(ctx)
    }

    let payload
    try {
      payload = await simulateReformValidator.validate(ctx.request.qs())
    } catch (error) {
      return this.service.respondValidationError(ctx, error)
    }

    try {
      const data = await this.service.simulate(
        businessUnitId,
        payload.targetYear as ReformSimulationTargetYear
      )
      return this.service.respondSuccess(ctx, data)
    } catch {
      return this.service.respondSimulationFailed(ctx)
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import TraumaticEventExamService from '#services/traumatic_event_exam_service'
import {
  createTraumaticEventExamValidator,
  updateTraumaticEventExamValidator,
} from '#validators/traumatic_event_exam'
import { TEX_ERROR_CODES } from '../constants/traumatic_event_exam_error_codes.js'
import { resolveTraumaticEventExamApiError } from '../helpers/traumatic_event_exam_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

const MODULE_SLUG = 'traumatic-event-reports'

export default class TraumaticEventExamController {
  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:reportId/exams
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/exams:
   *   get:
   *     summary: Lista los resultados de examen de un reporte (NOM-035 §5.6)
   *     tags: [TraumaticEventExams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Lista de exámenes ordenada por performed_at DESC }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read en el módulo }
   *       '404': { description: Reporte inexistente o fuera del scope (ETR.NF.REPORT.001) }
   */
  async index(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const reportId = this.parseId(params.reportId)
      const service = new TraumaticEventExamService()
      const exams = await service.listByReport(reportId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        exams,
        'Traumatic Event Exams',
        'Resultados de examen obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/traumatic-event-reports/:reportId/exams
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/exams:
   *   post:
   *     summary: Registrar resultado de examen del reporte (NOM-035 §5.6)
   *     tags: [TraumaticEventExams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - traumaticEventExamType
   *               - traumaticEventExamPerformedAt
   *               - traumaticEventExamPerformedBy
   *               - traumaticEventExamOutcome
   *             properties:
   *               traumaticEventExamType:
   *                 type: string
   *                 enum: [medical, psychological]
   *               traumaticEventExamPerformedAt:
   *                 type: string
   *                 format: date
   *                 description: Fecha del examen (no anterior al evento ni futura).
   *               traumaticEventExamPerformedBy:
   *                 type: string
   *                 description: Profesional o institución que practicó el examen (3-150).
   *               traumaticEventExamOutcome:
   *                 type: string
   *                 enum: [fit, needs_follow_up, referred]
   *               traumaticEventExamNotes:
   *                 type: string
   *                 description: Nota libre del capturador (máx 500).
   *     responses:
   *       '201': { description: Resultado de examen creado con capturedByUserId asignado }
   *       '400':
   *         description: |
   *           Posibles key:
   *           - fecha-examen-anterior-al-evento (TEX.VAL.DATE.001)
   *           - fecha-examen-futura (TEX.VAL.DATE.002)
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso create en el módulo }
   *       '404': { description: Reporte inexistente o fuera del scope (ETR.NF.REPORT.001) }
   */
  async store(ctx: HttpContext) {
    const { request, params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const reportId = this.parseId(params.reportId)
      const body = await request.validateUsing(createTraumaticEventExamValidator)
      const service = new TraumaticEventExamService()
      const created = await service.create(
        reportId,
        {
          traumaticEventExamType: body.traumaticEventExamType,
          traumaticEventExamPerformedAt: body.traumaticEventExamPerformedAt,
          traumaticEventExamPerformedBy: body.traumaticEventExamPerformedBy,
          traumaticEventExamOutcome: body.traumaticEventExamOutcome,
          traumaticEventExamNotes: body.traumaticEventExamNotes,
          capturedByUserId: ctx.auth.user!.userId,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Traumatic Event Exam',
        'Resultado de examen registrado correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // PUT /api/traumatic-event-reports/:reportId/exams/:examId
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/exams/{examId}:
   *   put:
   *     summary: Actualizar resultado de examen
   *     tags: [TraumaticEventExams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: examId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Resultado de examen actualizado }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso update en el módulo }
   *       '404': { description: Reporte o examen inexistente/fuera del scope }
   */
  async update(ctx: HttpContext) {
    const { request, params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const reportId = this.parseId(params.reportId)
      const examId = this.parseId(params.examId)
      const body = await request.validateUsing(updateTraumaticEventExamValidator)
      const service = new TraumaticEventExamService()
      const updated = await service.update(
        reportId,
        examId,
        {
          traumaticEventExamType: body.traumaticEventExamType,
          traumaticEventExamPerformedAt: body.traumaticEventExamPerformedAt,
          traumaticEventExamPerformedBy: body.traumaticEventExamPerformedBy,
          traumaticEventExamOutcome: body.traumaticEventExamOutcome,
          traumaticEventExamNotes: body.traumaticEventExamNotes,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        updated,
        'Traumatic Event Exam',
        'Resultado de examen actualizado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/traumatic-event-reports/:reportId/exams/:examId
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/exams/{examId}:
   *   delete:
   *     summary: Eliminar resultado de examen (soft delete)
   *     tags: [TraumaticEventExams]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: examId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Resultado de examen eliminado (soft delete); data null }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso delete en el módulo }
   *       '404': { description: Reporte o examen inexistente/fuera del scope }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const reportId = this.parseId(params.reportId)
      const examId = this.parseId(params.examId)
      const service = new TraumaticEventExamService()
      await service.destroy(reportId, examId, ctx.businessUnitScope)

      return response.status(200).json({
        type: 'success',
        title: 'Traumatic Event Exam',
        message: 'Resultado de examen eliminado correctamente',
        data: null,
      })
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: 'No autorizado',
        detail: 'Usuario no autenticado.',
        key: 'unauthorized',
        code: TEX_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'update' | 'delete'
  ) {
    const user = ctx.auth.user!
    await user.preload('role')
    const isRoot = user.role?.roleSlug === 'root'
    if (isRoot) return true

    const roleService = new RoleService()
    const allowed = await roleService.hasAccess(user.roleId, MODULE_SLUG, action)
    if (!allowed) {
      ctx.response.status(403).json({
        type: 'error',
        title: 'Sin permiso',
        detail: 'No tienes permiso para esta operación sobre exámenes de evento traumático.',
        key: 'sin-permiso',
        code: TEX_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseId(raw: unknown): number {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('El identificador es inválido.')
    }
    return id
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number
  ) {
    const resolved = resolveTraumaticEventExamApiError(error, fallbackStatus)
    return response.status(resolved.status).json({
      type: 'error',
      title: 'Error',
      detail: resolved.message,
      key: resolved.key,
      code: resolved.code,
      data: null,
    })
  }
}

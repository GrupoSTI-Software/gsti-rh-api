import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import TraumaticEventReferralService from '#services/traumatic_event_referral_service'
import {
  createTraumaticEventReferralValidator,
  updateTraumaticEventReferralValidator,
} from '#validators/traumatic_event_referral'
import { TREF_ERROR_CODES } from '../constants/traumatic_event_referral_error_codes.js'
import { resolveTraumaticEventReferralApiError } from '../helpers/traumatic_event_referral_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

/** Reutiliza los permisos del módulo del reporte (no se siembra permiso nuevo). */
const MODULE_SLUG = 'traumatic-event-reports'

export default class TraumaticEventReferralController {
  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:reportId/referrals
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/referrals:
   *   get:
   *     summary: Lista las canalizaciones de un reporte de evento traumático
   *     tags: [TraumaticEventReferrals]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Lista de canalizaciones ordenada por referred_at DESC }
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
      const service = new TraumaticEventReferralService()
      const referrals = await service.listByReport(reportId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        referrals,
        'Traumatic Event Referrals',
        'Canalizaciones obtenidas correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/traumatic-event-reports/:reportId/referrals
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/referrals:
   *   post:
   *     summary: Registrar una canalización del reporte (NOM-035 §5.5)
   *     tags: [TraumaticEventReferrals]
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
   *               - traumaticEventReferralInstitutionType
   *               - traumaticEventReferralInstitutionName
   *               - traumaticEventReferralReferredAt
   *             properties:
   *               traumaticEventReferralInstitutionType:
   *                 type: string
   *                 enum: [imss, company_doctor, private_clinic, other]
   *               traumaticEventReferralInstitutionName:
   *                 type: string
   *                 description: Nombre de la institución (3-150).
   *               traumaticEventReferralReferredAt:
   *                 type: string
   *                 format: date
   *                 description: Fecha de canalización (no anterior al evento ni futura).
   *               traumaticEventReferralNotes:
   *                 type: string
   *                 description: Observaciones (máx 500).
   *     responses:
   *       '201': { description: Canalización creada con capturedByUserId asignado }
   *       '400':
   *         description: |
   *           Validación inválida. Posibles `key`:
   *           - `fecha-canalizacion-anterior-al-evento` (TREF.VAL.DATE.001)
   *           - `fecha-canalizacion-futura` (TREF.VAL.DATE.002)
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
      const body = await request.validateUsing(createTraumaticEventReferralValidator)
      const service = new TraumaticEventReferralService()
      const created = await service.create(
        reportId,
        {
          traumaticEventReferralInstitutionType: body.traumaticEventReferralInstitutionType,
          traumaticEventReferralInstitutionName: body.traumaticEventReferralInstitutionName,
          traumaticEventReferralReferredAt: body.traumaticEventReferralReferredAt,
          traumaticEventReferralNotes: body.traumaticEventReferralNotes,
          capturedByUserId: ctx.auth.user!.userId,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Traumatic Event Referral',
        'Canalización creada correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // PUT /api/traumatic-event-reports/:reportId/referrals/:referralId
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/referrals/{referralId}:
   *   put:
   *     summary: Actualizar una canalización del reporte
   *     tags: [TraumaticEventReferrals]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: referralId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               traumaticEventReferralInstitutionType:
   *                 type: string
   *                 enum: [imss, company_doctor, private_clinic, other]
   *               traumaticEventReferralInstitutionName: { type: string }
   *               traumaticEventReferralReferredAt: { type: string, format: date }
   *               traumaticEventReferralNotes: { type: string }
   *     responses:
   *       '200': { description: Canalización actualizada }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso update en el módulo }
   *       '404': { description: Reporte o canalización inexistente/fuera del scope }
   */
  async update(ctx: HttpContext) {
    const { request, params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const reportId = this.parseId(params.reportId)
      const referralId = this.parseId(params.referralId)
      const body = await request.validateUsing(updateTraumaticEventReferralValidator)
      const service = new TraumaticEventReferralService()
      const updated = await service.update(
        reportId,
        referralId,
        {
          traumaticEventReferralInstitutionType: body.traumaticEventReferralInstitutionType,
          traumaticEventReferralInstitutionName: body.traumaticEventReferralInstitutionName,
          traumaticEventReferralReferredAt: body.traumaticEventReferralReferredAt,
          traumaticEventReferralNotes: body.traumaticEventReferralNotes,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        updated,
        'Traumatic Event Referral',
        'Canalización actualizada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/traumatic-event-reports/:reportId/referrals/:referralId
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/referrals/{referralId}:
   *   delete:
   *     summary: Eliminar una canalización del reporte (soft delete)
   *     tags: [TraumaticEventReferrals]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: referralId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Canalización eliminada (soft delete); responde solo mensaje, data null }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso delete en el módulo }
   *       '404': { description: Reporte o canalización inexistente/fuera del scope }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const reportId = this.parseId(params.reportId)
      const referralId = this.parseId(params.referralId)
      const service = new TraumaticEventReferralService()
      await service.destroy(reportId, referralId, ctx.businessUnitScope)

      // El soft delete solo confirma con mensaje; no se retorna el recurso eliminado.
      return response.status(200).json({
        type: 'success',
        title: 'Traumatic Event Referral',
        message: 'Canalización eliminada correctamente',
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
        code: TREF_ERROR_CODES.FORBIDDEN,
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
        detail: 'No tienes permiso para esta operación sobre canalizaciones de evento traumático.',
        key: 'sin-permiso',
        code: TREF_ERROR_CODES.FORBIDDEN,
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
    const resolved = resolveTraumaticEventReferralApiError(error, fallbackStatus)
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

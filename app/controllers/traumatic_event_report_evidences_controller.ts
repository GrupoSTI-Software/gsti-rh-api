import type { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import RoleService from '#services/role_service'
import TraumaticEventReportEvidenceService from '#services/traumatic_event_report_evidence_service'
import { traumaticEventReportEvidenceUploadValidator } from '#validators/traumatic_event_report_evidence'
import type { TraumaticEventReportEvidenceCategory } from '#models/traumatic_event_report_evidence'
import { TERE_ERROR_CODES } from '../constants/traumatic_event_report_evidence_error_codes.js'
import { TraumaticEventReportEvidenceError } from '../exceptions/traumatic_event_report_evidence_error.js'
import { resolveTraumaticEventReportEvidenceApiError } from '../helpers/traumatic_event_report_evidence_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

/**
 * Las evidencias no tienen módulo propio en `system_modules`; viven embebidas
 * bajo el módulo de reportes de evento traumático. Los permisos se verifican
 * contra el slug `traumatic-event-reports`, igual que hacen las canalizaciones
 * y los exámenes.
 */
const MODULE_SLUG = 'traumatic-event-reports'

/**
 * Controlador REST de las evidencias documentales adjuntas a un reporte de
 * evento traumático (NOM-035 §6.5). Expone 4 endpoints anidados bajo
 * `/api/traumatic-event-reports/:reportId/evidences`.
 *
 * Acepta PDF, JPG y PNG hasta 10 MB.
 * El archivo nunca se sirve directamente: el cliente recibe solo metadata y
 * URLs firmadas temporales (5 min) para descarga.
 * Soft-delete: el objeto S3 se conserva para auditoría STPS.
 */
export default class TraumaticEventReportEvidencesController {
  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:reportId/evidences
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/evidences:
   *   get:
   *     summary: Lista las evidencias documentales del reporte de evento traumático
   *     tags: [TraumaticEventReportEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado ordenado por fecha de creación DESC }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read en el módulo traumatic-event-reports }
   *       '404': { description: Reporte inexistente o ajeno a la empresa }
   */
  async index(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const reportId = this.parseId(params.reportId)
      const service = new TraumaticEventReportEvidenceService()
      const rows = await service.listByReport(reportId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        rows,
        'Traumatic Event Report Evidences',
        'Evidencias del reporte de evento traumático obtenidas correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/traumatic-event-reports/:reportId/evidences
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/evidences:
   *   post:
   *     summary: Sube una evidencia documental al reporte de evento traumático
   *     description: |
   *       Acepta archivos PDF, JPG o PNG de hasta 10 MB.
   *       La categoría es opcional; default `other`.
   *       El archivo se almacena en S3 como `private`; al cliente solo se le
   *       devuelve metadata (nunca la Key interna S3).
   *     tags: [TraumaticEventReportEvidences]
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
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file]
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: PDF, JPG o PNG de hasta 10 MB.
   *               traumaticEventReportEvidenceCategory:
   *                 type: string
   *                 enum: [written_statement, incident_record, other]
   *                 default: other
   *                 description: |
   *                   Categoría del documento adjunto.
   *                   - `written_statement`: escrito del trabajador (NOM-035 §6.5).
   *                   - `incident_record`: acta o constancia del evento.
   *                   - `other`: cualquier otra evidencia relevante.
   *     responses:
   *       '201': { description: Evidencia subida y persistida. Devuelve metadata de la evidencia. }
   *       '400':
   *         description: |
   *           Validación de archivo o categoría. Posibles `code` / `key`:
   *           - `TERE.VAL.FILE.001` / `archivo-invalido`: tipo no permitido o archivo ausente.
   *           - `TERE.VAL.FILE.002` / `archivo-demasiado-grande`: supera 10 MB.
   *           - `TERE.VAL.CAT.001` / `evidencia-categoria-invalida`: categoría fuera del set.
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso create en traumatic-event-reports (TERE.FORBID.001) }
   *       '404': { description: Reporte inexistente o ajeno a la empresa (ETR.NF.REPORT.001) }
   *       '500':
   *         description: Fallo al subir el archivo a S3 (TERE.S3.001 / evidencia-subida-fallida)
   */
  async store(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const reportId = this.parseId(params.reportId)
      const body = await request.validateUsing(traumaticEventReportEvidenceUploadValidator)
      const file = request.file('file')

      const service = new TraumaticEventReportEvidenceService()
      const created = await service.upload(
        reportId,
        file,
        {
          category: body.traumaticEventReportEvidenceCategory as
            | TraumaticEventReportEvidenceCategory
            | undefined,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Traumatic Event Report Evidence',
        'Evidencia subida correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:reportId/evidences/:evidenceId/download-url
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/evidences/{evidenceId}/download-url:
   *   get:
   *     summary: URL firmada temporal para descargar una evidencia
   *     description: |
   *       Devuelve un enlace pre-firmado a S3 con vigencia de 5 minutos.
   *       El archivo nunca se sirve directamente desde la API.
   *     tags: [TraumaticEventReportEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: URL firmada generada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 downloadUrl: { type: string }
   *                 expiresInSeconds: { type: integer, example: 300 }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read (TERE.FORBID.001) }
   *       '404': { description: Reporte o evidencia inexistente (ETR.NF.REPORT.001 / TERE.NF.EVID.001) }
   *       '500': { description: Fallo al firmar la URL (TERE.S3.001 / evidencia-descarga-fallida) }
   */
  async downloadUrl(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const reportId = this.parseId(params.reportId)
      const evidenceId = this.parseId(params.evidenceId)

      const service = new TraumaticEventReportEvidenceService()
      const result = await service.getDownloadUrl(reportId, evidenceId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Traumatic Event Report Evidence Download',
        'URL de descarga generada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/traumatic-event-reports/:reportId/evidences/:evidenceId
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/evidences/{evidenceId}:
   *   delete:
   *     summary: Soft delete de la evidencia del reporte
   *     description: |
   *       Borra la fila lógicamente; NO elimina el objeto en S3 para conservar
   *       trazabilidad de auditoría ante inspección STPS. Responde solo mensaje de
   *       confirmación (data: null).
   *     tags: [TraumaticEventReportEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Soft delete aplicado }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso delete (TERE.FORBID.001) }
   *       '404': { description: Reporte o evidencia inexistente }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const reportId = this.parseId(params.reportId)
      const evidenceId = this.parseId(params.evidenceId)

      const service = new TraumaticEventReportEvidenceService()
      await service.destroy(reportId, evidenceId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        null,
        'Traumatic Event Report Evidence',
        'Evidencia eliminada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: 'No autorizado',
        detail: 'Usuario no autenticado',
        code: TERE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'delete'
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
        detail: 'No tienes permiso para esta operación sobre evidencias de reporte de evento traumático.',
        key: 'sin-permiso',
        code: TERE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseId(raw: unknown): number {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new TraumaticEventReportEvidenceError(
        'El identificador es inválido.',
        TERE_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number
  ) {
    // El rechazo de un archivo es 422 con triplete: sin esta rama el resolver
    // del modulo lo degrada a un 500 genérico y el usuario nunca sabe que su
    // archivo fue rechazado ni por que.
    if (isFileIntakeError(error)) {
      return respondFileIntakeError(response, error)
    }

    const resolved = resolveTraumaticEventReportEvidenceApiError(error, fallbackStatus)
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

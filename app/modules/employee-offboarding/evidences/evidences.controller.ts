import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import EvidencesService from './evidences.service.js'

/** Ramos genéricos del resolvedor con los códigos compartidos del expediente. */
const EVIDENCE_FALLBACKS: EmployeeOffboardingErrorFallbacks = {
  valInputCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
  unexpectedCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_UNEXPECTED,
}

/**
 * Evidencias adjuntas a los pendientes del expediente de salida
 * (USRH1786568279593). Errores siempre `{ title, detail, key, code }` — el
 * envío rechazado agrega `data.rejectedFiles[]` (D-3); el BO ramifica por
 * `key`. La bandera `requiresEvidence` no valida nada aquí (D-6).
 */
export default class EvidencesController {
  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/evidences:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Lista las evidencias vivas de un pendiente
   *     description: |
   *       Orden created_at DESC, id DESC. Nunca expone la Key de S3; la
   *       descarga va por el enlace temporal firmado.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Evidencias en data.employeeOffboardingItemEvidences
   *       404:
   *         description: Pendiente o expediente fuera del alcance (key pendiente-no-encontrado)
   */
  async index({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EvidencesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const employeeOffboardingItemEvidences = await service.listByItem(
        offboardingId,
        itemId,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingItemEvidences,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_evidences_listed_message'),
        200,
        'employeeOffboardingItemEvidences'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/evidences:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Sube un envío de evidencias al pendiente (todo o nada)
   *     description: |
   *       multipart/form-data con el campo files[], de 1 a 5 archivos PDF,
   *       JPG o PNG de hasta 10 MB cada uno (regla 2). El envío se valida
   *       ENTERO antes de tocar S3: si algo falla se responde 400 con el
   *       archivo ofensor nombrado y data.rejectedFiles[], y no se sube ni
   *       persiste nada (regla 3). Los archivos quedan privados en S3; la
   *       falta de comprobante nunca bloquea nada (regla 7).
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               files:
   *                 type: array
   *                 items: { type: string, format: binary }
   *     responses:
   *       201:
   *         description: Evidencias creadas en data.employeeOffboardingItemEvidences
   *       400:
   *         description: Envío inválido (keys lote-invalido / archivo-invalido / archivo-demasiado-grande, con data.rejectedFiles)
   *       404:
   *         description: Pendiente o expediente fuera del alcance (key pendiente-no-encontrado)
   *       500:
   *         description: Fallo de S3 al subir (key evidencia-subida-fallida)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EvidencesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'create')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      // Primer filtro de Adonis (`extnames` es la opción real del bodyparser;
      // el `types` del precedente de fotos no existe en FileValidationOptions).
      // El error estable lo produce el servicio (D-10).
      const files = request.files('files', { extnames: ['pdf', 'jpg', 'jpeg', 'png'], size: '10mb' })
      const employeeOffboardingItemEvidences = await service.uploadBatch(
        offboardingId,
        itemId,
        files,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingItemEvidences,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_evidences_uploaded_message'),
        201,
        'employeeOffboardingItemEvidences'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/evidences/{evidenceId}/download-url:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Genera el enlace temporal de descarga de una evidencia
   *     description: |
   *       URL pre-firmada de 300 segundos (regla 4). La Key de S3 nunca viaja
   *       al cliente; pasado el plazo el enlace deja de servir.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: data.employeeOffboardingItemEvidenceDownload con downloadUrl y expiresInSeconds
   *       404:
   *         description: Evidencia inexistente o ajena al pendiente (key evidencia-no-encontrada)
   *       500:
   *         description: Fallo de S3 al firmar (key evidencia-descarga-fallida)
   */
  async downloadUrl({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EvidencesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const evidenceId = this.parseId(request.param('evidenceId'), i18n)
      const download = await service.getDownloadUrl(
        offboardingId,
        itemId,
        evidenceId,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        download,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_evidence_download_link_message'),
        200,
        'employeeOffboardingItemEvidenceDownload'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/evidences/{evidenceId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Quita una evidencia del pendiente (borrado lógico)
   *     description: |
   *       La evidencia deja de listarse pero el objeto de S3 se CONSERVA
   *       (regla 5): el respaldo puede requerirse en una revisión posterior.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Confirmación del retiro de la vista
   *       404:
   *         description: Evidencia inexistente o ajena al pendiente (key evidencia-no-encontrada)
   */
  async destroy({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new EvidencesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'delete')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const evidenceId = this.parseId(request.param('evidenceId'), i18n)
      await service.removeEvidence(offboardingId, itemId, evidenceId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        null,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_evidence_deleted_message'),
        200,
        'employeeOffboardingItemEvidence'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  private parseId(rawId: string, i18n: HttpContext['i18n']): number {
    const parsed = Number.parseInt(rawId, 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new EmployeeOffboardingServiceError({
        key: 'datos-invalidos',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('employee_offboarding_val_input_title'),
        detail: i18n.formatMessage('employee_offboarding_val_input_message'),
      })
    }
    return parsed
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolveEmployeeOffboardingApiError(error, i18n, EVIDENCE_FALLBACKS)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
      ...(resolved.data !== undefined ? { data: resolved.data } : {}),
    }
  }
}

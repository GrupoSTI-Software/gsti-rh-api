import { HttpContext } from '@adonisjs/core/http'
import LegalDocumentError from '#exceptions/legal_document_error'
import { LEGAL_DOCUMENT_ERROR_CODES } from '#constants/legal_document_error_codes'
import LegalDocumentService from './legal_document.service.js'
import { legalDocumentQueryValidator } from './validators/legal_document_query.validator.js'

/**
 * Controller del cimiento de documentos legales versionados.
 *
 * Expone un único endpoint:
 *   GET /api/legal-documents/current?type=... — documento vigente de un tipo.
 *
 * Seguridad:
 *  - Requiere middleware.auth(). Sin businessScope: documento global de GSTI.
 *  - Solo lectura; nunca expone metadatos de auditoría (publishedByUserId, histórico).
 */
export default class LegalDocumentController {
  /**
   * @swagger
   * /api/legal-documents/current:
   *   get:
   *     summary: Consultar el documento legal vigente de un tipo
   *     description: |
   *       Devuelve la versión actualmente vigente (`is_current = true`) de un tipo de
   *       documento legal de plataforma (aviso de privacidad, términos y condiciones o
   *       consentimiento biométrico). Responde 404 contractual cuando el tipo aún no
   *       tiene ninguna versión publicada (caso de `biometric_consent` recién declarado).
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: query
   *         name: type
   *         required: true
   *         schema:
   *           type: string
   *           enum: [privacy_notice, terms_conditions, biometric_consent]
   *     responses:
   *       200:
   *         description: Documento legal vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Documento legal vigente obtenido correctamente.
   *               data:
   *                 type: privacy_notice
   *                 version: "1.0"
   *                 content: "<h1>Aviso de privacidad</h1><p>...</p>"
   *                 publishedAt: "2026-07-02T00:00:00.000-06:00"
   *       404:
   *         description: El tipo no tiene versión vigente publicada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: Aún no hay una versión vigente publicada para este tipo de documento.
   *               key: documento-legal-sin-version-vigente
   *               code: LGDOC.NF.001
   *       422:
   *         description: El parámetro `type` es inválido o falta
   *         content:
   *           application/json:
   *             examples:
   *               missingType:
   *                 summary: No se envió el parámetro type
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: "Debes indicar el parámetro 'type' con uno de estos valores: privacy_notice, terms_conditions, biometric_consent."
   *                   key: tipo-de-documento-invalido
   *                   code: LGDOC.VAL.001
   *               invalidType:
   *                 summary: type fuera del enum permitido
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: El tipo de documento legal indicado no es válido.
   *                   key: tipo-de-documento-invalido
   *                   code: LGDOC.VAL.001
   */
  async getCurrent(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    const { request, i18n } = ctx

    let payload
    try {
      payload = await legalDocumentQueryValidator.validate({ type: request.input('type') })
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const data = await service.getCurrent(payload.type, i18n.locale)
      return ctx.response.status(200).json({
        type: 'success',
        title: i18n.formatMessage('legalDocuments.title'),
        message: i18n.formatMessage('legalDocuments.current_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * `key`/`code` son siempre los mismos (contrato del spec: un solo error de
   * validación para `type`), pero el `detail` distingue si el parámetro falta
   * por completo de si llegó con un valor fuera del enum — evita el mensaje
   * genérico "no es válido" cuando en realidad nunca se envió `type`.
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const messageKey = this.isMissingTypeError(error)
      ? 'legalDocuments.errors.tipo-de-documento-invalido.detail_missing'
      : 'legalDocuments.errors.tipo-de-documento-invalido.detail'

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('legalDocuments.title'),
      detail: i18n.formatMessage(messageKey),
      key: 'tipo-de-documento-invalido',
      code: LEGAL_DOCUMENT_ERROR_CODES.INVALID_TYPE,
    })
  }

  private isMissingTypeError(error: unknown): boolean {
    const validationError = error as { messages?: Array<{ field?: string; rule?: string }> }
    return (
      validationError?.messages?.some((m) => m.field === 'type' && m.rule === 'required') ?? false
    )
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof LegalDocumentError) {
      const { i18n } = ctx
      return ctx.response.status(404).json({
        type: 'error',
        title: i18n.formatMessage('legalDocuments.title'),
        detail: i18n.formatMessage(`legalDocuments.errors.${error.key}.detail`),
        key: error.key,
        code: LEGAL_DOCUMENT_ERROR_CODES.NOT_CURRENT,
      })
    }
    throw error
  }
}

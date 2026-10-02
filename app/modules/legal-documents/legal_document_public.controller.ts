import type { HttpContext } from '@adonisjs/core/http'
import i18nManager from '@adonisjs/i18n/services/main'
import LegalDocumentError from '#exceptions/legal_document_error'
import { LEGAL_DOCUMENT_ERROR_CODES } from '#constants/legal_document_error_codes'
import { LEGAL_DOCUMENT_PUBLIC_ERROR_CODES } from '#constants/legal_document_public_error_codes'
import { sanitizeLegalDocumentHtml } from '#helpers/sanitize_legal_document_content'
import LegalDocumentService from './legal_document.service.js'
import { legalDocumentPublicQueryValidator } from './validators/legal_document_public_query.validator.js'

/** Idioma con el que se formatean los errores cuando el `locale` aún no está validado. */
const DEFAULT_LOCALE = 'es'

/** Solo el navegador del visitante puede conservar la respuesta (nunca un caché compartido). */
const SUCCESS_CACHE_CONTROL = 'private, max-age=300'
const ERROR_CACHE_CONTROL = 'no-store'

/**
 * Controller de la lectura pública (sin sesión) de la versión vigente de los documentos
 * legales de cara al visitante: Términos y Condiciones y Aviso de Privacidad.
 *
 * Endpoints:
 *   GET /api/public/legal-documents/current?type=...&locale=...
 *
 * Seguridad:
 *  - Sin `auth()` ni `businessScope()`: documento global de Valanserh, sin datos de empresas.
 *  - Limitador `legal-document-public` (60/min por IP) montado en las rutas; la IP solo es la
 *    llave del limitador, nunca se registra.
 *  - El contenido se sanea SIEMPRE al servir, sin importar cómo se guardó.
 *  - Salida en lista blanca de cuatro llaves, construida a mano (nunca se hace spread del DTO).
 */
export default class LegalDocumentPublicController {
  /**
   * @swagger
   * /api/public/legal-documents/current:
   *   get:
   *     summary: Consultar sin sesión la versión vigente de términos o aviso de privacidad
   *     description: |
   *       Devuelve la versión vigente (`is_current = true`) de `terms_conditions` o
   *       `privacy_notice` en el idioma pedido (`es` o `en`; si no se pide, `es`). El contenido
   *       se entrega saneado. Límite de 60 consultas por minuto por IP (429 al superarlo).
   *       La respuesta 200 lleva `Cache-Control: private, max-age=300` y `Vary: Origin`;
   *       los errores llevan `Cache-Control: no-store`.
   *     tags: [LegalDocumentsPublic]
   *     parameters:
   *       - in: query
   *         name: type
   *         required: true
   *         schema:
   *           type: string
   *           enum: [terms_conditions, privacy_notice]
   *       - in: query
   *         name: locale
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *     responses:
   *       200:
   *         description: Versión vigente del documento legal
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Documento legal vigente obtenido correctamente.
   *               data:
   *                 type: terms_conditions
   *                 version: "2.0"
   *                 content: "<p>HTML saneado del idioma pedido</p>"
   *                 publishedAt: "2026-09-01T12:00:00.000-06:00"
   *       404:
   *         description: El tipo no tiene una versión vigente publicada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal sin versión vigente
   *               detail: Este documento todavía no tiene una versión publicada.
   *               key: documento-legal-sin-version-vigente
   *               code: LGDOC.NF.001
   *       422:
   *         description: El tipo falta o no está disponible para consulta pública, o el idioma no es es/en
   *         content:
   *           application/json:
   *             examples:
   *               invalidType:
   *                 summary: type ausente, inexistente o biometric_consent (mismo cuerpo)
   *                 value:
   *                   type: error
   *                   title: Tipo de documento inválido
   *                   detail: El tipo de documento solicitado no está disponible para consulta pública.
   *                   key: tipo-de-documento-invalido
   *                   code: LGDOC.VAL.001
   *               invalidLocale:
   *                 summary: locale fuera de es/en
   *                 value:
   *                   type: error
   *                   title: Idioma de documento inválido
   *                   detail: El idioma solicitado no está disponible. Usa es o en.
   *                   key: idioma-de-documento-invalido
   *                   code: LGDOC.PUBLIC.001
   *       429:
   *         description: Se superó el límite de 60 consultas por minuto por IP
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Demasiadas consultas de documentos legales
   *               detail: Se alcanzó el límite de consultas. Espera unos segundos antes de volver a intentarlo.
   *               key: demasiadas-consultas-de-documentos-legales
   *               code: LGDOC.PUBLIC.002
   *               retryAfterSeconds: 30
   */
  async current(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    const { request, response } = ctx

    // Un `locale` vacío equivale a no haberlo enviado.
    const localeRaw: string | undefined = request.input('locale') || undefined

    let payload
    try {
      payload = await legalDocumentPublicQueryValidator.validate({
        type: request.input('type'),
        locale: localeRaw,
      })
    } catch (error) {
      return this.validationError(ctx, error)
    }

    const locale = payload.locale ?? DEFAULT_LOCALE
    const i18n = i18nManager.locale(locale)

    let dto
    try {
      dto = await service.getCurrent(payload.type, locale)
    } catch (error) {
      if (
        error instanceof LegalDocumentError &&
        error.key === 'documento-legal-sin-version-vigente'
      ) {
        return response
          .status(404)
          .header('Cache-Control', ERROR_CACHE_CONTROL)
          .json({
            type: 'error',
            title: i18n.formatMessage(`legalDocumentsPublic.errors.${error.key}.title`),
            detail: i18n.formatMessage(`legalDocumentsPublic.errors.${error.key}.detail`),
            key: error.key,
            code: LEGAL_DOCUMENT_ERROR_CODES.NOT_CURRENT,
          })
      }
      throw error
    }

    // Lista blanca construida a mano: si el DTO se amplía, no debe filtrarse aquí.
    const data = {
      type: dto.type,
      version: dto.version,
      content: sanitizeLegalDocumentHtml(dto.content),
      publishedAt: dto.publishedAt,
    }

    // `append` (no `header`) para no pisar otro valor de `Vary` ya presente.
    response.append('Vary', 'Origin')
    return response
      .status(200)
      .header('Cache-Control', SUCCESS_CACHE_CONTROL)
      .json({
        type: 'success',
        title: i18n.formatMessage('legalDocumentsPublic.title'),
        message: i18n.formatMessage('legalDocumentsPublic.current_success'),
        data,
      })
  }

  /**
   * Distingue el error de tipo del de idioma por `messages[].field` (no por el orden de las
   * reglas): con `type` y `locale` inválidos a la vez gana el error de tipo. `type` ausente
   * usa `detail_missing`; ausente, inexistente o `biometric_consent` comparten `key` y `code`.
   * Se formatea en `es` porque el `locale` aún no está validado.
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const i18n = i18nManager.locale(DEFAULT_LOCALE)

    if (this.hasTypeError(error)) {
      const detailKey = this.isMissingTypeError(error) ? 'detail_missing' : 'detail'
      return ctx.response
        .status(422)
        .header('Cache-Control', ERROR_CACHE_CONTROL)
        .json({
          type: 'error',
          title: i18n.formatMessage('legalDocumentsPublic.errors.tipo-de-documento-invalido.title'),
          detail: i18n.formatMessage(
            `legalDocumentsPublic.errors.tipo-de-documento-invalido.${detailKey}`
          ),
          key: 'tipo-de-documento-invalido',
          code: LEGAL_DOCUMENT_ERROR_CODES.INVALID_TYPE,
        })
    }

    return ctx.response
      .status(422)
      .header('Cache-Control', ERROR_CACHE_CONTROL)
      .json({
        type: 'error',
        title: i18n.formatMessage('legalDocumentsPublic.errors.idioma-de-documento-invalido.title'),
        detail: i18n.formatMessage(
          'legalDocumentsPublic.errors.idioma-de-documento-invalido.detail'
        ),
        key: 'idioma-de-documento-invalido',
        code: LEGAL_DOCUMENT_PUBLIC_ERROR_CODES.INVALID_LOCALE,
      })
  }

  private hasTypeError(error: unknown): boolean {
    const validationError = error as { messages?: Array<{ field?: string }> }
    return validationError?.messages?.some((m) => m.field === 'type') ?? false
  }

  private isMissingTypeError(error: unknown): boolean {
    const validationError = error as { messages?: Array<{ field?: string; rule?: string }> }
    return (
      validationError?.messages?.some((m) => m.field === 'type' && m.rule === 'required') ?? false
    )
  }
}

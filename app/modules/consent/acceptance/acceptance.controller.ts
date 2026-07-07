import { HttpContext } from '@adonisjs/core/http'
import ConsentError from '#exceptions/consent_error'
import type { ConsentErrorKey } from '#exceptions/consent_error'
import { CONSENT_ERROR_CODES } from '#constants/consent_error_codes'
import { CONSENT_ERROR_STATUS } from '#modules/consent/consent.constants'
import AcceptanceService from './acceptance.service.js'
import { recordAcceptanceValidator } from './validators/record_acceptance.validator.js'
import { resolveAudience } from './resolve_audience.js'

/**
 * Controller del módulo de consentimiento legal, granular por documento.
 *
 * Expone dos endpoints:
 *   GET  /api/consent/me — documentos pendientes/aceptados del usuario autenticado.
 *   POST /api/consent/me — registra la aceptación de uno o más documentos vigentes.
 *
 * Seguridad:
 *  - Requiere middleware.auth(). Sin businessScope: el consentimiento es personal
 *    del usuario (aislado por auth.user.userId), no de la unidad de negocio.
 *  - userId siempre de auth.user.userId (anti-IDOR).
 *  - audience siempre derivada de `api_tokens.origin` (token de sesión), nunca de un
 *    parámetro de query/body — un empleado de la app no puede declararse "web".
 *  - El registro es inmutable (no update ni delete).
 */
export default class AcceptanceController {
  /**
   * @swagger
   * /api/consent/me:
   *   get:
   *     summary: Estado de consentimiento del usuario autenticado, por documento
   *     description: |
   *       Devuelve la lista de documentos legales vigentes que al usuario le falta
   *       aceptar (`pendingDocuments`), filtrada por la audiencia de su sesión (web:
   *       aviso + términos; app: + consentimiento biométrico). `accepted` se preserva
   *       por retrocompatibilidad: `true` cuando `pendingDocuments` está vacío.
   *     security:
   *       - bearerAuth: []
   *     tags: [Consent]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Idioma de los mensajes traducidos. Default `es`."
   *     responses:
   *       200:
   *         description: Estado de consentimiento
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string, example: Consentimiento }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     accepted: { type: boolean }
   *                     pendingDocuments:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           legalDocumentId: { type: number, example: 3 }
   *                           type:
   *                             type: string
   *                             enum: [privacy_notice, terms_conditions, biometric_consent]
   *                           version: { type: string, example: "2.0" }
   *                     currentVersion: { type: string, nullable: true, example: "1.0" }
   *                     acceptedVersion: { type: string, nullable: true }
   *                     acceptedAt: { type: string, format: date-time, nullable: true }
   *             examples:
   *               conPendientes:
   *                 summary: Usuario web con el aviso pendiente
   *                 value:
   *                   type: success
   *                   title: Consentimiento
   *                   message: Estado de consentimiento obtenido correctamente.
   *                   data:
   *                     accepted: false
   *                     pendingDocuments:
   *                       - { legalDocumentId: 2, type: privacy_notice, version: "1.0" }
   *                     currentVersion: "1.0"
   *                     acceptedVersion: null
   *                     acceptedAt: null
   *               sinPendientes:
   *                 summary: Usuario al día
   *                 value:
   *                   type: success
   *                   title: Consentimiento
   *                   message: Estado de consentimiento obtenido correctamente.
   *                   data:
   *                     accepted: true
   *                     pendingDocuments: []
   *                     currentVersion: "1.0"
   *                     acceptedVersion: "1.0"
   *                     acceptedAt: "2026-07-02T10:00:00.000-06:00"
   *       401:
   *         description: Access token ausente, inválido o expirado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: No autorizado
   *               detail: El access token es inválido o ha expirado.
   *               message: No autorizado.
   *               key: token_invalid
   *               data: { refreshable: false }
   */
  async getStatus(ctx: HttpContext, service: AcceptanceService = new AcceptanceService()) {
    const { auth, i18n } = ctx
    const userId = auth.user!.userId
    const audience = await resolveAudience(auth)
    const data = await service.getStatus(userId, audience)

    return ctx.response.status(200).json({
      type: 'success',
      title: i18n.formatMessage('consent.title'),
      message: i18n.formatMessage('consent.status_success'),
      data,
    })
  }

  /**
   * @swagger
   * /api/consent/me:
   *   post:
   *     summary: Registra la aceptación de uno o más documentos legales vigentes
   *     description: |
   *       Crea uno o más asientos inmutables de aceptación (uno por documento). Sin
   *       `type`, registra el "paquete web" (aviso + términos) en una sola operación
   *       — retrocompatible con el contrato anterior de un solo click. Con `type`,
   *       registra solo ese documento (lo usa la app para el consentimiento
   *       biométrico). Idempotente: si el usuario ya aceptó ese documento-versión,
   *       devuelve el estado existente sin duplicar. La versión enviada se valida
   *       contra la vigente derivada de `legal_documents`, no de una constante fija.
   *       Captura y cifra la IP y el user-agent como evidencia (nunca expuestos).
   *     security:
   *       - bearerAuth: []
   *     tags: [Consent]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Idioma de los mensajes traducidos. Default `es`."
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [documentVersion]
   *             properties:
   *               documentVersion:
   *                 type: string
   *                 example: "1.0"
   *               type:
   *                 type: string
   *                 enum: [privacy_notice, terms_conditions, biometric_consent]
   *                 description: "Opcional. Sin él, registra el paquete web (aviso + términos)."
   *     responses:
   *       200:
   *         description: Aceptación registrada (o ya existente)
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Consentimiento
   *               message: Consentimiento registrado correctamente.
   *               data:
   *                 accepted: true
   *                 pendingDocuments: []
   *                 currentVersion: "1.0"
   *                 acceptedVersion: "1.0"
   *                 acceptedAt: "2026-07-06T10:00:00.000-06:00"
   *       422:
   *         description: Versión inválida, tipo inválido o body malformado
   *         content:
   *           application/json:
   *             examples:
   *               versionInvalida:
   *                 summary: documentVersion no coincide con la vigente
   *                 value:
   *                   type: error
   *                   title: Consentimiento
   *                   message: Versión de consentimiento inválida
   *                   detail: La versión enviada no coincide con la versión vigente de los documentos legales.
   *                   key: version-de-consentimiento-invalida
   *                   code: CSNT.VAL.001
   *                   data: null
   *               tipoInvalido:
   *                 summary: type fuera del enum, o body malformado (Vine genérico)
   *                 value:
   *                   type: error
   *                   title: Consentimiento
   *                   message: Tipo de documento inválido
   *                   detail: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *                   key: tipo-de-documento-invalido
   *                   code: CSNT.VAL.002
   *                   data:
   *                     errors:
   *                       - field: type
   *                         message: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *                         rule: enum
   *       401:
   *         description: Access token ausente, inválido o expirado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: No autorizado
   *               detail: El access token es inválido o ha expirado.
   *               message: No autorizado.
   *               key: token_invalid
   *               data: { refreshable: false }
   */
  async record(ctx: HttpContext, service: AcceptanceService = new AcceptanceService()) {
    const { request, auth } = ctx
    const userId = auth.user!.userId

    let payload
    try {
      payload = await recordAcceptanceValidator.validate(request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const audience = await resolveAudience(auth)
      const data = await service.recordAcceptance(userId, audience, {
        documentVersion: payload.documentVersion,
        type: payload.type,
        ip: request.ip(),
        userAgent: request.header('user-agent') ?? null,
      })
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('consent.title'),
        message: ctx.i18n.formatMessage('consent.record_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * Todo error de validación de Vine (body malformado, `type` fuera del enum,
   * `documentVersion` ausente/formato inválido) cae en el bucket genérico
   * `tipo-de-documento-invalido` / `CSNT.VAL.002`. El error de dominio "versión no
   * vigente" (`CSNT.VAL.001`) SOLO lo lanza el service, nunca este validator — antes
   * este método asignaba `version-de-consentimiento-invalida` a cualquier error de
   * Vine, mezclando ambos casos (bug corregido en USRH1783101935670).
   *
   * `error.message` de un `E_VALIDATION_ERROR` es el genérico "Validation failure"
   * (no dice qué campo falló); el detalle por campo vive en `error.messages[]`
   * (`{ field, message, rule }`). Se expone el primero en `detail` y el arreglo
   * completo en `data.errors`, igual que el resto del proyecto (p.ej.
   * `error.messages[0].message` en `person_controller.ts`/`employee_controller.ts`).
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('consent.title'),
      message: i18n.formatMessage('consent.errors.tipo-de-documento-invalido.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.formatMessage('consent.errors.tipo-de-documento-invalido.detail')),
      key: 'tipo-de-documento-invalido',
      code: CONSENT_ERROR_CODES.INVALID_TYPE,
      data: vineMessages ? { errors: vineMessages } : null,
    })
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof ConsentError) {
      const { i18n } = ctx
      const status = CONSENT_ERROR_STATUS[error.key as ConsentErrorKey] ?? 500
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage('consent.title'),
        message: i18n.formatMessage(`consent.errors.${error.key}.title`),
        detail: i18n.formatMessage(`consent.errors.${error.key}.detail`),
        key: error.key,
        code: error.code,
        data: null,
      })
    }
    throw error
  }
}

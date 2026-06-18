import { HttpContext } from '@adonisjs/core/http'
import ConsentError from '#exceptions/consent_error'
import type { ConsentErrorKey } from '#exceptions/consent_error'
import { CONSENT_ERROR_STATUS } from '#modules/consent/consent.constants'
import AcceptanceService from './acceptance.service.js'
import { recordAcceptanceValidator } from './validators/record_acceptance.validator.js'

/**
 * Controller del módulo de consentimiento legal.
 *
 * Expone dos endpoints:
 *   GET  /api/consent/me — estado de aceptación del usuario autenticado.
 *   POST /api/consent/me — registra la aceptación de la versión vigente.
 *
 * Seguridad:
 *  - Requiere middleware.auth().
 *  - userId siempre de auth.user.userId (anti-IDOR).
 *  - El registro es inmutable (no update ni delete).
 */
export default class AcceptanceController {
  /**
   * @swagger
   * /api/consent/me:
   *   get:
   *     summary: Estado de consentimiento del usuario autenticado
   *     description: |
   *       Devuelve si el usuario ya aceptó la versión vigente de T&C y aviso de privacidad.
   *       Incluye la versión vigente para que el cliente siempre sepa qué versión enviar al POST.
   *     security:
   *       - bearerAuth: []
   *     tags: [Consent]
   *     responses:
   *       200:
   *         description: Estado de consentimiento
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: object
   *                   properties:
   *                     accepted: { type: boolean }
   *                     currentVersion: { type: string, example: "1.0" }
   *                     acceptedVersion: { type: string, nullable: true }
   *                     acceptedAt: { type: string, format: date-time, nullable: true }
   */
  async getStatus(ctx: HttpContext) {
    const userId = ctx.auth.user!.userId
    const service = new AcceptanceService()
    const data = await service.getStatus(userId)

    return ctx.response.status(200).json({
      type: 'success',
      title: 'Consentimiento',
      message: 'Estado de consentimiento obtenido correctamente.',
      data,
    })
  }

  /**
   * @swagger
   * /api/consent/me:
   *   post:
   *     summary: Registra la aceptación de T&C y aviso de privacidad
   *     description: |
   *       Crea un registro inmutable de la aceptación. Idempotente: si el usuario
   *       ya aceptó la misma versión, devuelve el registro existente sin duplicar.
   *       La versión enviada debe coincidir con la versión vigente del servidor.
   *     security:
   *       - bearerAuth: []
   *     tags: [Consent]
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
   *     responses:
   *       200:
   *         description: Aceptación registrada (o ya existente)
   *       422:
   *         description: Versión inválida
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: error }
   *                 title: { type: string }
   *                 detail: { type: string }
   *                 key: { type: string, example: version-de-consentimiento-invalida }
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
      const data = await service.recordAcceptance(userId, payload.documentVersion)
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Consentimiento',
        message: 'Consentimiento registrado correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  private validationError(ctx: HttpContext, error: unknown) {
    return ctx.response.status(422).json({
      type: 'error',
      title: 'Error de validación',
      detail: error instanceof Error ? error.message : 'Datos inválidos.',
      key: 'version-de-consentimiento-invalida',
    })
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof ConsentError) {
      const status = CONSENT_ERROR_STATUS[error.key as ConsentErrorKey] ?? 500
      return ctx.response.status(status).json({
        type: 'error',
        title: ctx.i18n.t(`consent.errors.${error.key}.title`),
        detail: ctx.i18n.t(`consent.errors.${error.key}.detail`),
        key: error.key,
      })
    }
    throw error
  }
}

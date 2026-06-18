import { HttpContext } from '@adonisjs/core/http'
import OnboardingError from '#exceptions/onboarding_error'
import type { OnboardingErrorKey } from '#exceptions/onboarding_error'
import { ONBOARDING_ERROR_STATUS } from '#modules/onboarding/onboarding.constants'
import StateService from './state.service.js'
import { setIntentValidator } from './validators/set_intent.validator.js'
import { setStatusValidator } from './validators/set_status.validator.js'

/**
 * Controller del sub-módulo de estado de onboarding.
 * Gestiona las mutaciones: elegir intención, completar/omitir pasos y fijar status global.
 *
 * Seguridad:
 *  - Todos los endpoints requieren middleware.auth().
 *  - El userId siempre proviene de auth.user.userId; nunca del body (anti-IDOR).
 *  - Sin middleware.businessScope(): el onboarding es personal del admin del tenant.
 */
export default class StateController {
  /**
   * @swagger
   * /api/onboarding/me/intent:
   *   put:
   *     summary: Elige o cambia la intención del onboarding
   *     description: |
   *       Registra la intención (dolor principal) del usuario y transiciona el status
   *       a "in_progress". La respuesta devuelve el panorama completo ya ruteado a la rama.
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [intentSlug]
   *             properties:
   *               intentSlug:
   *                 type: string
   *                 description: Slug de un flujo activo (ej. attendance, vacations, records)
   *                 example: attendance
   *     responses:
   *       200:
   *         description: Intención guardada; panorama actualizado con la rama elegida
   *       422:
   *         description: Intención inválida (no existe o está inactiva)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: error }
   *                 title: { type: string }
   *                 detail: { type: string }
   *                 key: { type: string, example: intencion-de-onboarding-invalida }
   */
  async setIntent(ctx: HttpContext, service: StateService = new StateService()) {
    const { request, auth } = ctx
    const userId = auth.user!.userId

    let payload
    try {
      payload = await setIntentValidator.validate(request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const data = await service.setIntent(userId, payload.intentSlug)
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Intención de onboarding guardada correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/onboarding/me/steps/{stepSlug}/complete:
   *   post:
   *     summary: Marca un paso como completado (idempotente)
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     parameters:
   *       - name: stepSlug
   *         in: path
   *         required: true
   *         schema: { type: string }
   *         description: Slug del paso a completar
   *     responses:
   *       200:
   *         description: Paso marcado como completado; panorama actualizado
   *       404:
   *         description: Paso no encontrado, inactivo o fuera de la secuencia aplicable
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string, example: paso-de-onboarding-no-encontrado }
   */
  async completeStep(ctx: HttpContext, service: StateService = new StateService()) {
    const { request, auth } = ctx
    const userId = auth.user!.userId
    const stepSlug = request.param('stepSlug') as string

    try {
      const data = await service.completeStep(userId, stepSlug)
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Paso completado correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/onboarding/me/steps/{stepSlug}/skip:
   *   post:
   *     summary: Omite un paso omitible (idempotente)
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     parameters:
   *       - name: stepSlug
   *         in: path
   *         required: true
   *         schema: { type: string }
   *         description: Slug del paso a omitir
   *     responses:
   *       200:
   *         description: Paso omitido; panorama actualizado
   *       404:
   *         description: Paso no encontrado, inactivo o fuera de la secuencia aplicable
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string, example: paso-de-onboarding-no-encontrado }
   *       409:
   *         description: El paso no es omitible
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string, example: paso-de-onboarding-no-omitible }
   */
  async skipStep(ctx: HttpContext, service: StateService = new StateService()) {
    const { request, auth } = ctx
    const userId = auth.user!.userId
    const stepSlug = request.param('stepSlug') as string

    try {
      const data = await service.skipStep(userId, stepSlug)
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Paso omitido correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/onboarding/me/status:
   *   put:
   *     summary: Fija el status global del onboarding
   *     description: |
   *       Permite cerrar lógicamente el wizard (dismissed) o marcarlo como completado.
   *       El avance de pasos se conserva en ambos casos.
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status]
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [dismissed, completed]
   *     responses:
   *       200:
   *         description: Status actualizado; panorama actualizado
   *       422:
   *         description: Status inválido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string, example: status-de-onboarding-invalido }
   */
  async setStatus(ctx: HttpContext, service: StateService = new StateService()) {
    const { request, auth } = ctx
    const userId = auth.user!.userId

    let payload
    try {
      payload = await setStatusValidator.validate(request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const data = await service.setStatus(userId, payload.status)
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Status de onboarding actualizado correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers de respuesta de error
  // ---------------------------------------------------------------------------

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof OnboardingError) {
      const status = ONBOARDING_ERROR_STATUS[error.key as OnboardingErrorKey] ?? 500
      return ctx.response.status(status).json({
        type: status >= 500 ? 'error' : status === 404 ? 'warning' : 'error',
        title: error.title,
        message: error.detail,
        detail: error.detail,
        key: error.key,
      })
    }
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return ctx.response.status(500).json({
      type: 'error',
      title: 'Error del servidor',
      message: 'Ocurrió un error inesperado en el servidor.',
      error: message,
    })
  }

  private validationError(ctx: HttpContext, error: unknown) {
    const messages = (error as { messages?: unknown })?.messages
    const detail = 'La entrada no es válida.'
    return ctx.response.status(422).json({
      type: 'error',
      title: 'Parámetros inválidos',
      message: detail,
      detail,
      key: 'entrada-invalida',
      details: messages,
    })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { resolveBillingProviderApiError } from '#helpers/billing_provider_api_error'
import BillingProviderWebhookService from '#modules/billing-provider/billing_provider_webhook.service'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'

export default class BillingProviderWebhookController {
  /**
   * @swagger
   * /api/webhooks/stripe:
   *   post:
   *     tags:
   *       - Billing Webhooks
   *     summary: Recibir avisos firmados de Stripe
   *     description: >
   *       Endpoint público para webhooks de Stripe. Verifica la firma sobre el
   *       cuerpo crudo, registra el evento de forma idempotente y despacha la tarea
   *       registrada para su tipo. No requiere autenticación de usuario.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     parameters:
   *       - in: header
   *         name: stripe-signature
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Aviso recibido (procesado, ignorado o duplicado)
   *       400:
   *         description: Firma inválida o modo distinto
   *       500:
   *         description: Stripe no configurado o fallo de procesamiento
   */
  async stripe({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')

    try {
      const service = new BillingProviderWebhookService()
      await service.receive(
        BILLING_PROVIDER_KEYS.STRIPE,
        request.raw(),
        request.header('stripe-signature') ?? null
      )

      return response.status(200).json({
        type: 'success',
        data: { received: true },
      })
    } catch (error: unknown) {
      if (error instanceof BillingProviderServiceError) {
        const resolved = resolveBillingProviderApiError(error)
        return response.status(resolved.status).json({
          title: resolved.title,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.code,
        })
      }

      console.error('billing_provider_webhook: error no tipado', error)
      return response.status(500).json({
        title: 'Proveedor de cobro',
        detail: BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
        key: 'aviso-no-procesado',
        code: BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED,
      })
    }
  }
}

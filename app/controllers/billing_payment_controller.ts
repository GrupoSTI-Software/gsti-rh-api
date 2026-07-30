import type { HttpContext } from '@adonisjs/core/http'
import BillingPaymentService from '#services/billing_payment_service'
import { registerBillingPaymentValidator } from '#validators/billing_payment'
import { resolveBillingPaymentApiError } from '../helpers/billing_payment_api_error.js'

export default class BillingPaymentController {
  private readonly service = new BillingPaymentService()

  /**
   * @store
   * @summary Registrar pago con comprobante
   * @description Registra un pago manual sobre una suscripción existente y no cancelada.\
   *   De forma atómica: sube el comprobante privado, inserta el pago en el histórico,\
   *   avanza el periodo un ciclo mensual y pone la suscripción en estado `active`.\
   *   El monto se recibe en centavos; el avance del periodo lo calcula el servidor.\
   *   La descarga del comprobante es del endpoint de histórico (04-05).
   * @tag Billing · Payments
   * @operationId registerBillingPayment
   * @security [{"bearerAuth": []}]
   * @paramPath subscriptionId - ID interno de la suscripción - integer
   * @requestBody {"required": true, "content": {"multipart/form-data": {"schema": {"type": "object", "required": ["amountCents", "method", "paidAt", "receipt"], "properties": {"amountCents": {"type": "integer", "minimum": 100}, "method": {"type": "string", "enum": ["transfer", "cash", "other"]}, "reference": {"type": "string", "maxLength": 191}, "paidAt": {"type": "string", "format": "date-time"}, "receipt": {"type": "string", "format": "binary"}}}}}}
   * @responseBody 201 - {"type": "success", "data": {"billingPaymentId": 1, "billingSubscriptionId": 7, "amountCents": 927800, "method": "transfer", "reference": "SPEI-0099123", "paidAt": "2026-07-28T15:04:00.000-06:00", "periodStart": "2026-07-28", "periodEnd": "2026-08-28", "hasReceipt": true, "subscription": {"billingSubscriptionId": 7, "status": "active", "currentPeriodStart": "2026-07-28", "currentPeriodEnd": "2026-08-28"}}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.SUBSCRIPTION_NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.SUBSCRIPTION_CANCELED|PLT.PAY.AMOUNT_INVALID|PLT.PAY.RECEIPT_INVALID|PLT.PAY.VAL_INPUT"}
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(registerBillingPaymentValidator)

      const receipt = request.file('receipt')
      if (!receipt) {
        return response.status(422).json({
          title: 'Pagos de suscripción',
          detail: 'El comprobante es obligatorio.',
          key: 'comprobante-ausente',
          code: 'PLT.PAY.RECEIPT_INVALID',
        })
      }

      const result = await this.service.registerPayment(
        Number(params.subscriptionId),
        {
          amountCents: data.amountCents,
          method: data.method,
          reference: data.reference,
          paidAt: data.paidAt,
        },
        {
          tmpPath: receipt.tmpPath!,
          clientName: receipt.clientName,
          size: receipt.size,
          headers: { 'content-type': receipt.headers['content-type'] },
        }
      )

      return response.status(201).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingPaymentApiError(error)
      return response.status(status).json(body)
    }
  }
}

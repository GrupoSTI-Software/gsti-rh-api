import type { HttpContext } from '@adonisjs/core/http'
import BillingPaymentService from '#services/billing_payment_service'
import { listBillingPaymentsValidator, registerBillingPaymentValidator } from '#validators/billing_payment'
import { resolveBillingPaymentApiError } from '../helpers/billing_payment_api_error.js'

export default class BillingPaymentController {
  private readonly service = new BillingPaymentService()

  /**
   * @index
   * @summary Histórico de pagos de una suscripción
   * @description Devuelve el histórico paginado de pagos de una suscripción,\
   *   ordenado por fecha de pago descendente. Solo lectura.\
   *   La respuesta nunca incluye la URL pública del comprobante:\
   *   usa el endpoint de descarga para obtener el enlace temporal firmado.
   * @tag Billing · Payments
   * @operationId listBillingPayments
   * @security [{"bearerAuth": []}]
   * @paramPath subscriptionId - ID interno de la suscripción - integer
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "data": [], "meta": {"total": 0, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.SUBSCRIPTION_NOT_FOUND"}
   */
  async index({ params, request, response }: HttpContext) {
    try {
      const { page, limit } = await request.validateUsing(listBillingPaymentsValidator)
      const result = await this.service.listPayments(
        Number(params.subscriptionId),
        page ?? 1,
        limit ?? 20
      )
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status, ...body } = resolveBillingPaymentApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @download
   * @summary Enlace de descarga del comprobante
   * @description Genera un enlace temporal firmado para descargar el comprobante\
   *   de un pago. El enlace caduca en 24 horas y nunca es una URL pública.\
   *   El comprobante se obtuvo de forma privada al registrar el pago (04-03).
   * @tag Billing · Payments
   * @operationId downloadBillingPaymentReceipt
   * @security [{"bearerAuth": []}]
   * @paramPath paymentId - ID interno del pago - integer
   * @responseBody 200 - {"type": "success", "data": {"url": "https://...", "expiresIn": 86400}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.NOT_FOUND"}
   */
  async download({ params, response }: HttpContext) {
    try {
      const result = await this.service.getDownloadUrl(Number(params.paymentId))
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingPaymentApiError(error)
      return response.status(status).json(body)
    }
  }

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

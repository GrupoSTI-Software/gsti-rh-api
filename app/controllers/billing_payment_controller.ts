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
   * @show
   * @summary Detalle financiero de un pago
   * @description Devuelve un pago con su desglose financiero persistido al\
   *   asentarlo (USRH1785962095098): subtotal, descuento, impuesto, total,\
   *   monto y periodos cubiertos, saldo aplicado, saldo por adeudo aplicado\
   *   y saldo restante. Las cifras nunca se recalculan; son las que el\
   *   servidor guardó en `registerPayment`. `breakdownAvailable=false`\
   *   marca los pagos anteriores a USRH1785962095095, sin foto financiera\
   *   guardada — `breakdown` viaja en `null`, nunca en ceros como si fueran\
   *   datos reales. El pago se busca acotado a la suscripción de la ruta:\
   *   uno ajeno o inexistente responde el mismo `404 PLT.PAY.NOT_FOUND`.\
   *   Solo lectura; nunca incluye la Key ni una URL del comprobante.
   * @tag Billing · Payments
   * @operationId getBillingPaymentDetail
   * @security [{"bearerAuth": []}]
   * @paramPath subscriptionId - ID interno de la suscripción - integer
   * @paramPath paymentId - ID interno del pago - integer
   * @responseBody 200 - {"type": "success", "data": {"billingPaymentId": 12, "amountCents": 3000000, "method": "transfer", "reference": "SPEI-0099123", "paidAt": "2026-08-05T15:04:00.000-06:00", "periodStart": "2026-08-05", "periodEnd": "2026-11-05", "receiptAvailable": true, "periodsCovered": 3, "isCustomAmount": true, "periodAmountCents": 928000, "creditAppliedCents": 2784000, "debtAppliedCents": 0, "creditBalanceAfterCents": 216000, "breakdownAvailable": true, "breakdown": {"grossCents": 1000000, "discountPercent": 20.00, "discountAmountCents": 200000, "subtotalCents": 800000, "taxRate": 0.16, "taxAmountCents": 128000, "totalCents": 928000}}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "pago-no-encontrado", "code": "PLT.PAY.NOT_FOUND"}
   */
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.getPaymentDetail(
        Number(params.subscriptionId),
        Number(params.paymentId)
      )
      return response.status(200).json({ type: 'success', data })
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
   * @swagger
   * /api/platform/billing/subscriptions/{subscriptionId}/payments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Platform Billing
   *     summary: Registrar pago con comprobante
   *     description: |
   *       Registra un pago manual sobre una suscripción no cancelada. El monto del
   *       flujo normal lo gobierna el servidor desde el trato congelado
   *       (`contracted_total`) y no es editable; `allowCustomAmount: true` habilita
   *       un importe distinto explícito. De forma atómica: sube el comprobante
   *       privado, inserta el pago y aplica la prelación de cobro (USRH1785962095095
   *       v2): primero el adeudo prorrateado de un aumento `pending_payment` si existe
   *       (USRH1786107870856), después N periodos completos con el saldo restante,
   *       y el sobrante queda a favor de la suscripción.
   *       `appliedChange` es null si no había cambio vivo; trae el registro cuando
   *       quedó `applied` o `not_applicable`.
   *     operationId: registerBillingPayment
   *     parameters:
   *       - in: path
   *         name: subscriptionId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID interno de la suscripción
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - method
   *               - paidAt
   *               - receipt
   *             properties:
   *               amountCents:
   *                 type: integer
   *                 minimum: 100
   *                 description: Obligatorio solo con allowCustomAmount=true. Ignorado (salvo verificación de igualdad) en flujo normal.
   *               allowCustomAmount:
   *                 type: boolean
   *                 default: false
   *                 description: Declara de forma explícita el registro por importe distinto.
   *               method:
   *                 type: string
   *                 enum: [transfer, cash, other]
   *               reference:
   *                 type: string
   *                 maxLength: 191
   *               paidAt:
   *                 type: string
   *                 format: date-time
   *               receipt:
   *                 type: string
   *                 format: binary
   *                 description: Comprobante PDF, JPG o PNG (máx. 10 MB)
   *     responses:
   *       '201':
   *         description: Pago registrado; puede incluir cambio aplicado o not_applicable
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   enum: [success]
   *                 data:
   *                   type: object
   *                   properties:
   *                     billingPaymentId:
   *                       type: integer
   *                     billingSubscriptionId:
   *                       type: integer
   *                     amountCents:
   *                       type: integer
   *                     method:
   *                       type: string
   *                       enum: [transfer, cash, other]
   *                     reference:
   *                       type: string
   *                       nullable: true
   *                     paidAt:
   *                       type: string
   *                       format: date-time
   *                     periodStart:
   *                       type: string
   *                       format: date
   *                     periodEnd:
   *                       type: string
   *                       format: date
   *                     hasReceipt:
   *                       type: boolean
   *                     isCustomAmount:
   *                       type: boolean
   *                     periodAmountCents:
   *                       type: integer
   *                     periodsCovered:
   *                       type: integer
   *                     creditAppliedCents:
   *                       type: integer
   *                     debtAppliedCents:
   *                       type: integer
   *                       description: Dinero de este pago consumido cubriendo el adeudo del aumento (0856). 0 si no había.
   *                     creditBalanceAfterCents:
   *                       type: integer
   *                     subscription:
   *                       type: object
   *                       properties:
   *                         billingSubscriptionId:
   *                           type: integer
   *                         status:
   *                           type: string
   *                         currentPeriodStart:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                         currentPeriodEnd:
   *                           type: string
   *                           format: date
   *                           nullable: true
   *                         creditBalanceCents:
   *                           type: integer
   *                     appliedChange:
   *                       nullable: true
   *                       type: object
   *                       description: Cambio de aumento aplicado o not_applicable (0856)
   *                       properties:
   *                         billingSubscriptionChangeId:
   *                           type: integer
   *                         billingSubscriptionChangeStatus:
   *                           type: string
   *                           enum: [applied, not_applicable]
   *                         billingSubscriptionChangePreviousEmployees:
   *                           type: integer
   *                         billingSubscriptionChangeNewEmployees:
   *                           type: integer
   *                         billingSubscriptionChangeProratedAmountCents:
   *                           type: integer
   *       '404':
   *         description: Suscripción no encontrada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: PLT.PAY.SUBSCRIPTION_NOT_FOUND
   *       '422':
   *         description: Validación, suscripción cancelada o comprobante inválido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *                   enum:
   *                     - PLT.PAY.SUBSCRIPTION_CANCELED
   *                     - PLT.PAY.AMOUNT_NOT_ALLOWED
   *                     - PLT.PAY.AMOUNT_REQUIRED
   *                     - PLT.PAY.AMOUNT_INVALID
   *                     - PLT.PAY.PERIOD_AMOUNT_UNAVAILABLE
   *                     - PLT.PAY.PERIODS_OUT_OF_RANGE
   *                     - PLT.PAY.RECEIPT_INVALID
   *                     - PLT.PAY.VAL_INPUT
   *       '500':
   *         description: Fallo al aplicar aumento, snapshot inconsistente o error interno
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *                   enum:
   *                     - PLT.PAY.CHANGE_APPLY_FAILED
   *                     - PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT
   *                     - PLT.PAY.RECEIPT_UPLOAD_FAILED
   *                     - PLT.PAY.SYS_UNHANDLED
   */
  /**
   * @store
   * @summary Registrar pago con comprobante
   * @description Registra un pago manual sobre una suscripción existente y no cancelada.\
   *   El monto del flujo normal lo gobierna el servidor desde el trato congelado\
   *   de la suscripción (`contracted_total`); no es editable por el cliente.\
   *   `allowCustomAmount: true` habilita la captura explícita de un importe\
   *   distinto (parcial o mayor), validado con las cotas del servidor.\
   *   De forma atómica: sube el comprobante privado, inserta el pago y aplica\
   *   la prelación de cobro (USRH1785962095095 v2): primero cubre el adeudo\
   *   prorrateado de un aumento `pending_payment` si existe (USRH1786107870856),\
   *   después traduce el resto del saldo disponible en N periodos completos\
   *   (extiende `current_period_end` esos meses solo si periodsCovered ≥ 1)\
   *   y el sobrante queda a favor de la suscripción. Cubrir solo el adeudo\
   *   libera el cupo de inmediato pero no pone la suscripción en `active`.\
   *   `appliedChange` es null si no había cambio vivo; trae el registro cuando\
   *   quedó `applied` o `not_applicable`.\
   *   La descarga del comprobante es del endpoint de histórico (04-05).
   * @tag Billing · Payments
   * @operationId registerBillingPayment
   * @security [{"bearerAuth": []}]
   * @paramPath subscriptionId - ID interno de la suscripción - integer
   * @requestBody {"required": true, "content": {"multipart/form-data": {"schema": {"type": "object", "required": ["method", "paidAt", "receipt"], "properties": {"amountCents": {"type": "integer", "minimum": 100, "description": "Obligatorio solo con allowCustomAmount=true. En flujo normal, si se envía, debe coincidir con el monto gobernado del periodo."}, "allowCustomAmount": {"type": "boolean", "default": false, "description": "Declara de forma explícita el registro por importe distinto."}, "method": {"type": "string", "enum": ["transfer", "cash", "other"]}, "reference": {"type": "string", "maxLength": 191}, "paidAt": {"type": "string", "format": "date-time"}, "receipt": {"type": "string", "format": "binary"}}}}}}
   * @responseBody 201 - {"type": "success", "data": {"billingPaymentId": 12, "billingSubscriptionId": 7, "amountCents": 3000000, "method": "transfer", "reference": "SPEI-0099123", "paidAt": "2026-08-05T15:04:00.000-06:00", "periodStart": "2026-08-05", "periodEnd": "2026-11-05", "hasReceipt": true, "isCustomAmount": true, "periodAmountCents": 927800, "periodsCovered": 3, "creditAppliedCents": 2783400, "debtAppliedCents": 0, "creditBalanceAfterCents": 216600, "subscription": {"billingSubscriptionId": 7, "status": "active", "currentPeriodStart": "2026-08-05", "currentPeriodEnd": "2026-11-05", "creditBalanceCents": 216600}, "appliedChange": null}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.SUBSCRIPTION_NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.SUBSCRIPTION_CANCELED|PLT.PAY.AMOUNT_NOT_ALLOWED|PLT.PAY.AMOUNT_REQUIRED|PLT.PAY.AMOUNT_INVALID|PLT.PAY.PERIOD_AMOUNT_UNAVAILABLE|PLT.PAY.PERIODS_OUT_OF_RANGE|PLT.PAY.RECEIPT_INVALID|PLT.PAY.VAL_INPUT"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.PAY.CHANGE_APPLY_FAILED|PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT|PLT.PAY.RECEIPT_UPLOAD_FAILED|PLT.PAY.SYS_UNHANDLED"}
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
          allowCustomAmount: data.allowCustomAmount,
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

import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { resolveBillingTaxReceiptApiError } from '#helpers/billing_tax_receipt_api_error'
import BillingTaxReceiptService from '#services/billing_tax_receipt_service'
import { storeTaxReceiptValidator } from '#validators/billing_tax_receipt.validator'

/**
 * Alta y lectura del comprobante fiscal de membresía (USRH1788288461963).
 *
 * Contrato de éxito: `{ type: 'success', data: TaxReceiptView | null }`.
 * Errores: `{ title, detail, key, code }` con prefijo `PLT.TAX.*`.
 */
export default class BillingTaxReceiptController {
  private readonly service = new BillingTaxReceiptService()

  /**
   * @swagger
   * /api/platform/billing/payments/{paymentId}/tax-receipt:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Registrar el comprobante fiscal de un pago
   *     description: |
   *       Registra el CFDI ya timbrado (fuera de la plataforma) contra el pago
   *       que lo originó. Congela el perfil fiscal vivo del cliente y copia el
   *       desglose de importes del pago. No recibe RFC ni importes en el body.
   *       `xmlAvailable`, `pdfAvailable` y `cancellation` nacen reservados
   *       (rebanadas 3 y 7) y no se llenan aquí.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: paymentId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID interno del pago
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - uuid
   *               - stampedAt
   *             properties:
   *               uuid:
   *                 type: string
   *                 description: Folio fiscal (forma canónica, 36 caracteres)
   *                 example: 3f2504e0-4f89-41d3-9a0c-0305e82c3301
   *               series:
   *                 type: string
   *                 maxLength: 25
   *                 nullable: true
   *                 example: A
   *               folio:
   *                 type: string
   *                 maxLength: 40
   *                 nullable: true
   *                 example: "1042"
   *               stampedAt:
   *                 type: string
   *                 format: date-time
   *                 description: Fecha y hora de timbrado; no futura (tolerancia 5 min)
   *     responses:
   *       '201':
   *         description: Comprobante registrado
   *       '401':
   *         description: Sin sesión
   *       '403':
   *         description: Sin permiso de administrador de plataforma
   *       '404':
   *         description: Pago no encontrado
   *       '409':
   *         description: Ya hay un vivo o el folio fiscal ya está registrado
   *       '422':
   *         description: Validación, perfil incompleto o pago sin desglose
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(storeTaxReceiptValidator)
      const receipt = await this.service.create(Number(params.paymentId), {
        uuid: data.uuid,
        series: data.series ?? null,
        folio: data.folio ?? null,
        stampedAt: DateTime.fromISO(data.stampedAt),
      })
      const view = await this.service.toView(receipt)
      return response.status(201).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveBillingTaxReceiptApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/payments/{paymentId}/tax-receipt:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Consultar el comprobante fiscal vivo de un pago
   *     description: |
   *       Devuelve el comprobante `issued` del pago, o `data: null` si todavía
   *       no se factura (situación normal, no es 404). El RFC congelado viaja
   *       en claro para cotejar contra lo timbrado. `xmlAvailable` y
   *       `pdfAvailable` están reservados (siempre false en esta rebanada);
   *       `cancellation` está reservado (siempre null).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: paymentId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID interno del pago
   *     responses:
   *       '200':
   *         description: Comprobante vivo o `data` nulo si está pendiente de facturar
   *       '401':
   *         description: Sin sesión
   *       '403':
   *         description: Sin permiso de administrador de plataforma
   *       '404':
   *         description: Pago no encontrado
   */
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.getLiveByPayment(Number(params.paymentId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveBillingTaxReceiptApiError(error)
      return response.status(status).json(body)
    }
  }
}

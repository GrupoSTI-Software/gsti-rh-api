import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { resolveBillingTaxReceiptApiError } from '#helpers/billing_tax_receipt_api_error'
import BillingTaxReceiptService from '#services/billing_tax_receipt_service'
import {
  cancelTaxReceiptValidator,
  downloadTaxReceiptFileValidator,
  storeTaxReceiptValidator,
} from '#validators/billing_tax_receipt.validator'

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
   *       `xml` y `pdf` son opcionales: un acuse incompleto no bloquea el alta.
   *       El XML se guarda opaco (`application/octet-stream`); el MIME real
       *       queda en la fila. Tras cancelar, la respuesta incluye `cancellation`
       *       con motivo, fecha y folio sustituto cuando aplique.
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
   *               xml:
   *                 type: string
   *                 format: binary
   *                 description: XML del CFDI (opcional, tope 1 MB)
   *               pdf:
   *                 type: string
   *                 format: binary
   *                 description: Representación impresa (opcional, tope 5 MB)
   *     responses:
   *       '201':
   *         description: Comprobante registrado. xmlAvailable/pdfAvailable según archivos
   *       '401':
   *         description: Sin sesión
   *       '403':
   *         description: Sin permiso de administrador de plataforma
   *       '404':
   *         description: '{"title":"Pago no encontrado","key":"pago-no-encontrado","code":"PLT.TAX.PAYMENT_NOT_FOUND"}'
   *       '409':
   *         description: Vivo existente o folio fiscal ya registrado (PLT.TAX.LIVE_RECEIPT_EXISTS / UUID_ALREADY_REGISTERED)
   *       '422':
   *         description: |
   *           Validación o archivo. Códigos: PLT.TAX.VAL_INPUT, INVALID_UUID_FORMAT,
   *           BILLING_PROFILE_INCOMPLETE, PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT,
   *           FILE_TYPE_NOT_ALLOWED (key archivo-no-permitido),
   *           FILE_TOO_LARGE (key archivo-demasiado-grande; el detail nombra el límite en MB).
   *           HTTP de validación 422, no 400.
   *       '500':
   *         description: '{"title":"No fue posible guardar el archivo","key":"no-fue-posible-guardar-el-archivo","code":"PLT.TAX.FILE_UPLOAD_FAILED"}'
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(storeTaxReceiptValidator)
      const receipt = await this.service.create(
        Number(params.paymentId),
        {
          uuid: data.uuid,
          series: data.series ?? null,
          folio: data.folio ?? null,
          stampedAt: DateTime.fromISO(data.stampedAt),
        },
        {
          xml: request.file('xml'),
          pdf: request.file('pdf'),
        }
      )
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
       *       `pdfAvailable` indican si hay archivo resguardado. `cancellation`
       *       es `null` mientras el comprobante siga vivo.
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

  /**
   * @swagger
   * /api/platform/billing/payments/{paymentId}/tax-receipts:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Consultar la historia fiscal completa de un pago
   *     description: |
   *       Devuelve todos los comprobantes del pago —vivo y cancelados— ordenados
   *       por fecha de timbrado descendente. Cada elemento es el DTO completo.
   *       Un pago sin comprobantes responde `data: []`.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: paymentId
   *         required: true
   *         schema:
   *           type: integer
     *     responses:
     *       '200':
     *         description: Historia fiscal completa o colección vacía
     *       '401':
     *         description: Sin sesión
     *       '403':
     *         description: Sin permiso de administrador de plataforma
     *       '404':
     *         description: '{"title":"Pago no encontrado","key":"pago-no-encontrado","code":"PLT.TAX.PAYMENT_NOT_FOUND"}'
   */
  async index({ params, response }: HttpContext) {
    try {
      const data = await this.service.listByPayment(Number(params.paymentId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveBillingTaxReceiptApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/tax-receipts/{taxReceiptId}/cancel:
   *   post:
   *     tags:
   *       - Platform Billing
   *     summary: Registrar la cancelación de un comprobante fiscal
   *     description: |
   *       Refleja en la plataforma que el comprobante ya fue cancelado fuera del
   *       sistema. No ejecuta cancelación ante el SAT. Libera el lugar del
   *       comprobante vivo del pago. El folio sustituto es obligatorio solo si
   *       el motivo del catálogo lo exige (`requiresSubstitute`).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: taxReceiptId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - cancellationReasonCode
   *               - cancelledAt
   *             properties:
   *               cancellationReasonCode:
   *                 type: string
   *                 example: "02"
   *               cancelledAt:
   *                 type: string
   *                 format: date-time
   *               substituteUuid:
   *                 type: string
   *                 nullable: true
     *     responses:
     *       '200':
     *         description: Comprobante cancelado con DTO completo y `cancellation` lleno
     *       '401':
     *         description: Sin sesión
     *       '403':
     *         description: Sin permiso de administrador de plataforma
     *       '404':
     *         description: '{"title":"Comprobante no encontrado","key":"comprobante-no-encontrado","code":"PLT.TAX.TAX_RECEIPT_NOT_FOUND"}'
     *       '409':
     *         description: '{"title":"Comprobante ya cancelado","key":"comprobante-ya-cancelado","code":"PLT.TAX.ALREADY_CANCELLED"}'
     *       '422':
     *         description: |
     *           Validación o reglas de negocio. Códigos: PLT.TAX.VAL_INPUT,
     *           UNKNOWN_CANCELLATION_REASON (motivo-de-cancelacion-desconocido),
     *           SUBSTITUTE_UUID_REQUIRED (folio-sustituto-requerido),
     *           SUBSTITUTE_UUID_NOT_ALLOWED (folio-sustituto-no-aplica),
     *           INVALID_UUID_FORMAT (folio-fiscal-invalido),
     *           CANCELLED_AT_BEFORE_STAMPED (fecha-de-cancelacion-anterior-al-timbrado).
   */
  async cancel({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(cancelTaxReceiptValidator)
      const receipt = await this.service.cancel(Number(params.taxReceiptId), {
        cancellationReasonCode: data.cancellationReasonCode,
        cancelledAt: DateTime.fromISO(data.cancelledAt),
        substituteUuid: data.substituteUuid ?? null,
      })
      const view = await this.service.toView(receipt)
      return response.status(200).json({ type: 'success', data: view })
    } catch (error) {
      const { status, ...body } = resolveBillingTaxReceiptApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/tax-receipts/{taxReceiptId}/files/{fileType}/download:
   *   get:
   *     tags:
   *       - Platform Billing
   *     summary: Descargar un archivo del comprobante fiscal
   *     description: |
   *       Devuelve un acceso temporal firmado de 300 segundos, distinto en
   *       cada solicitud. La URL nunca se persiste ni viaja en la lectura
   *       del comprobante. `fileType` solo admite `xml` o `pdf`.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: taxReceiptId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID interno del comprobante fiscal
   *       - in: path
   *         name: fileType
   *         required: true
   *         schema:
   *           type: string
   *           enum: [xml, pdf]
   *         description: Archivo electrónico o representación impresa
   *     responses:
   *       '200':
   *         description: '{"type":"success","data":{"url":"https://...","expiresIn":300}}'
   *       '401':
   *         description: Sin sesión
   *       '403':
   *         description: Sin permiso de administrador de plataforma
   *       '404':
   *         description: |
   *           Mismo HTTP para comprobante inexistente y archivo ausente.
   *           PLT.TAX.TAX_RECEIPT_NOT_FOUND (key comprobante-no-encontrado) o
   *           PLT.TAX.FILE_NOT_AVAILABLE (key archivo-no-disponible). Nunca 500 con el mensaje de S3.
   *       '422':
   *         description: '{"title":"Comprobante fiscal","key":"datos-invalidos","code":"PLT.TAX.VAL_INPUT"}'
   */
  async download({ params, auth, response }: HttpContext) {
    try {
      const data = await downloadTaxReceiptFileValidator.validate({
        taxReceiptId: Number(params.taxReceiptId),
        fileType: params.fileType,
      })
      const result = await this.service.getDownloadUrl(
        data.taxReceiptId,
        data.fileType,
        auth.user?.userId
      )
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolveBillingTaxReceiptApiError(error)
      return response.status(status).json(body)
    }
  }
}

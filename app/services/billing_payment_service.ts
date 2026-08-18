import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import type { BillingPaymentMethod } from '#models/billing_payment'
import UploadService from '#services/upload_service'
import { BILLING_PAYMENT_ERROR_CODES } from '../constants/billing_payment_error_codes.js'
import { BillingPaymentServiceError } from '../exceptions/billing_payment_service_error.js'
import { todayInBusinessZone, toCalendarIsoDate } from '../utils/business_date.js'
import { RECEIPT_MAX_BYTES, RECEIPT_ALLOWED_MIMES } from '../validators/billing_payment.js'

// ─── Carpeta S3 de comprobantes ───────────────────────────────────────────────
const RECEIPT_S3_FOLDER = 'billing/payments/receipts'

// ─── Cotas de monto (centavos): solo rigen el flujo de importe distinto ──────
const AMOUNT_MIN_CENTS = 100
const AMOUNT_MAX_CENTS = 99_999_999

// ─── Tope de periodos que un solo pago puede cubrir (regla 7, valor propuesto) ─
const MAX_PERIODS_PER_PAYMENT = 24

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface RegisterPaymentInput {
  /** Obligatorio solo con allowCustomAmount=true. Ignorado (salvo verificación de igualdad) en flujo normal. */
  amountCents?: number
  /** Capacidad explícita de importe distinto al monto gobernado del periodo. Default false. */
  allowCustomAmount?: boolean
  method: BillingPaymentMethod
  reference?: string | null
  paidAt: string
}

export interface ReceiptFile {
  tmpPath: string
  clientName: string
  size: number
  headers: { 'content-type'?: string }
}

export interface PaymentListItem {
  billingPaymentId: number
  amountCents: number
  method: BillingPaymentMethod
  reference: string | null
  paidAt: string
  periodStart: string | null
  periodEnd: string | null
  receiptAvailable: boolean
}

export interface RegisterPaymentResult {
  billingPaymentId: number
  billingSubscriptionId: number
  amountCents: number
  method: BillingPaymentMethod
  reference: string | null
  paidAt: string
  periodStart: string | null
  periodEnd: string | null
  hasReceipt: boolean
  isCustomAmount: boolean
  periodAmountCents: number
  periodsCovered: number
  creditAppliedCents: number
  creditBalanceAfterCents: number
  subscription: {
    billingSubscriptionId: number
    status: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    creditBalanceCents: number
  }
}

/** Foto financiera del periodo cobrado, derivada del trato congelado (regla 12). */
interface FinancialSnapshot {
  grossCents: number
  discountAmountCents: number
  subtotalCents: number
  taxAmountCents: number
  totalCents: number
  discountPercent: number
  taxRate: number
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Servicio de pagos de suscripción (USRH1784574994922, gobernado desde
 * USRH1785962095095).
 *
 * Registrar un pago es un acto atómico:
 *   1. Valida existencia/estado y resuelve el monto gobernado del periodo
 *      con una lectura simple (fail-fast, antes de tocar S3).
 *   2. Sube el comprobante a S3 privado (fuera de la trx — S3 no es transaccional).
 *   3. Abre db.transaction: recarga la suscripción con `.forUpdate()`, revalida
 *      `canceled` (protección de carrera), acumula saldo, traduce saldo en
 *      periodos completos, decide estado y persiste la foto financiera del pago.
 *   4. Si la trx falla → compensa borrando el objeto S3 subido.
 *
 * El módulo NUNCA expone la URL del comprobante (solo la Key queda en BD).
 * El monto del flujo normal lo gobierna el servidor desde
 * `billing_subscription_contracted_total`; el cliente solo influye en el
 * importe a través de la capacidad explícita `allowCustomAmount`.
 */
export default class BillingPaymentService {
  /**
   * Registra un pago sobre una suscripción existente y no cancelada.
   *
   * @throws {BillingPaymentServiceError} si la suscripción no existe, está
   *   cancelada, el monto no está permitido o fuera de cotas, el monto del
   *   periodo es indeterminable, el importe cubriría más periodos que el
   *   tope, o el comprobante no pasa validación.
   */
  async registerPayment(
    subscriptionId: number,
    input: RegisterPaymentInput,
    receipt: ReceiptFile
  ): Promise<RegisterPaymentResult> {
    const allowCustomAmount = input.allowCustomAmount === true

    // ── 1. Validaciones fail-fast (lectura simple, antes de subir a S3) ─────
    const preCheckSubscription = await this.loadSubscriptionOrFail(subscriptionId)
    this.assertNotCanceled(subscriptionId, preCheckSubscription)
    this.resolveGovernedAmount(preCheckSubscription, input, allowCustomAmount)

    // ── 2. Validar y subir comprobante (fuera de la trx) ────────────────────
    this.validateReceipt(receipt)

    const receiptMime = receipt.headers['content-type'] ?? 'application/octet-stream'
    const ext = this.extFromMime(receiptMime)
    const s3RelativeKey = `${RECEIPT_S3_FOLDER}/${subscriptionId}/${Date.now()}-receipt.${ext}`

    const uploadService = new UploadService()
    const { default: fs } = await import('node:fs/promises')
    const buffer = await fs.readFile(receipt.tmpPath)

    const s3Key = await uploadService.uploadPrivateBuffer(s3RelativeKey, buffer, receiptMime)

    if (!s3Key) {
      throw new BillingPaymentServiceError(
        'Fallo al subir el comprobante a S3',
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_UPLOAD_FAILED,
        500,
        'comprobante-upload-fallido',
        'No se pudo guardar el comprobante. Intenta de nuevo.'
      )
    }

    // ── 3. Transacción atómica (saldo + periodo + pago) ─────────────────────
    let result: { payment: BillingPayment; subscription: BillingSubscription }
    try {
      result = await db.transaction(async (trx) => {
        // Concurrencia del saldo (spec §12): recarga bloqueante dentro de la trx.
        const subscription = await BillingSubscription.query({ client: trx })
          .where('billingSubscriptionId', subscriptionId)
          .whereNull('billing_subscription_deleted_at')
          .forUpdate()
          .first()

        if (!subscription) {
          throw new BillingPaymentServiceError(
            `Suscripción ${subscriptionId} no encontrada`,
            BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
            404,
            'suscripcion-no-encontrada',
            'La suscripción solicitada no existe.'
          )
        }

        this.assertNotCanceled(subscriptionId, subscription)

        const periodAmountCents = this.resolveGovernedAmount(subscription, input, allowCustomAmount)
        const amountAsentado = allowCustomAmount ? input.amountCents! : periodAmountCents

        // ── Regla 4: acumulación ──────────────────────────────────────────
        const saldoDisponible = subscription.billingSubscriptionCreditBalanceCents + amountAsentado

        // ── Regla 5, 6: periodos completos + tope (regla 7) ───────────────
        const periodsCovered = Math.floor(saldoDisponible / periodAmountCents)

        if (periodsCovered > MAX_PERIODS_PER_PAYMENT) {
          throw new BillingPaymentServiceError(
            `El pago cubriría ${periodsCovered} periodos, por encima del tope ${MAX_PERIODS_PER_PAYMENT}`,
            BILLING_PAYMENT_ERROR_CODES.PERIODS_OUT_OF_RANGE,
            422,
            'periodos-fuera-de-rango',
            'El importe cubriría más periodos que el máximo permitido por pago.'
          )
        }

        const creditAppliedCents = periodsCovered * periodAmountCents
        const creditBalanceAfterCents = saldoDisponible - creditAppliedCents

        let newPeriodStart: DateTime | null = null
        let newPeriodEnd: DateTime | null = null

        if (periodsCovered >= 1) {
          const today = todayInBusinessZone()
          const rawPeriodEnd = subscription.billingSubscriptionCurrentPeriodEnd
          const periodEndIso = rawPeriodEnd ? toCalendarIsoDate(rawPeriodEnd) : null

          // anchor = current_period_end si ≥ hoy, si no hoy (semántica conservada)
          const anchor =
            periodEndIso && periodEndIso >= today.toISODate()!
              ? DateTime.fromISO(periodEndIso, { zone: today.zone })
              : today

          newPeriodStart = anchor
          newPeriodEnd = anchor.plus({ months: periodsCovered })
        }

        const snapshot = this.computeFinancialSnapshot(subscription)
        const paidAtDt = DateTime.fromISO(input.paidAt)

        const newPayment = await BillingPayment.create(
          {
            billingSubscriptionId: subscriptionId,
            billingPaymentAmountCents: amountAsentado,
            billingPaymentPeriodAmountCents: periodAmountCents,
            billingPaymentPeriodsCovered: periodsCovered,
            billingPaymentCreditAppliedCents: creditAppliedCents,
            billingPaymentCreditBalanceAfterCents: creditBalanceAfterCents,
            billingPaymentIsCustomAmount: allowCustomAmount,
            billingPaymentGrossCents: snapshot.grossCents,
            billingPaymentDiscountAmountCents: snapshot.discountAmountCents,
            billingPaymentSubtotalCents: snapshot.subtotalCents,
            billingPaymentTaxAmountCents: snapshot.taxAmountCents,
            billingPaymentTotalCents: snapshot.totalCents,
            billingPaymentDiscountPercent: snapshot.discountPercent,
            billingPaymentTaxRate: snapshot.taxRate,
            billingPaymentMethod: input.method,
            billingPaymentReference: input.reference ?? null,
            billingPaymentReceiptPath: s3Key,
            billingPaymentReceiptMime: receiptMime,
            billingPaymentProvider: 'manual',
            billingPaymentPaidAt: paidAtDt,
            billingPaymentPeriodStart: newPeriodStart,
            billingPaymentPeriodEnd: newPeriodEnd,
          },
          { client: trx }
        )

        subscription.billingSubscriptionCreditBalanceCents = creditBalanceAfterCents

        // Regla 5, 6: solo se extiende periodo y estado con ≥ 1 periodo cubierto.
        if (periodsCovered >= 1) {
          subscription.billingSubscriptionStatus = 'active'
          subscription.billingSubscriptionCurrentPeriodStart = newPeriodStart
          subscription.billingSubscriptionCurrentPeriodEnd = newPeriodEnd
          // Sincronizar columna espejo si venía de un estado a reactivar
          if (!subscription.billingSubscriptionLiveBusinessUnitId) {
            subscription.billingSubscriptionLiveBusinessUnitId = subscription.businessUnitId
          }
        }

        await subscription.save()

        return { payment: newPayment, subscription }
      })
    } catch (error) {
      // Compensación: borrar el objeto S3 subido antes de la trx
      await uploadService.deleteFile(s3Key).catch(() => null)
      throw error
    }

    return this.toResult(result.payment, result.subscription)
  }

  // ─── Validaciones de suscripción ──────────────────────────────────────────

  private async loadSubscriptionOrFail(subscriptionId: number): Promise<BillingSubscription> {
    const subscription = await BillingSubscription.query()
      .where('billingSubscriptionId', subscriptionId)
      .whereNull('billing_subscription_deleted_at')
      .first()

    if (!subscription) {
      throw new BillingPaymentServiceError(
        `Suscripción ${subscriptionId} no encontrada`,
        BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
        404,
        'suscripcion-no-encontrada',
        'La suscripción solicitada no existe.'
      )
    }

    return subscription
  }

  private assertNotCanceled(subscriptionId: number, subscription: BillingSubscription): void {
    if (subscription.billingSubscriptionStatus === 'canceled') {
      throw new BillingPaymentServiceError(
        `Suscripción ${subscriptionId} está cancelada`,
        BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
        422,
        'suscripcion-cancelada',
        'No se puede registrar un pago sobre una suscripción cancelada.'
      )
    }
  }

  // ─── Monto gobernado (reglas 1-3) ─────────────────────────────────────────

  /**
   * Resuelve el monto del periodo desde el trato congelado y valida el
   * monto de la petición contra las reglas del flujo (normal vs. importe
   * distinto). Devuelve `periodAmountCents` (monto del periodo gobernado).
   *
   * @throws {BillingPaymentServiceError} PERIOD_AMOUNT_UNAVAILABLE,
   *   AMOUNT_NOT_ALLOWED, AMOUNT_REQUIRED o AMOUNT_INVALID según el caso.
   */
  private resolveGovernedAmount(
    subscription: BillingSubscription,
    input: RegisterPaymentInput,
    allowCustomAmount: boolean
  ): number {
    const periodAmountCents = this.toPeriodAmountCents(subscription.billingSubscriptionContractedTotal)

    if (periodAmountCents === null) {
      throw new BillingPaymentServiceError(
        `Suscripción ${subscription.billingSubscriptionId}: contracted_total no permite determinar el monto del periodo`,
        BILLING_PAYMENT_ERROR_CODES.PERIOD_AMOUNT_UNAVAILABLE,
        422,
        'monto-periodo-no-disponible',
        'No fue posible determinar el monto del periodo desde el trato de la suscripción.'
      )
    }

    if (!allowCustomAmount) {
      if (input.amountCents !== undefined && input.amountCents !== periodAmountCents) {
        throw new BillingPaymentServiceError(
          `amountCents (${input.amountCents}) distinto al monto gobernado del periodo (${periodAmountCents})`,
          BILLING_PAYMENT_ERROR_CODES.AMOUNT_NOT_ALLOWED,
          422,
          'monto-no-permitido',
          'El monto del pago lo determina el trato de la suscripción y no es editable.'
        )
      }
      return periodAmountCents
    }

    // ── Importe distinto explícito (regla 3) ──────────────────────────────
    if (input.amountCents === undefined) {
      throw new BillingPaymentServiceError(
        'allowCustomAmount=true requiere amountCents',
        BILLING_PAYMENT_ERROR_CODES.AMOUNT_REQUIRED,
        422,
        'monto-requerido',
        'Debes indicar el monto cuando el registro es de importe distinto.'
      )
    }

    if (
      !Number.isInteger(input.amountCents) ||
      input.amountCents < AMOUNT_MIN_CENTS ||
      input.amountCents > AMOUNT_MAX_CENTS
    ) {
      throw new BillingPaymentServiceError(
        `Monto inválido: ${input.amountCents} centavos`,
        BILLING_PAYMENT_ERROR_CODES.AMOUNT_INVALID,
        422,
        'monto-invalido',
        `El monto debe ser un entero positivo entre ${AMOUNT_MIN_CENTS} y ${AMOUNT_MAX_CENTS} centavos.`
      )
    }

    return periodAmountCents
  }

  /** Convierte el trato congelado (pesos, decimal) a centavos con redondeo único. Null si no es determinable. */
  private toPeriodAmountCents(contractedTotal: unknown): number | null {
    const value = Number(contractedTotal)
    if (!Number.isFinite(value) || value <= 0) {
      return null
    }
    return Math.round(value * 100)
  }

  // ─── Foto financiera (regla 12; secuencia de resolvePrice) ────────────────

  private computeFinancialSnapshot(subscription: BillingSubscription): FinancialSnapshot {
    const unitAmount = Number(subscription.billingSubscriptionContractedUnitAmount)
    const employees = subscription.billingSubscriptionContractedEmployees
    const discountPercent = Number(subscription.billingSubscriptionDiscountPercent)
    const taxRate = Number(subscription.billingSubscriptionContractedTaxRate)

    const grossAmount = unitAmount * employees
    const discountAmount = this.round2(grossAmount * (discountPercent / 100))
    const subtotal = this.round2(grossAmount - discountAmount)
    const taxAmount = this.round2(subtotal * taxRate)
    const total = this.round2(subtotal + taxAmount)

    return {
      grossCents: Math.round(grossAmount * 100),
      discountAmountCents: Math.round(discountAmount * 100),
      subtotalCents: Math.round(subtotal * 100),
      taxAmountCents: Math.round(taxAmount * 100),
      totalCents: Math.round(total * 100),
      discountPercent,
      taxRate,
    }
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  // ─── Validación del comprobante ───────────────────────────────────────────

  private validateReceipt(receipt: ReceiptFile): void {
    if (!receipt?.tmpPath) {
      throw new BillingPaymentServiceError(
        'Comprobante ausente',
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
        422,
        'comprobante-ausente',
        'El comprobante es obligatorio.'
      )
    }

    const mime = receipt.headers['content-type'] ?? ''
    if (!(RECEIPT_ALLOWED_MIMES as readonly string[]).includes(mime)) {
      throw new BillingPaymentServiceError(
        `Tipo de comprobante no permitido: ${mime}`,
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
        422,
        'comprobante-tipo-invalido',
        'El comprobante debe ser PDF, JPG o PNG.'
      )
    }

    if (typeof receipt.size === 'number' && receipt.size > RECEIPT_MAX_BYTES) {
      throw new BillingPaymentServiceError(
        `Comprobante excede el tope: ${receipt.size} bytes`,
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
        422,
        'comprobante-muy-grande',
        `El comprobante no puede superar ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.`
      )
    }
  }

  // ─── Listado de pagos (histórico) ────────────────────────────────────────

  /**
   * Devuelve el histórico paginado de pagos de una suscripción,
   * ordenado por fecha de pago descendente.
   *
   * @throws {BillingPaymentServiceError} si la suscripción no existe.
   */
  async listPayments(
    subscriptionId: number,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    data: PaymentListItem[]
    meta: { total: number; page: number; limit: number; lastPage: number }
  }> {
    const subscription = await BillingSubscription.query()
      .where('billingSubscriptionId', subscriptionId)
      .whereNull('billing_subscription_deleted_at')
      .first()

    if (!subscription) {
      throw new BillingPaymentServiceError(
        `Suscripción ${subscriptionId} no encontrada`,
        BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
        404,
        'suscripcion-no-encontrada',
        'La suscripción solicitada no existe.'
      )
    }

    const paginated = await BillingPayment.query()
      .where('billingSubscriptionId', subscriptionId)
      .orderBy('billingPaymentPaidAt', 'desc')
      .paginate(page, limit)

    const json = paginated.toJSON()

    return {
      data: (json.data as BillingPayment[]).map((p) => this.toListItem(p)),
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  // ─── Descarga firmada del comprobante ─────────────────────────────────────

  /**
   * Genera un enlace temporal firmado para descargar el comprobante de un pago.
   * La URL caduca en 24 horas (valor por defecto de `getDownloadLink`).
   *
   * @throws {BillingPaymentServiceError} si el pago no existe o no tiene comprobante.
   */
  async getDownloadUrl(paymentId: number): Promise<{ url: string; expiresIn: number }> {
    const payment = await BillingPayment.find(paymentId)

    if (!payment?.billingPaymentReceiptPath) {
      throw new BillingPaymentServiceError(
        `Pago ${paymentId} no encontrado o sin comprobante`,
        BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
        404,
        'pago-no-encontrado',
        'No existe un pago con comprobante para el identificador indicado.'
      )
    }

    const uploadService = new UploadService()
    const expireSeconds = 60 * 60 * 24
    const result = await uploadService.getDownloadLink(
      payment.billingPaymentReceiptPath,
      expireSeconds
    )

    // getDownloadLink devuelve string en éxito u objeto {status,...} en error
    if (typeof result !== 'string') {
      throw new BillingPaymentServiceError(
        `No se pudo generar el enlace de descarga para el pago ${paymentId}`,
        BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
        404,
        'pago-no-encontrado',
        'No fue posible generar el enlace de descarga del comprobante.'
      )
    }

    return { url: result, expiresIn: expireSeconds }
  }

  // ─── Serialización del listado ────────────────────────────────────────────

  private toListItem(payment: BillingPayment): PaymentListItem {
    return {
      billingPaymentId: payment.billingPaymentId,
      amountCents: payment.billingPaymentAmountCents,
      method: payment.billingPaymentMethod,
      reference: payment.billingPaymentReference,
      paidAt: (payment.billingPaymentPaidAt as DateTime).toISO()!,
      periodStart: toCalendarIsoDate(payment.billingPaymentPeriodStart),
      periodEnd: toCalendarIsoDate(payment.billingPaymentPeriodEnd),
      receiptAvailable: !!payment.billingPaymentReceiptPath,
    }
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    }
    return map[mime] ?? 'bin'
  }

  // ─── Serialización de respuesta ───────────────────────────────────────────

  private toResult(
    payment: BillingPayment,
    subscription: BillingSubscription
  ): RegisterPaymentResult {
    return {
      billingPaymentId: payment.billingPaymentId,
      billingSubscriptionId: payment.billingSubscriptionId,
      amountCents: payment.billingPaymentAmountCents,
      method: payment.billingPaymentMethod,
      reference: payment.billingPaymentReference,
      paidAt: (payment.billingPaymentPaidAt as DateTime).toISO()!,
      periodStart: toCalendarIsoDate(payment.billingPaymentPeriodStart),
      periodEnd: toCalendarIsoDate(payment.billingPaymentPeriodEnd),
      hasReceipt: !!payment.billingPaymentReceiptPath,
      isCustomAmount: payment.billingPaymentIsCustomAmount,
      periodAmountCents: payment.billingPaymentPeriodAmountCents,
      periodsCovered: payment.billingPaymentPeriodsCovered,
      creditAppliedCents: payment.billingPaymentCreditAppliedCents,
      creditBalanceAfterCents: payment.billingPaymentCreditBalanceAfterCents,
      subscription: {
        billingSubscriptionId: subscription.billingSubscriptionId,
        status: subscription.billingSubscriptionStatus,
        currentPeriodStart: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart),
        currentPeriodEnd: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
        creditBalanceCents: subscription.billingSubscriptionCreditBalanceCents,
      },
    }
  }
}

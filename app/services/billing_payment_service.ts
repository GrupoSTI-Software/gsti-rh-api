import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingPlan from '#models/billing_plan'
import BusinessUnit from '#models/business_unit'
import type { BillingPaymentMethod } from '#models/billing_payment'
import UploadService from '#services/upload_service'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import BillingSubscriptionChangeService, {
  type ApplyIncreaseOutcome,
  type SubscriptionChangeRecord,
} from '#services/billing_subscription_change_service'
import { BILLING_PAYMENT_ERROR_CODES } from '../constants/billing_payment_error_codes.js'
import { BillingPaymentServiceError } from '../exceptions/billing_payment_service_error.js'
import { todayInBusinessZone, toCalendarIsoDate } from '../utils/business_date.js'
import { RECEIPT_MAX_BYTES, RECEIPT_ALLOWED_MIMES } from '../validators/billing_payment.js'

// ─── Carpeta S3 de comprobantes ───────────────────────────────────────────────
const RECEIPT_S3_FOLDER = 'billing/payments/receipts'

// ─── Cotas de monto (centavos): mínimo $1 MXN, máximo $999,999.99 MXN ────────
const AMOUNT_MIN_CENTS = 100
const AMOUNT_MAX_CENTS = 99_999_999

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface RegisterPaymentInput {
  amountCents: number
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
  periodStart: string
  periodEnd: string
  receiptAvailable: boolean
}

export interface RegisterPaymentResult {
  billingPaymentId: number
  billingSubscriptionId: number
  amountCents: number
  method: BillingPaymentMethod
  reference: string | null
  paidAt: string
  periodStart: string
  periodEnd: string
  hasReceipt: boolean
  subscription: {
    billingSubscriptionId: number
    status: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
  }
  /** Cambio de aumento aplicado o marcado not_applicable; null si no hubo cambio vivo aplicable. */
  appliedChange: SubscriptionChangeRecord | null
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Servicio de pagos de suscripción (USRH1784574994922).
 *
 * Registrar un pago es un acto atómico:
 *   1. Sube el comprobante a S3 privado (fuera de la trx — S3 no es transaccional).
 *   2. Abre db.transaction: inserta el pago, intenta aplicar aumento pendiente (0856),
 *      avanza el periodo y pone status='active'.
 *   3. Si la trx falla → compensa borrando el objeto S3 subido.
 *
 * El módulo NUNCA expone la URL del comprobante (solo la Key queda en BD).
 * La descarga firmada es responsabilidad de USRH1784574994923.
 */
export default class BillingPaymentService {
  private readonly changeService = new BillingSubscriptionChangeService()
  private readonly internalNotification = new BillingInternalNotificationService()

  /**
   * Registra un pago sobre una suscripción existente y no cancelada.
   *
   * @throws {BillingPaymentServiceError} si la suscripción no existe, está
   *   cancelada, el monto es inválido o el comprobante no pasa validación.
   */
  async registerPayment(
    subscriptionId: number,
    input: RegisterPaymentInput,
    receipt: ReceiptFile
  ): Promise<RegisterPaymentResult> {
    // ── 1. Validar suscripción ────────────────────────────────────────────────
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

    if (subscription.billingSubscriptionStatus === 'canceled') {
      throw new BillingPaymentServiceError(
        `Suscripción ${subscriptionId} está cancelada`,
        BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
        422,
        'suscripcion-cancelada',
        'No se puede registrar un pago sobre una suscripción cancelada.'
      )
    }

    // ── 2. Validar monto ─────────────────────────────────────────────────────
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

    // ── 3. Validar y subir comprobante (antes de la trx — S3 no es transaccional) ──
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

    // ── 4. Calcular avance de periodo (CDMX) ─────────────────────────────────
    const today = todayInBusinessZone()
    const rawPeriodEnd = subscription.billingSubscriptionCurrentPeriodEnd
    const periodEndIso = rawPeriodEnd ? toCalendarIsoDate(rawPeriodEnd) : null

    // anchor = current_period_end si ≥ hoy, si no hoy (spec regla 3)
    const anchor =
      periodEndIso && periodEndIso >= today.toISODate()!
        ? DateTime.fromISO(periodEndIso, { zone: today.zone })
        : today

    const newPeriodStart = anchor
    const newPeriodEnd = anchor.plus({ months: 1 })

    // ── 5. Transacción atómica ────────────────────────────────────────────────
    let payment: BillingPayment
    let applyOutcome!: ApplyIncreaseOutcome
    try {
      payment = await db.transaction(async (trx) => {
        const paidAtDt = DateTime.fromISO(input.paidAt)

        const newPayment = await BillingPayment.create(
          {
            billingSubscriptionId: subscriptionId,
            billingPaymentAmountCents: input.amountCents,
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

        applyOutcome = await this.changeService.applyIncreaseOnPayment(
          subscription,
          newPayment.billingPaymentId,
          input.amountCents,
          trx
        )

        subscription.useTransaction(trx)
        subscription.billingSubscriptionStatus = 'active'
        subscription.billingSubscriptionCurrentPeriodStart = newPeriodStart
        subscription.billingSubscriptionCurrentPeriodEnd = newPeriodEnd
        // Sincronizar columna espejo si venía de un estado a reactivar
        if (!subscription.billingSubscriptionLiveBusinessUnitId) {
          subscription.billingSubscriptionLiveBusinessUnitId = subscription.businessUnitId
        }
        await subscription.save()

        return newPayment
      })
    } catch (error) {
      // Compensación: borrar el objeto S3 subido antes de la trx
      await uploadService.deleteFile(s3Key).catch(() => null)
      throw error
    }

    if (applyOutcome.outcome === 'not_applicable') {
      await this.notifyChangeNotApplicable(
        subscription,
        applyOutcome.change,
        payment.billingPaymentId,
        input.amountCents,
        applyOutcome.reason
      )
    }

    return this.toResult(payment, subscription, applyOutcome)
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
      periodStart: (payment.billingPaymentPeriodStart as DateTime).toISODate()!,
      periodEnd: (payment.billingPaymentPeriodEnd as DateTime).toISODate()!,
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

  private async notifyChangeNotApplicable(
    subscription: BillingSubscription,
    change: SubscriptionChangeRecord,
    billingPaymentId: number,
    amountCents: number,
    reason: Extract<ApplyIncreaseOutcome, { outcome: 'not_applicable' }>['reason']
  ): Promise<void> {
    const [businessUnit, billingPlan] = await Promise.all([
      BusinessUnit.query()
        .where('business_unit_id', subscription.businessUnitId)
        .whereNull('business_unit_deleted_at')
        .first(),
      BillingPlan.query()
        .where('billing_plan_id', subscription.billingPlanId)
        .whereNull('billing_plan_deleted_at')
        .first(),
    ])

    await this.internalNotification.notifySubscriptionChangeNotApplicable({
      subscription,
      change,
      businessUnitName: businessUnit?.businessUnitName ?? `Empresa #${subscription.businessUnitId}`,
      billingPlanName: billingPlan?.billingPlanName ?? `Plan #${subscription.billingPlanId}`,
      billingPaymentId,
      amountCents,
      reason,
    })
  }

  private resolveAppliedChange(outcome: ApplyIncreaseOutcome): SubscriptionChangeRecord | null {
    if (outcome.outcome === 'applied' || outcome.outcome === 'not_applicable') {
      return outcome.change
    }
    return null
  }

  // ─── Serialización de respuesta ───────────────────────────────────────────

  private toResult(
    payment: BillingPayment,
    subscription: BillingSubscription,
    applyOutcome: ApplyIncreaseOutcome
  ): RegisterPaymentResult {
    return {
      billingPaymentId: payment.billingPaymentId,
      billingSubscriptionId: payment.billingSubscriptionId,
      amountCents: payment.billingPaymentAmountCents,
      method: payment.billingPaymentMethod,
      reference: payment.billingPaymentReference,
      paidAt: (payment.billingPaymentPaidAt as DateTime).toISO()!,
      periodStart: (payment.billingPaymentPeriodStart as DateTime).toISODate()!,
      periodEnd: (payment.billingPaymentPeriodEnd as DateTime).toISODate()!,
      hasReceipt: !!payment.billingPaymentReceiptPath,
      subscription: {
        billingSubscriptionId: subscription.billingSubscriptionId,
        status: subscription.billingSubscriptionStatus,
        currentPeriodStart: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart),
        currentPeriodEnd: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
      },
      appliedChange: this.resolveAppliedChange(applyOutcome),
    }
  }
}

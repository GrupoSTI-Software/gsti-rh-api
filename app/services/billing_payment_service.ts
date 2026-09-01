import { DateTime } from 'luxon'
import FileIntakeService from '#services/file_intake_service'
import { FileIntakeError } from '#exceptions/file_intake_error'
import db from '@adonisjs/lucid/services/db'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingPlan from '#models/billing_plan'
import BusinessUnit from '#models/business_unit'
import BillingSubscriptionChange from '#models/billing_subscription_change'
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

// ─── Cotas de monto (centavos): solo rigen el flujo de importe distinto ──────
const AMOUNT_MIN_CENTS = 100
const AMOUNT_MAX_CENTS = 99_999_999

// ─── Tope de periodos que un solo pago puede cubrir (regla 7, valor propuesto) ─
const MAX_PERIODS_PER_PAYMENT = 24

// ─── Tipos internos ───────────────────────────────────────────────────────────

/**
 * Qué cifra gobernada resolvió el pago (USRH1787077544537):
 *   - `period`: el monto normal del periodo (con o sin aumento pendiente, es
 *     el importe de siempre; no depende de que exista un aumento).
 *   - `debt`: exactamente el adeudo prorrateado del aumento `pending_payment`.
 *   - `debt_plus_period`: el adeudo + un periodo completo al precio nuevo.
 * Solo `debt` y `debt_plus_period` dependen de que el aumento siga vivo al
 * momento de asentar; si deja de estarlo, el pago se rechaza (no se degrada
 * en silencio a `period`, decisión Wilvardo 2026-08-23).
 */
type GovernedAmountKind = 'period' | 'debt' | 'debt_plus_period'

interface GovernedAmountResolution {
  /** Monto gobernado que corresponde al `amountKind` resuelto. */
  amountCents: number
  amountKind: GovernedAmountKind
}

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
  extname?: string
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
  /** Periodos completos que este pago cubrió (0 = parcial, no movió el periodo). */
  periodsCovered: number
}

/** Desglose financiero persistido al asentar el pago (USRH1785962095098). */
export interface PaymentBreakdown {
  grossCents: number
  discountPercent: number
  discountAmountCents: number
  subtotalCents: number
  taxRate: number
  taxAmountCents: number
  totalCents: number
}

/**
 * Detalle de un pago con su desglose guardado (USRH1785962095098). Espeja
 * `PaymentListItem` y agrega, en solo lectura, exactamente lo que
 * `registerPayment` calculó y persistió al asentarlo — nada se recalcula
 * aquí. `breakdownAvailable=false` marca los pagos anteriores a
 * USRH1785962095095, cuya foto financiera quedó en cero por migración.
 */
export interface PaymentDetailItem extends PaymentListItem {
  isCustomAmount: boolean
  periodAmountCents: number
  creditAppliedCents: number
  /** (v2) Dinero de este pago consumido cubriendo el adeudo de un aumento (0856). 0 si no había. */
  debtAppliedCents: number
  creditBalanceAfterCents: number
  breakdownAvailable: boolean
  breakdown: PaymentBreakdown | null
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
  /** (v2) Dinero de este pago consumido cubriendo el adeudo del aumento (0856). 0 si no había. */
  debtAppliedCents: number
  creditBalanceAfterCents: number
  subscription: {
    billingSubscriptionId: number
    status: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    creditBalanceCents: number
  }
  /** Cambio de aumento aplicado o marcado not_applicable; null si no hubo cambio vivo aplicable. */
  appliedChange: SubscriptionChangeRecord | null
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
 * USRH1785962095095 v2 — coexistencia con USRH1786107870856).
 *
 * Registrar un pago es un acto atómico:
 *   1. Valida existencia/estado y resuelve el monto asentado (gobernado por el
 *      trato congelado tal como estaba) con una lectura simple (fail-fast,
 *      antes de tocar S3).
 *   2. Sube el comprobante a S3 privado (fuera de la trx — S3 no es transaccional).
 *   3. Abre db.transaction: recarga la suscripción con `.forUpdate()`, revalida
 *      `canceled` (protección de carrera), inserta el pago y aplica, en este
 *      orden exacto, la **prelación de cobro** (spec v2, regla 13):
 *        a. saldoDisponible = saldo previo + monto asentado.
 *        b. `applyIncreaseOnPayment` cubre el adeudo prorrateado de un aumento
 *           `pending_payment` (0856) desde ese saldo disponible → `consumedCents`.
 *        c. saldoTrasAdeudo = saldoDisponible − consumedCents.
 *        d. El monto del periodo se relee del trato congelado **ya mutado** por
 *           el paso anterior (si hubo aumento, es el nuevo).
 *        e. saldoTrasAdeudo se traduce en N periodos completos; el sobrante
 *           queda a favor. Estado y periodo solo avanzan con N ≥ 1.
 *      El pago se completa con los campos derivados y se persiste junto con la
 *      suscripción dentro de la misma transacción.
 *   4. Si la trx falla → compensa borrando el objeto S3 subido.
 *
 * Invariante verificado en código antes de persistir (spec v2 §12):
 *   saldoPrevio + montoAsentado = consumedCents + creditAppliedCents + creditBalanceAfterCents.
 * Ningún centavo se aplica dos veces ni se pierde.
 *
 * El módulo NUNCA expone la URL del comprobante (solo la Key queda en BD).
 * El monto del flujo normal lo gobierna el servidor desde
 * `billing_subscription_contracted_total`; el cliente solo influye en el
 * importe a través de la capacidad explícita `allowCustomAmount`.
 */
export default class BillingPaymentService {
  private readonly changeService = new BillingSubscriptionChangeService()
  private readonly internalNotification = new BillingInternalNotificationService()

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
    await this.resolveGovernedAmount(preCheckSubscription, input, allowCustomAmount)

    // ── 2. Validar y subir comprobante (fuera de la trx) ────────────────────
    this.validateReceipt(receipt)

    // El comprobante es un archivo de un cliente: pasa por la puerta única
    // antes de tocar el bucket. Antes se subía el binario tal cual, con el
    // `Content-Type` que declaraba el navegador como única validación.
    const intake = await this.acceptReceipt(receipt)
    const s3RelativeKey = `${RECEIPT_S3_FOLDER}/${subscriptionId}/${intake.storageFileName}`

    const uploadService = new UploadService()
    const s3Key = await uploadService.uploadPrivateBuffer(
      s3RelativeKey,
      intake.buffer,
      intake.mimeType
    )

    if (!s3Key) {
      throw new BillingPaymentServiceError(
        'Fallo al subir el comprobante a S3',
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_UPLOAD_FAILED,
        500,
        'comprobante-upload-fallido',
        'No se pudo guardar el comprobante. Intenta de nuevo.'
      )
    }

    // ── 3. Transacción atómica (adeudo + saldo + periodo + pago, regla 13) ──
    let result: {
      payment: BillingPayment
      subscription: BillingSubscription
      applyOutcome: ApplyIncreaseOutcome
    }
    try {
      result = await db.transaction(async (trx) => {
        // Concurrencia del saldo (spec §12): recarga bloqueante dentro de la trx.
        // Mismo orden de bloqueos siempre: primero suscripción, después cambio
        // (que toma el suyo dentro de applyIncreaseOnPayment).
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

        // ── Regla 1, 14: monto asentado, resuelto ANTES de mutar el trato ──
        const governedResolution = await this.resolveGovernedAmount(
          subscription,
          input,
          allowCustomAmount
        )
        const amountAsentado = allowCustomAmount
          ? input.amountCents!
          : governedResolution.amountCents
        const creditBalancePrevio = subscription.billingSubscriptionCreditBalanceCents

        // ── Regla 13.1: el saldo a favor es la única puerta del dinero ────
        const saldoDisponible = creditBalancePrevio + amountAsentado

        const paidAtDt = DateTime.fromISO(input.paidAt)

        // Se inserta primero con los campos derivados en 0: applyIncreaseOnPayment
        // necesita el billingPaymentId ya existente para marcar el cambio `applied`.
        // Se completa con save() más abajo, dentro de la misma transacción abierta
        // (no es una edición del histórico: la fila aún no salió de este acto atómico).
        const newPayment = await BillingPayment.create(
          {
            billingSubscriptionId: subscriptionId,
            billingPaymentAmountCents: amountAsentado,
            billingPaymentPeriodAmountCents: 0,
            billingPaymentPeriodsCovered: 0,
            billingPaymentCreditAppliedCents: 0,
            billingPaymentDebtAppliedCents: 0,
            billingPaymentCreditBalanceAfterCents: 0,
            billingPaymentIsCustomAmount: allowCustomAmount,
            billingPaymentGrossCents: 0,
            billingPaymentDiscountAmountCents: 0,
            billingPaymentSubtotalCents: 0,
            billingPaymentTaxAmountCents: 0,
            billingPaymentTotalCents: 0,
            billingPaymentDiscountPercent: 0,
            billingPaymentTaxRate: 0,
            billingPaymentMethod: input.method,
            billingPaymentReference: input.reference ?? null,
            billingPaymentReceiptPath: s3Key,
            billingPaymentReceiptMime: intake.mimeType,
            billingPaymentProvider: 'manual',
            billingPaymentPaidAt: paidAtDt,
            billingPaymentPeriodStart: null,
            billingPaymentPeriodEnd: null,
          },
          { client: trx }
        )

        // ── Regla 13.2: cubrir primero el adeudo puntual (0856) ────────────
        const applyOutcome = await this.changeService.applyIncreaseOnPayment(
          subscription,
          newPayment.billingPaymentId,
          saldoDisponible,
          trx
        )
        const consumedCents = applyOutcome.outcome === 'applied' ? applyOutcome.consumedCents : 0

        // ── USRH1787077544537: el monto confirmado dependía del adeudo ────
        // (`debt` o `debt_plus_period`) pero, al bloquear el cambio dentro de
        // esta misma trx, `applyIncreaseOnPayment` ya no lo encontró vivo o
        // consistente. Se rechaza en vez de asentar una cifra que dejó de
        // corresponder (decisión Wilvardo: nunca degradar en silencio).
        if (governedResolution.amountKind !== 'period' && applyOutcome.outcome !== 'applied') {
          throw new BillingPaymentServiceError(
            `El aumento pendiente que justificaba amountCents (${amountAsentado}) ya no está vigente`,
            BILLING_PAYMENT_ERROR_CODES.PENDING_INCREASE_STALE,
            422,
            'aumento-pendiente-desfasado',
            'El adeudo por aumento cambió o ya no existe. Actualiza la pantalla y vuelve a intentar el pago.'
          )
        }

        // ── Regla 13.3 ──────────────────────────────────────────────────────
        const saldoTrasAdeudo = saldoDisponible - consumedCents

        // ── Regla 13.4, 14: el monto del periodo se relee del trato YA MUTADO ─
        const periodAmountCents = this.toPeriodAmountCents(
          subscription.billingSubscriptionContractedTotal
        )
        if (periodAmountCents === null) {
          throw new BillingPaymentServiceError(
            `Suscripción ${subscriptionId}: contracted_total no permite determinar el monto del periodo tras el aumento`,
            BILLING_PAYMENT_ERROR_CODES.PERIOD_AMOUNT_UNAVAILABLE,
            422,
            'monto-periodo-no-disponible',
            'No fue posible determinar el monto del periodo desde el trato de la suscripción.'
          )
        }

        // ── Regla 13.5, 5, 6: periodos completos + tope (regla 7) ─────────
        const periodsCovered = Math.floor(saldoTrasAdeudo / periodAmountCents)

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
        const creditBalanceAfterCents = saldoTrasAdeudo - creditAppliedCents

        // ── Invariante del dinero (spec v2 §12): se verifica en código ────
        if (
          creditBalancePrevio + amountAsentado !==
          consumedCents + creditAppliedCents + creditBalanceAfterCents
        ) {
          throw new BillingPaymentServiceError(
            'Invariante de saldo violado al conciliar adeudo, periodos y sobrante',
            BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED,
            500,
            'saldo-inconsistente',
            'No fue posible conciliar el dinero de este pago. Intenta de nuevo.'
          )
        }

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

        // Foto financiera con el trato vigente al cierre de la trx (regla 14):
        // si hubo aumento, describe el periodo que efectivamente se extendió.
        const snapshot = this.computeFinancialSnapshot(subscription)

        newPayment.useTransaction(trx)
        newPayment.billingPaymentPeriodAmountCents = periodAmountCents
        newPayment.billingPaymentPeriodsCovered = periodsCovered
        newPayment.billingPaymentCreditAppliedCents = creditAppliedCents
        newPayment.billingPaymentDebtAppliedCents = consumedCents
        newPayment.billingPaymentCreditBalanceAfterCents = creditBalanceAfterCents
        newPayment.billingPaymentGrossCents = snapshot.grossCents
        newPayment.billingPaymentDiscountAmountCents = snapshot.discountAmountCents
        newPayment.billingPaymentSubtotalCents = snapshot.subtotalCents
        newPayment.billingPaymentTaxAmountCents = snapshot.taxAmountCents
        newPayment.billingPaymentTotalCents = snapshot.totalCents
        newPayment.billingPaymentDiscountPercent = snapshot.discountPercent
        newPayment.billingPaymentTaxRate = snapshot.taxRate
        newPayment.billingPaymentPeriodStart = newPeriodStart
        newPayment.billingPaymentPeriodEnd = newPeriodEnd
        await newPayment.save()

        subscription.useTransaction(trx)
        subscription.billingSubscriptionCreditBalanceCents = creditBalanceAfterCents

        // Regla 5, 6, 15: solo se extiende periodo y estado con ≥ 1 periodo cubierto.
        // Cubrir solo el adeudo (periodsCovered = 0) libera el cupo pero NO pone
        // al cliente al corriente: un past_due sigue past_due.
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

        return { payment: newPayment, subscription, applyOutcome }
      })
    } catch (error) {
      // Compensación: borrar el objeto S3 subido antes de la trx
      await uploadService.deleteFile(s3Key).catch(() => null)
      throw error
    }

    if (result.applyOutcome.outcome === 'not_applicable') {
      await this.notifyChangeNotApplicable(
        result.subscription,
        result.applyOutcome.change,
        result.payment.billingPaymentId,
        result.payment.billingPaymentAmountCents,
        result.applyOutcome.reason
      )
    }

    return this.toResult(result.payment, result.subscription, result.applyOutcome)
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

  // ─── Monto gobernado (reglas 1-3, ampliado por USRH1787077544537) ────────

  /**
   * Resuelve el monto del periodo desde el trato congelado y valida el
   * monto de la petición contra las reglas del flujo (normal vs. importe
   * distinto). Devuelve el monto gobernado y de qué tipo es.
   *
   * Cuando la suscripción tiene un aumento `increase` en `pending_payment`
   * vivo, el flujo normal (sin `allowCustomAmount`) acepta además, sin
   * declarar importe distinto, exactamente dos cifras más: el adeudo
   * prorrateado solo, o el adeudo + un periodo completo al precio nuevo
   * (USRH1787077544537, decisión Wilvardo: la elección es de conceptos que
   * el sistema calcula, nunca una cifra libre — por eso se sigue validando
   * como igualdad exacta contra lo que el propio sistema calculó, igual que
   * el monto del periodo de siempre).
   *
   * @throws {BillingPaymentServiceError} PERIOD_AMOUNT_UNAVAILABLE,
   *   AMOUNT_NOT_ALLOWED, AMOUNT_REQUIRED o AMOUNT_INVALID según el caso.
   */
  private async resolveGovernedAmount(
    subscription: BillingSubscription,
    input: RegisterPaymentInput,
    allowCustomAmount: boolean
  ): Promise<GovernedAmountResolution> {
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
      if (input.amountCents === undefined || input.amountCents === periodAmountCents) {
        return { amountCents: periodAmountCents, amountKind: 'period' }
      }

      const compositeAmounts = await this.resolveCompositeIncreaseAmounts(subscription)
      if (compositeAmounts) {
        if (input.amountCents === compositeAmounts.debtCents) {
          return { amountCents: compositeAmounts.debtCents, amountKind: 'debt' }
        }
        if (input.amountCents === compositeAmounts.debtPlusPeriodCents) {
          return { amountCents: compositeAmounts.debtPlusPeriodCents, amountKind: 'debt_plus_period' }
        }
      }

      throw new BillingPaymentServiceError(
        `amountCents (${input.amountCents}) no coincide con ninguna cifra gobernada disponible`,
        BILLING_PAYMENT_ERROR_CODES.AMOUNT_NOT_ALLOWED,
        422,
        'monto-no-permitido',
        'El monto del pago lo determina el sistema y no es editable.'
      )
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

    return { amountCents: input.amountCents, amountKind: 'period' }
  }

  /**
   * Lee (sin bloquear) el aumento `pending_payment` vivo de la suscripción y,
   * si existe, calcula las dos cifras compuestas que el flujo normal puede
   * aceptar. `null` si no hay ningún aumento pendiente — en ese caso solo
   * existe el monto del periodo de siempre.
   *
   * Lectura de solo consulta: la consistencia real la vuelve a verificar
   * `applyIncreaseOnPayment` con su propio `.forUpdate()` dentro de la misma
   * transacción del pago; si para entonces el aumento ya no está vivo o
   * cambió, el pago se rechaza en vez de asentarse con una cifra que dejó de
   * corresponder (ver `registerPayment`, verificación post-`applyOutcome`).
   */
  private async resolveCompositeIncreaseAmounts(
    subscription: BillingSubscription
  ): Promise<{ debtCents: number; debtPlusPeriodCents: number } | null> {
    const liveChange = await BillingSubscriptionChange.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .where('business_unit_id', subscription.businessUnitId)
      .where('billing_subscription_change_type', 'increase')
      .where('billing_subscription_change_status', 'pending_payment')
      .whereNull('billing_subscription_change_deleted_at')
      .orderBy('billing_subscription_change_id', 'desc')
      .first()

    if (!liveChange) {
      return null
    }

    const newPeriodAmountCents = this.toPeriodAmountCents(liveChange.billingSubscriptionChangeTotal)
    if (newPeriodAmountCents === null) {
      return null
    }

    const debtCents = liveChange.billingSubscriptionChangeProratedAmountCents
    return { debtCents, debtPlusPeriodCents: debtCents + newPeriodAmountCents }
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

  /**
   * Somete el comprobante al intake con el perfil de evidencia y traduce su
   * rechazo al contrato de error del módulo, para que el frontend siga viendo
   * los mismos códigos que ya consume.
   */
  private async acceptReceipt(receipt: ReceiptFile) {
    try {
      return await new FileIntakeService().accept(
        {
          tmpPath: receipt.tmpPath,
          clientName: receipt.clientName,
          extname: receipt.extname ?? receipt.clientName.split('.').pop() ?? '',
          size: receipt.size,
        },
        'evidence-document'
      )
    } catch (error) {
      const detail =
        error instanceof FileIntakeError
          ? error.detail
          : 'El comprobante debe ser PDF, JPG o PNG.'

      throw new BillingPaymentServiceError(
        'Comprobante no aceptado',
        BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
        422,
        'comprobante-tipo-invalido',
        detail
      )
    }
  }

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

  /**
   * Detalle de un pago con su desglose financiero persistido, acotado a la
   * suscripción a la que pertenece (USRH1785962095098, regla 10). Espeja
   * `listPayments` en su validación previa de la suscripción.
   *
   * Un `paymentId` inexistente o que pertenece a otra suscripción responde
   * el mismo `NOT_FOUND`, sin distinguir el caso (regla 10, criterio 5).
   *
   * @throws {BillingPaymentServiceError} `SUBSCRIPTION_NOT_FOUND` si la
   *   suscripción no existe; `NOT_FOUND` si el pago no existe o es ajeno.
   */
  async getPaymentDetail(subscriptionId: number, paymentId: number): Promise<PaymentDetailItem> {
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

    const payment = await BillingPayment.query()
      .where('billingPaymentId', paymentId)
      .where('billingSubscriptionId', subscriptionId)
      .first()

    if (!payment) {
      throw new BillingPaymentServiceError(
        `Pago ${paymentId} no encontrado para la suscripción ${subscriptionId}`,
        BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
        404,
        'pago-no-encontrado',
        'No existe un pago con ese identificador para esta suscripción.'
      )
    }

    return this.toDetailItem(payment)
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
      periodsCovered: payment.billingPaymentPeriodsCovered,
    }
  }

  /**
   * `breakdownAvailable` usa `totalCents = 0` como marcador de "sin
   * desglose" (pagos anteriores a USRH1785962095095, dejados en cero por la
   * migración `1785766125021`). No es una cifra real: un pago con desglose
   * real y `totalCents = 0` no puede existir (el total siempre es positivo).
   */
  private toDetailItem(payment: BillingPayment): PaymentDetailItem {
    const totalCents = Number(payment.billingPaymentTotalCents)
    const breakdownAvailable = totalCents !== 0

    return {
      ...this.toListItem(payment),
      isCustomAmount: payment.billingPaymentIsCustomAmount,
      periodAmountCents: payment.billingPaymentPeriodAmountCents,
      creditAppliedCents: payment.billingPaymentCreditAppliedCents,
      debtAppliedCents: payment.billingPaymentDebtAppliedCents,
      creditBalanceAfterCents: payment.billingPaymentCreditBalanceAfterCents,
      breakdownAvailable,
      breakdown: breakdownAvailable
        ? {
            grossCents: payment.billingPaymentGrossCents,
            discountPercent: Number(payment.billingPaymentDiscountPercent),
            discountAmountCents: payment.billingPaymentDiscountAmountCents,
            subtotalCents: payment.billingPaymentSubtotalCents,
            taxRate: Number(payment.billingPaymentTaxRate),
            taxAmountCents: payment.billingPaymentTaxAmountCents,
            totalCents,
          }
        : null,
    }
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
      periodStart: toCalendarIsoDate(payment.billingPaymentPeriodStart),
      periodEnd: toCalendarIsoDate(payment.billingPaymentPeriodEnd),
      hasReceipt: !!payment.billingPaymentReceiptPath,
      isCustomAmount: payment.billingPaymentIsCustomAmount,
      periodAmountCents: payment.billingPaymentPeriodAmountCents,
      periodsCovered: payment.billingPaymentPeriodsCovered,
      creditAppliedCents: payment.billingPaymentCreditAppliedCents,
      debtAppliedCents: payment.billingPaymentDebtAppliedCents,
      creditBalanceAfterCents: payment.billingPaymentCreditBalanceAfterCents,
      subscription: {
        billingSubscriptionId: subscription.billingSubscriptionId,
        status: subscription.billingSubscriptionStatus,
        currentPeriodStart: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart),
        currentPeriodEnd: toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
        creditBalanceCents: subscription.billingSubscriptionCreditBalanceCents,
      },
      appliedChange: this.resolveAppliedChange(applyOutcome),
    }
  }
}

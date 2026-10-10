import { DateTime } from 'luxon'
import BillingPayment from '#models/billing_payment'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { isBillingPaymentFailureReason } from '#constants/billing_payment_failure_reasons'
import type { BillingPaymentFailureReason } from '#constants/billing_payment_failure_reasons'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import { TenantContext } from '#utils/tenant_context'
import { getBusinessTimeZone, toCalendarIsoDate } from '#utils/business_date'

/** Máximo de pagos devueltos en el historial del tenant. */
export const RECURRING_BILLING_PAYMENTS_LIMIT = 12

/** Pago normalizado para el resumen de cobro recurrente. */
export interface RecurringBillingPayment {
  paidAt: string
  amountCents: number
  method: string
  periodsCovered: number
  periodStart: string | null
  periodEnd: string | null
}

/** Último intento fallido con motivo del catálogo. */
export interface RecurringBillingFailure {
  at: string
  reason: BillingPaymentFailureReason
}

/** Vista de lectura del cobro automático en Mi suscripción. */
export type RecurringBillingView =
  | { automatic: false }
  | {
      automatic: true
      lastFailure: RecurringBillingFailure | null
      failureActive: boolean
      payments: RecurringBillingPayment[]
    }

/**
 * Indica si el fallo registrado sigue vigente frente al último pago Stripe.
 *
 * @param lastFailedAt - Momento del último rechazo, si existe.
 * @param latestStripePaidAt - Momento del último pago con proveedor stripe.
 * @returns Verdadero cuando no hay pago stripe en o después del fallo (empate cuenta como superado).
 */
export function isPaymentFailureActive(
  lastFailedAt: DateTime | null,
  latestStripePaidAt: DateTime | null
): boolean {
  if (lastFailedAt === null) {
    return false
  }
  if (latestStripePaidAt === null) {
    return true
  }
  return latestStripePaidAt.toMillis() < lastFailedAt.toMillis()
}

/**
 * Convierte un instante de pago o fallo a fecha civil en zona de negocio.
 *
 * @param value - Marca de tiempo almacenada en UTC.
 */
function toRecurringCalendarDate(value: DateTime): string {
  const civil = value.setZone(getBusinessTimeZone()).toISODate()
  if (!civil) {
    throw new BillingSubscriptionServiceError(
      'Fecha de cobro inválida',
      BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
      500,
      BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
      'Error inesperado en suscripciones.'
    )
  }
  return civil
}

/**
 * Resumen de cobro recurrente del tenant activo (solo lectura Valanserh).
 */
export default class BillingRecurringBillingService {
  /**
   * Arma la vista para la empresa en scope; manual o sin suscripción viva → `automatic: false`.
   *
   * @returns Lista blanca sin referencias de Stripe ni ids internos.
   * @throws {BillingSubscriptionServiceError} Cuando no se resuelve la empresa activa.
   */
  async getForActiveBusinessUnit(): Promise<RecurringBillingView> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para consultar la suscripción.'
      )
    }

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    if (
      subscription === null ||
      subscription.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE
    ) {
      return { automatic: false }
    }

    const lastFailedAt = subscription.billingSubscriptionLastPaymentFailedAt
    const rawReason = subscription.billingSubscriptionLastPaymentFailureReason

    const latestStripeRow = await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .where('billing_payment_provider', BILLING_PROVIDER_KEYS.STRIPE)
      .orderBy('billing_payment_paid_at', 'desc')
      .select('billing_payment_paid_at')
      .first()

    const latestStripePaidAt = latestStripeRow?.billingPaymentPaidAt ?? null
    const failureActive = isPaymentFailureActive(lastFailedAt, latestStripePaidAt)

    let lastFailure: RecurringBillingFailure | null = null
    if (lastFailedAt !== null) {
      const reason: BillingPaymentFailureReason = isBillingPaymentFailureReason(rawReason)
        ? rawReason
        : 'other'
      lastFailure = {
        at: toRecurringCalendarDate(lastFailedAt),
        reason,
      }
    }

    const paymentRows = await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .select(
        'billing_payment_paid_at',
        'billing_payment_amount_cents',
        'billing_payment_method',
        'billing_payment_periods_covered',
        'billing_payment_period_start',
        'billing_payment_period_end'
      )
      .orderBy('billing_payment_paid_at', 'desc')
      .orderBy('billing_payment_id', 'desc')
      .limit(RECURRING_BILLING_PAYMENTS_LIMIT)

    const payments: RecurringBillingPayment[] = paymentRows.map((row) => {
      const periodsCovered = row.billingPaymentPeriodsCovered
      return {
        paidAt: toRecurringCalendarDate(row.billingPaymentPaidAt),
        amountCents: row.billingPaymentAmountCents,
        method: row.billingPaymentMethod,
        periodsCovered,
        periodStart:
          periodsCovered === 0 ? null : toCalendarIsoDate(row.billingPaymentPeriodStart),
        periodEnd: periodsCovered === 0 ? null : toCalendarIsoDate(row.billingPaymentPeriodEnd),
      }
    })

    return {
      automatic: true,
      lastFailure,
      failureActive,
      payments,
    }
  }
}

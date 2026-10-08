import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_PROVIDER_STATE_MISMATCH_DETAIL,
} from '#constants/billing_provider_error_codes'
import { normalizePaymentFailure } from '#constants/billing_payment_failure_reasons'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import BillingSubscription from '#models/billing_subscription'
import type { BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingSubscriptionTransition, {
  type BillingSubscriptionTransitionReason,
} from '#models/billing_subscription_transition'
import {
  BILLING_PROVIDER_KEYS,
  isBillingSubscriptionStateProvider,
  type BillingSubscriptionStateProviderPort,
  type ProviderPaymentFailure,
  type ProviderSubscriptionState,
  type ProviderSubscriptionStatus,
} from '#modules/billing-provider/billing_provider.port'
import type {
  BillingProviderEventContext,
  BillingProviderEventOutcome,
  BillingProviderEventHandler,
} from '#modules/billing-provider/billing_provider_event_handlers'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import type { NotifyProviderSubscriptionStateUnexpectedParams } from '#services/billing_internal_notification_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { getBusinessTimeZone } from '#utils/business_date'

const TRANSITION_ORIGIN_UQ = 'uq_billing_sub_transition_cut_origin'

export type ProviderSubscriptionStateAlert = 'unexpected-status' | 'local-canceled'

export type ProviderStatusDecision =
  | { kind: 'none' }
  | {
      kind: 'write'
      to: 'past_due'
      reason: 'provider_past_due' | 'provider_unpaid'
    }
  | { kind: 'write'; to: 'canceled'; reason: 'provider_canceled' }
  | { kind: 'alert'; alert: ProviderSubscriptionStateAlert }

export function decideProviderStatus(
  local: BillingSubscriptionStatus,
  remote: ProviderSubscriptionStatus
): ProviderStatusDecision {
  const liveLocal = local === 'trialing' || local === 'active' ? 'live' : local

  switch (remote) {
    case 'past_due':
      if (liveLocal === 'live') {
        return { kind: 'write', to: 'past_due', reason: 'provider_past_due' }
      }
      if (liveLocal === 'past_due') {
        return { kind: 'none' }
      }
      return { kind: 'alert', alert: 'local-canceled' }

    case 'unpaid':
      if (liveLocal === 'live') {
        return { kind: 'write', to: 'past_due', reason: 'provider_unpaid' }
      }
      if (liveLocal === 'past_due') {
        return { kind: 'none' }
      }
      return { kind: 'alert', alert: 'local-canceled' }

    case 'canceled':
    case 'incomplete_expired':
      if (liveLocal === 'canceled') {
        return { kind: 'none' }
      }
      return { kind: 'write', to: 'canceled', reason: 'provider_canceled' }

    case 'active':
    case 'trialing':
      if (liveLocal === 'canceled') {
        return { kind: 'alert', alert: 'local-canceled' }
      }
      return { kind: 'none' }

    case 'incomplete':
    case 'paused':
    case 'unknown':
      if (liveLocal === 'canceled') {
        return { kind: 'alert', alert: 'local-canceled' }
      }
      return { kind: 'alert', alert: 'unexpected-status' }

    default: {
      const exhaustiveCheck: never = remote
      throw new Error(`Estado de Stripe no reconocido: ${String(exhaustiveCheck)}`)
    }
  }
}

export function providerEventBusinessDate(createdAt: number): string {
  return DateTime.fromSeconds(createdAt).setZone(getBusinessTimeZone()).toISODate()!
}

export function isProviderTransitionDuplicate(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') {
    return false
  }
  const err = error as {
    code?: string
    sqlMessage?: string
    message?: string
    original?: { code?: string; sqlMessage?: string; message?: string }
  }
  const code = err.code ?? err.original?.code
  if (code !== 'ER_DUP_ENTRY') {
    return false
  }
  const sqlMessage = `${err.sqlMessage ?? ''}${err.message ?? ''}${err.original?.sqlMessage ?? ''}${err.original?.message ?? ''}`
  return sqlMessage.includes(TRANSITION_ORIGIN_UQ)
}

function providerStateMismatch(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Estado de Stripe no corresponde a la suscripción local',
    BILLING_PROVIDER_ERROR_CODES.PROVIDER_STATE_MISMATCH,
    500,
    'estado-del-proveedor-no-coincide',
    BILLING_PROVIDER_PROVIDER_STATE_MISMATCH_DETAIL
  )
}

function assertRemoteLinksSubscription(
  sub: BillingSubscription,
  remote: ProviderSubscriptionState,
  eventObjectId: string | null,
  eventType: string
): void {
  if (remote.subscriptionRef !== sub.billingSubscriptionStripeSubscriptionId) {
    throw providerStateMismatch()
  }
  if (remote.customerRef !== sub.billingSubscriptionStripeCustomerId) {
    throw providerStateMismatch()
  }
  if (
    (eventType === 'customer.subscription.updated' ||
      eventType === 'customer.subscription.deleted') &&
    eventObjectId !== sub.billingSubscriptionStripeSubscriptionId
  ) {
    throw providerStateMismatch()
  }
}

function assertFailureLinksSubscription(
  sub: BillingSubscription,
  failure: ProviderPaymentFailure
): void {
  if (
    failure.subscriptionRef !== null &&
    failure.subscriptionRef !== sub.billingSubscriptionStripeSubscriptionId
  ) {
    throw providerStateMismatch()
  }
  if (failure.customerRef !== null && failure.customerRef !== sub.billingSubscriptionStripeCustomerId) {
    throw providerStateMismatch()
  }
  if (failure.subscriptionRef === null || failure.customerRef === null) {
    throw providerStateMismatch()
  }
}

async function applyLastPaymentFailureIfNewer(
  sub: BillingSubscription,
  eventCreatedAt: number,
  failure: ProviderPaymentFailure
): Promise<void> {
  const existing = sub.billingSubscriptionLastPaymentFailedAt
  if (existing !== null && eventCreatedAt <= (existing as DateTime).toSeconds()) {
    return
  }
  sub.billingSubscriptionLastPaymentFailedAt = DateTime.fromSeconds(eventCreatedAt)
  sub.billingSubscriptionLastPaymentFailureReason = normalizePaymentFailure({
    code: failure.errorCode,
    declineCode: failure.declineCode,
    intentStatus: failure.intentStatus,
  })
  sub.billingSubscriptionLastPaymentFailureInvoiceRef = failure.invoiceRef
  await sub.save()
}

export default class BillingProviderSubscriptionStateHandler
  implements BillingProviderEventHandler
{
  constructor(
    private readonly subscriptionService = new BillingSubscriptionService(),
    private readonly notifications = new BillingInternalNotificationService()
  ) {}

  async handle(context: BillingProviderEventContext): Promise<BillingProviderEventOutcome> {
    return this.syncProviderStatus(context)
  }

  async syncProviderStatus(
    context: BillingProviderEventContext
  ): Promise<BillingProviderEventOutcome> {
    const { event, billingSubscription: ctxSubscription, provider } = context

    if (ctxSubscription === null) {
      return { status: 'ignored', reason: 'subscription-not-found' }
    }

    if (!isBillingSubscriptionStateProvider(provider)) {
      throw new BillingProviderServiceError(
        'Operación de estado no disponible',
        BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE,
        500,
        'operacion-de-cobro-no-disponible',
        BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL
      )
    }

    const stateProvider = provider as BillingSubscriptionStateProviderPort

    let pendingAlert: NotifyProviderSubscriptionStateUnexpectedParams | null = null
    let outcome: BillingProviderEventOutcome = { status: 'processed' }
    let logPayload: {
      billingSubscriptionId: number
      eventId: string
      from: string
      to: string
      reason: BillingSubscriptionTransitionReason | null
      failureReason: string | null
    } | null = null

    try {
      await db.transaction(async (trx) => {
        const sub = await BillingSubscription.query({ client: trx })
          .where('billing_subscription_id', ctxSubscription.billingSubscriptionId)
          .where('business_unit_id', ctxSubscription.businessUnitId)
          .where('billing_subscription_provider', BILLING_PROVIDER_KEYS.STRIPE)
          .whereNull('billing_subscription_deleted_at')
          .forUpdate()
          .first()

        if (sub === null) {
          outcome = { status: 'ignored', reason: 'subscription-not-found' }
          return
        }

        const localStatus = sub.billingSubscriptionStatus
        const subscriptionRef = sub.billingSubscriptionStripeSubscriptionId ?? ''
        const remote = await stateProvider.readSubscriptionState(subscriptionRef)

        let failure: ProviderPaymentFailure | null = null
        if (event.type === 'invoice.payment_failed') {
          const invoiceRef = event.objectId ?? ''
          failure = await stateProvider.readInvoicePaymentFailure(invoiceRef)
        }

        assertRemoteLinksSubscription(sub, remote, event.objectId, event.type)
        if (failure !== null) {
          assertFailureLinksSubscription(sub, failure)
        }

        const decision = decideProviderStatus(localStatus, remote.status)

        if (decision.kind === 'alert' && decision.alert === 'local-canceled') {
          if (event.type !== 'invoice.payment_failed') {
            pendingAlert = {
              billingSubscriptionId: sub.billingSubscriptionId,
              businessUnitId: sub.businessUnitId,
              subscriptionRef,
              eventRef: event.id,
              providerStatus: remote.status,
              localStatus,
              alert: decision.alert,
            }
          }
          outcome = { status: 'ignored', reason: 'local-canceled' }
          return
        }

        if (
          event.type === 'invoice.payment_failed' &&
          failure !== null &&
          localStatus !== 'canceled'
        ) {
          await applyLastPaymentFailureIfNewer(sub, event.createdAt, failure)
        }

        if (decision.kind === 'alert' && decision.alert === 'unexpected-status') {
          pendingAlert = {
            billingSubscriptionId: sub.billingSubscriptionId,
            businessUnitId: sub.businessUnitId,
            subscriptionRef,
            eventRef: event.id,
            providerStatus: remote.status,
            localStatus,
            alert: decision.alert,
          }
          outcome = { status: 'processed' }
          return
        }

        if (decision.kind === 'none') {
          outcome = { status: 'processed' }
          return
        }

        const writeDecision = decision as Extract<ProviderStatusDecision, { kind: 'write' }>
        const fromStatus = sub.billingSubscriptionStatus
        if (writeDecision.to === 'past_due') {
          sub.billingSubscriptionStatus = 'past_due'
          await sub.save()
        } else {
          await this.subscriptionService.cancelWithin(sub, trx)
        }

        await BillingSubscriptionTransition.create(
          {
            billingSubscriptionId: sub.billingSubscriptionId,
            billingSubscriptionTransitionFrom: fromStatus,
            billingSubscriptionTransitionTo: writeDecision.to,
            billingSubscriptionTransitionReason: writeDecision.reason,
            billingSubscriptionTransitionCutDate: DateTime.fromISO(
              providerEventBusinessDate(event.createdAt)
            ),
            billingSubscriptionTransitionOrigin: 'provider',
            billingSubscriptionTransitionOriginKey: event.id,
          },
          { client: trx }
        )

        logPayload = {
          billingSubscriptionId: sub.billingSubscriptionId,
          eventId: event.id,
          from: fromStatus,
          to: writeDecision.to,
          reason: writeDecision.reason,
          failureReason: sub.billingSubscriptionLastPaymentFailureReason,
        }
        outcome = { status: 'processed' }
      })
    } catch (error) {
      if (isProviderTransitionDuplicate(error)) {
        return { status: 'processed' }
      }
      throw error
    }

    if (pendingAlert !== null) {
      await this.notifications.notifyProviderSubscriptionStateUnexpected(pendingAlert)
    }

    if (logPayload !== null) {
      logger.info(logPayload, 'Estado de Stripe reflejado en la suscripción')
    }

    return outcome
  }
}

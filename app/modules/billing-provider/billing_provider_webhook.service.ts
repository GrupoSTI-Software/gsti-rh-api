import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import BillingSubscription from '#models/billing_subscription'
import {
  billingProviderEventHandlers,
  type BillingProviderEventHandler,
} from '#modules/billing-provider/billing_provider_event_handlers'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderKey,
  type BillingProviderPort,
  isBillingWebhookProvider,
  type VerifiedProviderEvent,
} from '#modules/billing-provider/billing_provider.port'
import { resolveBillingProvider } from '#modules/billing-provider/billing_provider.registry'

export type WebhookReceiveOutcome = 'processed' | 'ignored' | 'duplicate'

function isDuplicateExternalId(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

function webhookProcessingFailed(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Procesamiento de webhook falló',
    BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED,
    500,
    'aviso-no-procesado',
    BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL
  )
}

function operationNotAvailableForWebhook(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Operación de webhook no disponible',
    BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE,
    500,
    'operacion-de-cobro-no-disponible',
    BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL
  )
}

export function resolveProviderEventSubscription(
  rows: BillingSubscription[]
):
  | { kind: 'none' }
  | { kind: 'resolved'; subscription: BillingSubscription }
  | { kind: 'ambiguous' } {
  if (rows.length === 0) {
    return { kind: 'none' }
  }
  if (rows.length === 1) {
    return { kind: 'resolved', subscription: rows[0]! }
  }
  return { kind: 'ambiguous' }
}

async function loadSubscriptionForEvent(
  subscriptionRef: string | null
): Promise<
  | { kind: 'none' }
  | { kind: 'resolved'; subscription: BillingSubscription }
  | { kind: 'ambiguous' }
> {
  if (subscriptionRef === null) {
    return { kind: 'none' }
  }

  const rows = await BillingSubscription.query()
    .where('billing_subscription_stripe_subscription_id', subscriptionRef)
    .where('billing_subscription_provider', BILLING_PROVIDER_KEYS.STRIPE)
    .whereNull('billing_subscription_deleted_at')
    .limit(2)

  return resolveProviderEventSubscription(rows)
}

function terminalStatus(status: string): boolean {
  return (
    status === BILLING_PROVIDER_EVENT_STATUSES.PROCESSED ||
    status === BILLING_PROVIDER_EVENT_STATUSES.IGNORED
  )
}

export default class BillingProviderWebhookService {
  async receive(
    providerKey: BillingProviderKey,
    rawBody: string | null,
    signatureHeader: string | null
  ): Promise<{ outcome: WebhookReceiveOutcome }> {
    const provider = resolveBillingProvider(providerKey)
    if (!isBillingWebhookProvider(provider)) {
      logger.warn({ provider: providerKey, reason: 'webhook-port-missing' }, 'Cobro: webhook rechazado')
      throw operationNotAvailableForWebhook()
    }

    const verified = provider.verifyWebhookEvent(rawBody ?? '', signatureHeader)

    const subscriptionResolution = await loadSubscriptionForEvent(verified.object.subscriptionRef)

    let createdRow: BillingProviderEvent
    try {
      createdRow = await BillingProviderEvent.create({
        billingProviderEventProvider: providerKey,
        billingProviderEventExternalId: verified.id,
        billingProviderEventType: verified.type,
        billingProviderEventObjectId: verified.objectId,
        billingProviderEventObjectType: verified.objectType,
        billingProviderEventLivemode: verified.livemode,
        billingProviderEventStatus: BILLING_PROVIDER_EVENT_STATUSES.RECEIVED,
        billingProviderEventAttempts: 0,
        billingProviderEventLastErrorCode: null,
        billingSubscriptionId:
          subscriptionResolution.kind === 'resolved'
            ? subscriptionResolution.subscription.billingSubscriptionId
            : null,
        billingProviderEventProviderCreatedAt: DateTime.fromSeconds(verified.createdAt),
      })
    } catch (error) {
      if (!isDuplicateExternalId(error)) {
        throw error
      }
      createdRow = await BillingProviderEvent.query()
        .where('billing_provider_event_provider', providerKey)
        .where('billing_provider_event_external_id', verified.id)
        .firstOrFail()
    }

    let outcome: WebhookReceiveOutcome = 'duplicate'
    let processingError: BillingProviderServiceError | null = null

    outcome = await db.transaction(async (trx) => {
      const locked = await BillingProviderEvent.query({ client: trx })
        .where('billing_provider_event_id', createdRow.billingProviderEventId)
        .forUpdate()
        .firstOrFail()

      if (terminalStatus(locked.billingProviderEventStatus)) {
        return 'duplicate' as const
      }

      locked.billingProviderEventAttempts += 1

      const freshResolution = await loadSubscriptionForEvent(verified.object.subscriptionRef)
      if (freshResolution.kind === 'resolved') {
        locked.billingSubscriptionId = freshResolution.subscription.billingSubscriptionId
      }

      if (freshResolution.kind === 'ambiguous') {
        locked.billingProviderEventStatus = BILLING_PROVIDER_EVENT_STATUSES.FAILED
        locked.billingProviderEventLastErrorCode =
          BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED
        await locked.useTransaction(trx).save()
        processingError = webhookProcessingFailed()
        return 'duplicate' as const
      }

      const handler = billingProviderEventHandlers.resolve(verified.type)
      if (verified.fromConnectedAccount || handler === null) {
        locked.billingProviderEventStatus = BILLING_PROVIDER_EVENT_STATUSES.IGNORED
        locked.billingProviderEventProcessedAt = DateTime.now()
        locked.billingProviderEventLastErrorCode = null
        await locked.useTransaction(trx).save()
        this.#logEvent(providerKey, locked, verified, null)
        return 'ignored' as const
      }

      const billingSubscription =
        freshResolution.kind === 'resolved' ? freshResolution.subscription : null

      try {
        const handlerOutcome = await this.#invokeHandler(
          handler,
          provider,
          verified,
          billingSubscription,
          locked.billingProviderEventAttempts
        )
        if (handlerOutcome.status === 'processed') {
          locked.billingProviderEventStatus = BILLING_PROVIDER_EVENT_STATUSES.PROCESSED
        } else {
          locked.billingProviderEventStatus = BILLING_PROVIDER_EVENT_STATUSES.IGNORED
        }
        locked.billingProviderEventProcessedAt = DateTime.now()
        locked.billingProviderEventLastErrorCode = null
        await locked.useTransaction(trx).save()
        this.#logEvent(
          providerKey,
          locked,
          verified,
          handlerOutcome.status === 'ignored' ? handlerOutcome.reason : null
        )
        return handlerOutcome.status === 'processed' ? ('processed' as const) : ('ignored' as const)
      } catch (error) {
        locked.billingProviderEventStatus = BILLING_PROVIDER_EVENT_STATUSES.FAILED
        locked.billingProviderEventLastErrorCode =
          error instanceof BillingProviderServiceError
            ? error.errorCode
            : BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED
        await locked.useTransaction(trx).save()
        this.#logEvent(providerKey, locked, verified, locked.billingProviderEventLastErrorCode)
        processingError = webhookProcessingFailed()
        return 'duplicate' as const
      }
    })

    if (processingError) {
      throw processingError
    }

    return { outcome }
  }

  async #invokeHandler(
    handler: BillingProviderEventHandler,
    provider: BillingProviderPort,
    event: VerifiedProviderEvent,
    billingSubscription: BillingSubscription | null,
    attempt: number
  ) {
    return handler.handle({
      event,
      billingSubscription,
      provider,
      attempt,
    })
  }

  #logEvent(
    provider: BillingProviderKey,
    row: BillingProviderEvent,
    event: VerifiedProviderEvent,
    reason: string | null
  ): void {
    logger.info(
      {
        provider,
        billingProviderEventId: row.billingProviderEventId,
        eventId: event.id,
        type: event.type,
        objectId: event.objectId,
        status: row.billingProviderEventStatus,
        errorCode: row.billingProviderEventLastErrorCode,
        reason,
      },
      'Cobro: aviso de proveedor atendido'
    )
  }
}

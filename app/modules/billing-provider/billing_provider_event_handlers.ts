import type BillingSubscription from '#models/billing_subscription'
import type {
  BillingProviderPort,
  VerifiedProviderEvent,
} from '#modules/billing-provider/billing_provider.port'

export interface BillingProviderEventContext {
  event: VerifiedProviderEvent
  billingSubscription: BillingSubscription | null
  provider: BillingProviderPort
}

export type BillingProviderEventOutcome =
  | { status: 'processed' }
  | { status: 'ignored'; reason: string }

export interface BillingProviderEventHandler {
  handle(context: BillingProviderEventContext): Promise<BillingProviderEventOutcome>
}

export class BillingProviderEventHandlerRegistry {
  private readonly handlers = new Map<string, BillingProviderEventHandler>()

  register(eventType: string, handler: BillingProviderEventHandler): () => void {
    if (this.handlers.has(eventType)) {
      throw new Error(`Manejador ya registrado para el tipo ${eventType}`)
    }
    this.handlers.set(eventType, handler)
    return () => {
      this.handlers.delete(eventType)
    }
  }

  resolve(eventType: string): BillingProviderEventHandler | null {
    return this.handlers.get(eventType) ?? null
  }
}

export const billingProviderEventHandlers = new BillingProviderEventHandlerRegistry()

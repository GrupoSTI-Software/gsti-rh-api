import { test } from '@japa/runner'
import Stripe from 'stripe'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import BillingCustomerIdentityService from '#services/billing_customer_identity_service'
import BillingSubscription from '#models/billing_subscription'
import BusinessUnit from '#models/business_unit'

const ENABLED_SETTINGS = {
  status: 'enabled' as const,
  mode: 'test' as const,
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: 'pk_test_fixturePub1',
  webhookSecret: null,
}

test.group('BillingCustomerIdentityService — disparo manual (VLRH-H1791925351695)', () => {
  test('CA-12: proveedor manual no registra llamadas Stripe', async ({ assert }) => {
    let stripeCalls = 0
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => {
      stripeCalls += 1
      return {} as Stripe
    })
    const restore = billingProviderRegistry.register(adapter)

    const sub = await BillingSubscription.query()
      .where('billing_subscription_provider', 'manual')
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    try {
      if (sub !== null) {
        await new BillingCustomerIdentityService().syncForSubscription(
          sub.billingSubscriptionId,
          'profile'
        )
      }
      assert.equal(stripeCalls, 0)
    } finally {
      restore()
    }
  })

  test('syncForSubscription con fila stripe viva invoca update en cliente falso', async ({
    assert,
  }) => {
    const updates: unknown[] = []
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () =>
      ({
        customers: {
          update: async (_id: string, params: unknown) => {
            updates.push(params)
            return {}
          },
        },
        subscriptions: {
          update: async () => ({}),
        },
      }) as unknown as Stripe
    )
    const restore = billingProviderRegistry.register(adapter)

    const liveStripe = await BillingSubscription.query()
      .where('billing_subscription_provider', 'stripe')
      .whereIn('billing_subscription_status', ['trialing', 'active', 'past_due'])
      .whereNotNull('billing_subscription_stripe_customer_id')
      .whereNotNull('billing_subscription_stripe_subscription_id')
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    try {
      if (liveStripe === null) {
        return
      }
      await new BillingCustomerIdentityService().syncForSubscription(
        liveStripe.billingSubscriptionId,
        'plan'
      )
      assert.isAbove(updates.length, 0)
      const bu = await BusinessUnit.find(liveStripe.businessUnitId)
      assert.isDefined(bu)
    } finally {
      restore()
    }
  })
})

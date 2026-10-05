import { test } from '@japa/runner'
import BillingSubscription from '#models/billing_subscription'
import { resolveProviderEventSubscription } from '#modules/billing-provider/billing_provider_webhook.service'

test.group('resolveProviderEventSubscription (7579 / CA-10)', () => {
  test('cero filas → none', ({ assert }) => {
    assert.deepEqual(resolveProviderEventSubscription([]), { kind: 'none' })
  })

  test('una fila → resolved', ({ assert }) => {
    const row = { billingSubscriptionId: 9 } as BillingSubscription
    const result = resolveProviderEventSubscription([row])
    assert.equal(result.kind, 'resolved')
    if (result.kind === 'resolved') {
      assert.equal(result.subscription.billingSubscriptionId, 9)
    }
  })

  test('dos filas → ambiguous', ({ assert }) => {
    const a = { billingSubscriptionId: 1 } as BillingSubscription
    const b = { billingSubscriptionId: 2 } as BillingSubscription
    assert.deepEqual(resolveProviderEventSubscription([a, b]), { kind: 'ambiguous' })
  })
})

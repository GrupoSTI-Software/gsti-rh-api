import { test } from '@japa/runner'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'

test.group('ManualBillingProviderAdapter (USRH1790708507467 / CA-7)', () => {
  test('openSubscription devuelve manual sin referencias externas', async ({ assert }) => {
    const adapter = new ManualBillingProviderAdapter()
    const opening = await adapter.openSubscription({
      businessUnitId: 1,
      billingPlanId: 2,
      billingPlanPriceId: 3,
      contractedEmployees: 10,
    })

    assert.deepEqual(opening, {
      provider: 'manual',
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    })
  })

  test('admitRecordedPayment resuelve sin efecto', async ({ assert }) => {
    const adapter = new ManualBillingProviderAdapter()
    await assert.doesNotReject(() =>
      adapter.admitRecordedPayment({
        billingSubscriptionId: 99,
        method: 'transfer',
      })
    )
  })
})

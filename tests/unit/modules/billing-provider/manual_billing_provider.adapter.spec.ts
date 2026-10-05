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

test.group('ManualBillingProviderAdapter — catálogo (7553 / CA-14)', () => {
  test('las cuatro operaciones de catálogo lanzan OPERATION_NOT_AVAILABLE', async ({ assert }) => {
    const adapter = new ManualBillingProviderAdapter()
    const calls = [
      () => adapter.createCatalogProduct({ billingPlanId: 1, name: 'X' }),
      () =>
        adapter.createCatalogPrice({
          productRef: 'prod_1',
          billingPlanId: 1,
          billingPlanPriceId: 2,
          currency: 'MXN',
          unitAmountCents: 0,
          intervalMonths: 1,
        }),
      () => adapter.archiveCatalogProduct('prod_1'),
      () => adapter.archiveCatalogPrice('price_1'),
    ] as const

    for (const call of calls) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        assert.equal((error as { errorCode?: string }).errorCode, 'PLT.PRV.OPERATION_NOT_AVAILABLE')
        assert.equal((error as { key?: string }).key, 'operacion-de-cobro-no-disponible')
      }
    }
  })
})

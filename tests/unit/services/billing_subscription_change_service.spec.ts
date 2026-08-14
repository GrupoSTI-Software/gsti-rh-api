import { test } from '@japa/runner'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'

test.group('BillingSubscriptionChangeService — prorrateo (USRH1786107870847)', () => {
  test('ejemplo CA-1: 282750 centavos de diferencia y 91210 centavos prorrateados', ({
    assert,
  }) => {
    const service = new BillingSubscriptionChangeService()
    const proration = service['buildProration'](6786, 9613.5, 31, 10)

    assert.equal(proration.differenceCents, 282750)
    assert.equal(proration.amountCents, 91210)
  })
})

test.group('BillingSubscriptionChangeService — clasificación', () => {
  test('classifyChangeType distingue increase, decrease y none', ({ assert }) => {
    const service = new BillingSubscriptionChangeService()

    assert.equal(service['classifyChangeType'](100, 150), 'increase')
    assert.equal(service['classifyChangeType'](100, 90), 'decrease')
    assert.equal(service['classifyChangeType'](100, 100), 'none')
  })
})

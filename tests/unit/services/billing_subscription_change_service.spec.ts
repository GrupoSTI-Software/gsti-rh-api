import { test } from '@japa/runner'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import { BillingPaymentServiceError } from '../../../app/exceptions/billing_payment_service_error.js'
import { BILLING_PAYMENT_ERROR_CODES } from '../../../app/constants/billing_payment_error_codes.js'

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

test.group('BillingSubscriptionChangeService — snapshot congelado (0856)', () => {
  test('assertIncreaseChangeSnapshotConsistent acepta importes válidos', ({ assert }) => {
    const service = new BillingSubscriptionChangeService()
    const change = new BillingSubscriptionChange()
    change.billingSubscriptionChangeUnitAmount = 100
    change.billingSubscriptionChangeDiscountPercent = 0
    change.billingSubscriptionChangeTaxRate = 0.16
    change.billingSubscriptionChangeSubtotal = 1000
    change.billingSubscriptionChangeTaxAmount = 160
    change.billingSubscriptionChangeTotal = 1160
    change.billingSubscriptionChangeProratedAmountCents = 91210
    change.billingSubscriptionChangePreviousEmployees = 100
    change.billingSubscriptionChangeNewEmployees = 150

    assert.doesNotThrows(() => service['assertIncreaseChangeSnapshotConsistent'](change))
  })

  test('assertIncreaseChangeSnapshotConsistent rechaza subtotal no numérico', ({ assert }) => {
    const service = new BillingSubscriptionChangeService()
    const change = new BillingSubscriptionChange()
    change.billingSubscriptionChangeUnitAmount = 100
    change.billingSubscriptionChangeDiscountPercent = 0
    change.billingSubscriptionChangeTaxRate = 0.16
    change.billingSubscriptionChangeSubtotal = Number.NaN
    change.billingSubscriptionChangeTaxAmount = 160
    change.billingSubscriptionChangeTotal = 1160
    change.billingSubscriptionChangeProratedAmountCents = 91210
    change.billingSubscriptionChangePreviousEmployees = 100
    change.billingSubscriptionChangeNewEmployees = 150

    assert.throws(
      () => service['assertIncreaseChangeSnapshotConsistent'](change),
      BillingPaymentServiceError as unknown as ErrorConstructor
    )

    try {
      service['assertIncreaseChangeSnapshotConsistent'](change)
    } catch (error) {
      assert.equal(
        (error as BillingPaymentServiceError).errorCode,
        BILLING_PAYMENT_ERROR_CODES.CHANGE_INCONSISTENT_SNAPSHOT
      )
    }
  })
})

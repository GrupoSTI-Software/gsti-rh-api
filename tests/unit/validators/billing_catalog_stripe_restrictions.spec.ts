import { test } from '@japa/runner'
import { createBillingPlanValidator, updateBillingPlanValidator } from '#validators/billing_plan'
import { createBillingPriceValidator } from '#validators/billing_price'

test.group('Validadores catálogo — campos Stripe descartados (3743 / CA-2)', () => {
  test('createBillingPlanValidator no expone provider ni producto', async ({ assert }) => {
    const result = await createBillingPlanValidator.validate({
      billingPlanName: 'Plan X',
      billingPlanProvider: 'stripe',
      billingPlanStripeProductId: 'prod_evil',
    })
    assert.deepEqual(result, { billingPlanName: 'Plan X' })
  })

  test('updateBillingPlanValidator no expone producto', async ({ assert }) => {
    const result = await updateBillingPlanValidator.validate({
      billingPlanStripeProductId: 'prod_evil',
    })
    assert.deepEqual(result, {})
  })

  test('createBillingPriceValidator no expone provider ni price id', async ({ assert }) => {
    const result = await createBillingPriceValidator.validate({
      billingPlanPriceAmount: 79,
      billingPlanPriceEffectiveFrom: '2026-10-01',
      billingPlanPriceProvider: 'stripe',
      billingPlanPriceStripePriceId: 'price_evil',
    })
    assert.deepEqual(result, {
      billingPlanPriceAmount: 79,
      billingPlanPriceEffectiveFrom: '2026-10-01',
    })
  })
})

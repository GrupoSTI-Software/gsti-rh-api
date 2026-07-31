import { test } from '@japa/runner'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'

/**
 * Tests funcionales — catálogo público de planes y precio resuelto (USRH1785441817226).
 *
 * Cubre CA-1 a CA-5 y CA-4 (limitador aislado). Sin autenticación ni header de empresa.
 * El seeder base deja planes en borrador; este suite publica su propio fixture y lo limpia.
 */

const FORBIDDEN_RESPONSE_FIELDS = [
  'billingPlanStripeProductId',
  'billingPlanProvider',
  'billingPlanParentId',
  'billingPlanPublishedAt',
  'billingPlanActive',
  'billingPlanPriceId',
  'billingPlanPriceEffectiveFrom',
  'effectiveFrom',
]

interface CatalogFixtures {
  sellablePlanId: number
  draftPlanId: number
  inactivePlanId: number
  noPricePlanId: number
}

async function seedPriceAndTier(planId: number, effectiveFrom: string) {
  await BillingPlanPrice.create({
    billingPlanId: planId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: effectiveFrom,
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: planId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await BillingVolumeTier.create({
    billingPlanId: planId,
    billingVolumeTierMinEmployees: 26,
    billingVolumeTierDiscountPercent: 5,
  })
}

async function createCatalogFixtures(stamp: number): Promise<CatalogFixtures> {
  const catalog = new BillingCatalogService()
  const today = toBusinessDateString()

  const sellable = await catalog.createPlan({
    billingPlanName: `Signup Catalog Sellable ${stamp}`,
    billingPlanDescription: 'Plan vendible para tests funcionales',
    billingPlanProvider: 'manual',
  })
  await seedPriceAndTier(sellable.billingPlanId, '2025-01-01')
  await catalog.publishPlan(sellable.billingPlanId)

  const draft = await catalog.createPlan({
    billingPlanName: `Signup Catalog Draft ${stamp}`,
    billingPlanDescription: 'Plan borrador',
    billingPlanProvider: 'manual',
  })
  await seedPriceAndTier(draft.billingPlanId, today)

  const inactive = await catalog.createPlan({
    billingPlanName: `Signup Catalog Inactive ${stamp}`,
    billingPlanDescription: 'Plan publicado inactivo',
    billingPlanProvider: 'manual',
  })
  await seedPriceAndTier(inactive.billingPlanId, '2025-01-01')
  await catalog.publishPlan(inactive.billingPlanId)
  inactive.billingPlanActive = 0
  await inactive.save()

  const noPrice = await catalog.createPlan({
    billingPlanName: `Signup Catalog No Price ${stamp}`,
    billingPlanDescription: 'Plan publicado sin precio vigente',
    billingPlanProvider: 'manual',
  })
  await seedPriceAndTier(noPrice.billingPlanId, '2025-01-01')
  await catalog.publishPlan(noPrice.billingPlanId)
  await BillingPlanPrice.query()
    .where('billing_plan_id', noPrice.billingPlanId)
    .update({ billing_plan_price_effective_from: '2099-01-01' })

  return {
    sellablePlanId: sellable.billingPlanId,
    draftPlanId: draft.billingPlanId,
    inactivePlanId: inactive.billingPlanId,
    noPricePlanId: noPrice.billingPlanId,
  }
}

async function cleanupPlanTree(planId: number) {
  await BillingSubscription.query().where('billing_plan_id', planId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

async function cleanupCatalogFixtures(fixtures: CatalogFixtures | null) {
  if (!fixtures) return
  for (const planId of Object.values(fixtures)) {
    await cleanupPlanTree(planId)
  }
}

function assertNoForbiddenFields(
  payload: unknown,
  assert: { notInclude: (a: string, b: string, c?: string) => void }
) {
  const json = JSON.stringify(payload)
  for (const field of FORBIDDEN_RESPONSE_FIELDS) {
    assert.notInclude(json, `"${field}"`, `no debe filtrarse ${field}`)
  }
}

test.group('GET /api/signup/plans — catálogo público (CA-1)', (group) => {
  let fixtures: CatalogFixtures | null = null

  group.setup(async () => {
    fixtures = await createCatalogFixtures(Date.now())
  })

  group.teardown(async () => {
    await cleanupCatalogFixtures(fixtures)
  })

  test('devuelve solo planes vendibles con lista blanca de campos', async ({ client, assert }) => {
    const response = await client.get('/api/signup/plans')

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')

    const plans = response.body().data as Array<{
      billingPlanId: number
      currentPrice: { pricePerEmployee: number }
      volumeTiers: unknown[]
    }>
    const ids = plans.map((plan) => plan.billingPlanId)

    assert.include(ids, fixtures!.sellablePlanId)
    assert.notInclude(ids, fixtures!.draftPlanId)
    assert.notInclude(ids, fixtures!.inactivePlanId)
    assert.notInclude(ids, fixtures!.noPricePlanId)

    const sellable = plans.find((plan) => plan.billingPlanId === fixtures!.sellablePlanId)!
    assert.property(sellable, 'currentPrice')
    assert.property(sellable.currentPrice, 'pricePerEmployee')
    assert.property(sellable, 'volumeTiers')
    assert.isAbove(sellable.volumeTiers.length, 0)

    assertNoForbiddenFields(response.body(), assert)
  })
})

test.group('GET /api/signup/plans/:planId/price — precio resuelto (CA-2, CA-3, CA-5)', (group) => {
  let fixtures: CatalogFixtures | null = null

  group.setup(async () => {
    fixtures = await createCatalogFixtures(Date.now())
  })

  group.teardown(async () => {
    await cleanupCatalogFixtures(fixtures)
  })

  test('calcula el precio con resolvePrice y agrega firstPaymentDate', async ({ client, assert }) => {
    const catalog = new BillingCatalogService()
    const today = toBusinessDateString()
    const expected = await catalog.resolvePrice(fixtures!.sellablePlanId, 30, today)
    const expectedFirstPayment = toBusinessDateString(
      todayInBusinessZone().plus({ days: expected.trialDays })
    )

    const response = await client
      .get(`/api/signup/plans/${fixtures!.sellablePlanId}/price`)
      .qs({ employees: 30 })

    response.assertStatus(200)
    const data = response.body().data

    assert.equal(data.billingPlanId, expected.billingPlanId)
    assert.equal(data.employeeCount, expected.employeeCount)
    assert.equal(data.pricePerEmployee, expected.pricePerEmployee)
    assert.equal(data.discountPercent, expected.discountPercent)
    assert.equal(data.discountAmount, expected.discountAmount)
    assert.equal(data.subtotal, expected.subtotal)
    assert.equal(data.taxAmount, expected.taxAmount)
    assert.equal(data.total, expected.total)
    assert.equal(data.trialDays, expected.trialDays)
    assert.equal(data.firstPaymentDate, expectedFirstPayment)
    assert.notProperty(data, 'effectiveFrom')
  })

  test('rechaza cantidades inválidas con códigos de dominio', async ({ client, assert }) => {
    for (const employees of [25, 5, 0, 9]) {
      const response = await client
        .get(`/api/signup/plans/${fixtures!.sellablePlanId}/price`)
        .qs({ employees })

      response.assertStatus(422)
      assert.equal(response.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN)
      assert.equal(response.body().key, 'cantidad-no-multiplo-de-diez')
    }

    const negativeResponse = await client
      .get(`/api/signup/plans/${fixtures!.sellablePlanId}/price`)
      .qs({ employees: -10 })

    negativeResponse.assertStatus(422)
    assert.equal(negativeResponse.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT)

    const capResponse = await client
      .get(`/api/signup/plans/${fixtures!.sellablePlanId}/price`)
      .qs({ employees: 1_000_000 })

    capResponse.assertStatus(422)
    assert.equal(
      capResponse.body().code,
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP
    )
    assert.equal(capResponse.body().key, 'cantidad-fuera-de-rango')

    const missingResponse = await client.get(
      `/api/signup/plans/${fixtures!.sellablePlanId}/price`
    )
    missingResponse.assertStatus(422)
    assert.equal(missingResponse.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT)
  })

  test('colapsa plan no disponible en la misma 404 opaca', async ({ client, assert }) => {
    const unavailableIds = [
      9_999_999,
      fixtures!.draftPlanId,
      fixtures!.inactivePlanId,
      fixtures!.noPricePlanId,
    ]

    for (const planId of unavailableIds) {
      const response = await client
        .get(`/api/signup/plans/${planId}/price`)
        .qs({ employees: 30 })

      response.assertStatus(404)
      assert.equal(response.body().key, 'plan-no-disponible')
      assert.equal(response.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND)
      assert.notInclude(String(response.body().code), 'PLT.CAT.')
    }
  })
})

test.group('GET /api/signup/* — limitador signup-catalog aislado (CA-4)', () => {
  test('30 req/min propias sin consumir el límite de signup', async ({ client, assert }) => {
    // Va al final del archivo: las pruebas previas ya consumieron parte del cupo (< 30).
    let throttled = false
    for (let i = 0; i < 25; i++) {
      const response = await client.get('/api/signup/plans')
      if (response.status() === 429) {
        throttled = true
        break
      }
      response.assertStatus(200)
    }

    assert.isTrue(throttled, 'debió activarse el limitador signup-catalog al superar 30 req/min')

    const signupResponse = await client.post('/api/auth/signup/start').json({
      email: `catalog-rate-${Date.now()}@gsti-tests.local`,
      firstName: 'Rate',
      lastName: 'Limit',
      secondLastName: 'Test',
      businessUnitName: 'Rate Limit Tenant',
      billingPlanId: 1,
      contractedEmployees: 30,
    })

    assert.notEqual(signupResponse.status(), 429)
  })
})

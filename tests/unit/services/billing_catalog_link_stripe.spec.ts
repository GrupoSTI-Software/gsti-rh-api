import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import { BILLING_CATALOG_ERROR_CODES } from '#constants/billing_catalog_error_codes'
import { providerRequestFailed } from '#modules/billing-provider/billing_provider.errors'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCatalogProviderPort,
  type BillingProviderPort,
  type CatalogPriceDraft,
  type CatalogProductDraft,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import BillingCatalogService from '#services/billing_catalog_service'
import { BillingCatalogServiceError } from '#exceptions/billing_catalog_service_error'
import { toBusinessDateString } from '#utils/business_date'

class FakeStripeCatalogAdapter implements BillingProviderPort, BillingCatalogProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  readonly calls = {
    createCatalogProduct: [] as CatalogProductDraft[],
    createCatalogPrice: [] as CatalogPriceDraft[],
    archiveCatalogProduct: [] as string[],
    archiveCatalogPrice: [] as string[],
  }

  distinctPriceIds = false
  failCreatePrice = false
  failArchivePrice = false

  async openSubscription() {
    return {
      provider: BILLING_PROVIDER_KEYS.STRIPE,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment() {
    return undefined
  }

  async createCatalogProduct(draft: CatalogProductDraft) {
    this.calls.createCatalogProduct.push(draft)
    return { externalId: `prod_fake_${draft.billingPlanId}` }
  }

  async createCatalogPrice(draft: CatalogPriceDraft) {
    if (this.failCreatePrice) {
      throw providerRequestFailed('createCatalogPrice', {
        stripeErrorType: 'invalid_request_error',
        stripeRequestId: 'req_test',
      })
    }
    this.calls.createCatalogPrice.push(draft)
    const suffix = this.distinctPriceIds ? `_${this.calls.createCatalogPrice.length}` : ''
    return { externalId: `price_fake_${draft.billingPlanPriceId}${suffix}` }
  }

  async archiveCatalogProduct(externalId: string) {
    this.calls.archiveCatalogProduct.push(externalId)
  }

  async archiveCatalogPrice(externalId: string) {
    if (this.failArchivePrice) {
      throw new Error('archive failed')
    }
    this.calls.archiveCatalogPrice.push(externalId)
  }
}

async function createPublishedPlanWithPrice(): Promise<{
  catalog: BillingCatalogService
  planId: number
  priceId: number
}> {
  const catalog = new BillingCatalogService()
  const stamp = Date.now()
  const plan = await catalog.createPlan({
    billingPlanName: `Link Stripe ${stamp}`,
    billingPlanDescription: 'fixture 7553',
  })

  const price = await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return { catalog, planId: plan.billingPlanId, priceId: price.billingPlanPriceId }
}

function registerFake(fake: FakeStripeCatalogAdapter): () => void {
  return billingProviderRegistry.register(fake)
}

test.group('BillingCatalogService.linkPriceToStripe (7553)', (group) => {
  let fake: FakeStripeCatalogAdapter
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    fake = new FakeStripeCatalogAdapter()
    restoreProvider = registerFake(fake)
  })

  group.each.teardown(() => {
    restoreProvider?.()
    restoreProvider = null
  })

  test('CA-2 — vincula vigente de plan publicado', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()

    const result = await catalog.linkPriceToStripe(planId, priceId)

    assert.deepInclude(result, {
      billingPlanId: planId,
      billingPlanProvider: BILLING_PROVIDER_KEYS.STRIPE,
      billingPlanStripeProductId: `prod_fake_${planId}`,
      billingPlanPriceId: priceId,
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.STRIPE,
      billingPlanPriceStripePriceId: `price_fake_${priceId}`,
      alreadyLinked: false,
    })
    assert.equal(fake.calls.createCatalogProduct.length, 1)
    assert.equal(fake.calls.createCatalogPrice.length, 1)
    assert.equal(fake.calls.createCatalogPrice[0].unitAmountCents, 0)

    const reloaded = await BillingPlanPrice.findOrFail(priceId)
    assert.equal(String(reloaded.billingPlanPriceAmount), '79.00')
    assert.equal(reloaded.billingPlanPriceCurrency, 'MXN')
  })

  test('CA-3 — reutiliza producto en segunda versión', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    await catalog.linkPriceToStripe(planId, priceId)

    const future = await BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: 85,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: toBusinessDateString(DateTime.now().plus({ months: 2 })),
      billingPlanPriceStripePriceId: null,
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
    })

    fake.calls.createCatalogProduct.length = 0
    await catalog.linkPriceToStripe(planId, future.billingPlanPriceId)

    assert.equal(fake.calls.createCatalogProduct.length, 0)
    assert.equal(fake.calls.createCatalogPrice[0].productRef, `prod_fake_${planId}`)
  })

  test('CA-4 — idempotente sin llamadas al proveedor', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    await catalog.linkPriceToStripe(planId, priceId)
    fake.calls.createCatalogProduct.length = 0
    fake.calls.createCatalogPrice.length = 0

    const second = await catalog.linkPriceToStripe(planId, priceId)
    assert.isTrue(second.alreadyLinked)
    assert.equal(fake.calls.createCatalogProduct.length, 0)
    assert.equal(fake.calls.createCatalogPrice.length, 0)
  })

  test('CA-5 — concurrencia: mismo id, sin archivar', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    const results = await Promise.allSettled([
      catalog.linkPriceToStripe(planId, priceId),
      catalog.linkPriceToStripe(planId, priceId),
    ])

    assert.isTrue(results.every((r) => r.status === 'fulfilled'))
    const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value) as Array<{
      billingPlanPriceStripePriceId: string
      alreadyLinked: boolean
    }>
    assert.equal(values[0].billingPlanPriceStripePriceId, values[1].billingPlanPriceStripePriceId)
    assert.isTrue(values.some((v) => v.alreadyLinked))
    assert.equal(fake.calls.archiveCatalogProduct.length, 0)
    assert.equal(fake.calls.archiveCatalogPrice.length, 0)
  })

  test('CA-5 — ids distintos: archiva solo el perdedor', async ({ assert }) => {
    fake.distinctPriceIds = true
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    await Promise.allSettled([
      catalog.linkPriceToStripe(planId, priceId),
      catalog.linkPriceToStripe(planId, priceId),
    ])

    const saved = await BillingPlanPrice.findOrFail(priceId)
    for (const archived of fake.calls.archiveCatalogPrice) {
      assert.notEqual(archived, saved.billingPlanPriceStripePriceId)
    }
  })

  test('CA-6 — futura y borrador vinculables; sustituida y retirado rechazados', async ({
    assert,
  }) => {
    const catalog = new BillingCatalogService()
    const stamp = Date.now()
    const draftPlan = await catalog.createPlan({
      billingPlanName: `Draft link ${stamp}`,
    })
    const draftPrice = await BillingPlanPrice.create({
      billingPlanId: draftPlan.billingPlanId,
      billingPlanPriceAmount: 50,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: '2025-01-01',
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
    })
    await assert.doesNotReject(() =>
      catalog.linkPriceToStripe(draftPlan.billingPlanId, draftPrice.billingPlanPriceId)
    )

    const { planId, priceId } = await createPublishedPlanWithPrice()
    const future = await BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: 90,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: toBusinessDateString(DateTime.now().plus({ months: 3 })),
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
    })
    await assert.doesNotReject(() => catalog.linkPriceToStripe(planId, future.billingPlanPriceId))

    const old = await BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: 70,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: '2020-01-01',
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
    })

    try {
      await catalog.linkPriceToStripe(planId, old.billingPlanPriceId)
      assert.fail('Debió rechazar sustituida')
    } catch (error) {
      assert.instanceOf(error, BillingCatalogServiceError)
      assert.equal(
        (error as BillingCatalogServiceError).errorCode,
        BILLING_CATALOG_ERROR_CODES.PRICE_LINK_SUPERSEDED
      )
    }

    await catalog.deactivatePlan(planId)
    try {
      await catalog.linkPriceToStripe(planId, priceId)
      assert.fail('Debió rechazar plan retirado')
    } catch (error) {
      assert.equal(
        (error as BillingCatalogServiceError).errorCode,
        BILLING_CATALOG_ERROR_CODES.PRICE_LINK_PLAN_RETIRED
      )
    }
  })

  test('CA-7 — priceId ajeno o inválido → PRICE_NOT_FOUND', async ({ assert }) => {
    const { catalog, planId } = await createPublishedPlanWithPrice()
    for (const priceId of [999_999, Number.NaN]) {
      try {
        await catalog.linkPriceToStripe(planId, priceId as number)
        assert.fail('Debió lanzar')
      } catch (error) {
        assert.equal(
          (error as BillingCatalogServiceError).errorCode,
          BILLING_CATALOG_ERROR_CODES.PRICE_NOT_FOUND
        )
      }
    }
  })

  test('CA-8 — inconsistencias heredadas → 409 sin llamadas', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    const price = await BillingPlanPrice.findOrFail(priceId)
    price.billingPlanPriceStripePriceId = 'price_orphan'
    await price.save()

    try {
      await catalog.linkPriceToStripe(planId, priceId)
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        (error as BillingCatalogServiceError).errorCode,
        BILLING_CATALOG_ERROR_CODES.PRICE_LINK_INCONSISTENT
      )
    }
    assert.equal(fake.calls.createCatalogProduct.length, 0)
  })

  test('CA-10 — fallo al crear precio deja producto reutilizable', async ({ assert }) => {
    fake.failCreatePrice = true
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()

    try {
      await catalog.linkPriceToStripe(planId, priceId)
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal((error as { errorCode?: string }).errorCode, 'PLT.PRV.PROVIDER_REQUEST_FAILED')
    }

    const plan = await BillingPlan.findOrFail(planId)
    assert.equal(plan.billingPlanStripeProductId, `prod_fake_${planId}`)
    const price = await BillingPlanPrice.findOrFail(priceId)
    assert.equal(price.billingPlanPriceProvider, BILLING_PROVIDER_KEYS.MANUAL)
  })

  test('CA-11 — fallo al guardar compensa precio', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    const originalSave = BillingPlanPrice.prototype.save
    BillingPlanPrice.prototype.save = async function () {
      throw new Error('save blocked')
    }

    try {
      await catalog.linkPriceToStripe(planId, priceId)
      assert.fail('Debió lanzar')
    } catch {
      assert.include(fake.calls.archiveCatalogPrice[0], `price_fake_${priceId}`)
      const price = await BillingPlanPrice.findOrFail(priceId)
      assert.equal(price.billingPlanPriceProvider, BILLING_PROVIDER_KEYS.MANUAL)
    } finally {
      BillingPlanPrice.prototype.save = originalSave
    }
  })

  test('CA-16 — suscripción existente no cambia de proveedor', async ({ assert }) => {
    const { catalog, planId, priceId } = await createPublishedPlanWithPrice()
    const unit = await BusinessUnit.create({
      businessUnitName: 'Link stripe sub BU',
      businessUnitSlug: `link-stripe-sub-${Date.now()}`,
      businessUnitLegalName: 'Link stripe sub legal',
      businessUnitActive: 1,
    })
    const now = DateTime.now()
    const subscription = await BillingSubscription.create({
      businessUnitId: unit.businessUnitId,
      billingPlanId: planId,
      billingPlanPriceId: priceId,
      billingSubscriptionProvider: BILLING_PROVIDER_KEYS.MANUAL,
      billingSubscriptionStatus: 'active',
      billingSubscriptionContractedUnitAmount: 79,
      billingSubscriptionContractedEmployees: 10,
      billingSubscriptionDiscountPercent: 0,
      billingSubscriptionContractedTrialDays: 7,
      billingSubscriptionContractedCurrency: 'MXN',
      billingSubscriptionContractedTaxRate: 0.16,
      billingSubscriptionContractedSubtotal: 790,
      billingSubscriptionContractedTaxAmount: 126.4,
      billingSubscriptionContractedTotal: 916.4,
      billingSubscriptionCreditBalanceCents: 0,
      billingSubscriptionContractedEffectiveFrom: now,
      billingSubscriptionCurrentPeriodStart: now,
      billingSubscriptionCurrentPeriodEnd: now,
      billingSubscriptionSubscribedAt: now,
      billingSubscriptionLiveBusinessUnitId: unit.businessUnitId,
    })

    await catalog.linkPriceToStripe(planId, priceId)
    await subscription.refresh()
    assert.equal(subscription.billingSubscriptionProvider, BILLING_PROVIDER_KEYS.MANUAL)
  })
})

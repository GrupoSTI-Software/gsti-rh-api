import { test } from '@japa/runner'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingCatalogService from '#services/billing_catalog_service'
import { BILLING_CATALOG_ERROR_CODES } from '#constants/billing_catalog_error_codes'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import { BillingCatalogServiceError } from '#exceptions/billing_catalog_service_error'
import { resolveBillingCatalogApiError } from '#helpers/billing_catalog_api_error'

let defaultPlanId: number
let priceSeq = 0

async function createPersistedPrice(
  overrides: Partial<BillingPlanPrice> = {}
): Promise<BillingPlanPrice> {
  priceSeq += 1
  const day = String((priceSeq % 28) + 1).padStart(2, '0')
  const month = String((Math.floor(priceSeq / 28) % 12) + 1).padStart(2, '0')
  return BillingPlanPrice.create({
    billingPlanId: overrides.billingPlanId ?? defaultPlanId,
    billingPlanPriceAmount: overrides.billingPlanPriceAmount ?? 65,
    billingPlanPriceCurrency: overrides.billingPlanPriceCurrency ?? 'MXN',
    billingPlanPriceTaxRate: overrides.billingPlanPriceTaxRate ?? 0.16,
    billingPlanPriceTrialDays: overrides.billingPlanPriceTrialDays ?? 7,
    billingPlanPriceEffectiveFrom:
      overrides.billingPlanPriceEffectiveFrom ?? `2025-${month}-${day}`,
    billingPlanPriceStripePriceId: overrides.billingPlanPriceStripePriceId ?? null,
    billingPlanPriceProvider:
      overrides.billingPlanPriceProvider ?? BILLING_PROVIDER_KEYS.MANUAL,
  })
}

test.group('BillingPlanPrice — candado append-only (3743 / CA-7)', (group) => {
  group.setup(async () => {
    const catalog = new BillingCatalogService()
    const plan = await catalog.createPlan({
      billingPlanName: `Immutability ${Date.now()}`,
    })
    defaultPlanId = plan.billingPlanId
  })

  test('rechaza mutaciones fuera de la vinculación', async ({ assert }) => {
    const price = await createPersistedPrice()
    const cases: Array<(p: BillingPlanPrice) => void> = [
      (p) => {
        p.billingPlanPriceAmount = 99
      },
      (p) => {
        p.billingPlanPriceCurrency = 'USD'
      },
      (p) => {
        p.billingPlanPriceTaxRate = 0
      },
      (p) => {
        p.billingPlanPriceTrialDays = 0
      },
      (p) => {
        p.billingPlanPriceEffectiveFrom = '2026-01-01'
      },
      (p) => {
        p.billingPlanId = 999
      },
      (p) => {
        p.billingPlanPriceProvider = BILLING_PROVIDER_KEYS.STRIPE
      },
    ]

    for (const mutate of cases) {
      const row = await BillingPlanPrice.findOrFail(price.billingPlanPriceId)
      mutate(row)
      try {
        await row.save()
        assert.fail('Debió lanzar PRICE_IMMUTABLE')
      } catch (error) {
        assert.instanceOf(error, BillingCatalogServiceError)
        const typed = error as BillingCatalogServiceError
        assert.equal(typed.errorCode, BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE)
        assert.equal(typed.httpStatus, 422)
        assert.equal(typed.key, 'version-de-precio-inmutable')
        const resolved = resolveBillingCatalogApiError(error)
        assert.equal(resolved.title, 'Catálogo de cobro')
        assert.equal(resolved.code, BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE)
      }
      const reloaded = await BillingPlanPrice.findOrFail(price.billingPlanPriceId)
      assert.equal(String(reloaded.billingPlanPriceAmount), '65.00')
    }
  })

  test('rechaza desvincular o cambiar id en versión stripe', async ({ assert }) => {
    const price = await createPersistedPrice({
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.STRIPE,
      billingPlanPriceStripePriceId: 'price_A',
    })

    for (const mutate of [
      (p: BillingPlanPrice) => {
        p.billingPlanPriceProvider = BILLING_PROVIDER_KEYS.MANUAL
      },
      (p: BillingPlanPrice) => {
        p.billingPlanPriceStripePriceId = 'price_B'
      },
      (p: BillingPlanPrice) => {
        p.billingPlanPriceStripePriceId = null
      },
    ]) {
      const row = await BillingPlanPrice.findOrFail(price.billingPlanPriceId)
      mutate(row)
      try {
        await row.save()
        assert.fail('Debió lanzar')
      } catch (error) {
        assert.instanceOf(error, BillingCatalogServiceError)
        const typed = error as BillingCatalogServiceError
        assert.equal(typed.errorCode, BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE)
        assert.equal(typed.httpStatus, 422)
        assert.equal(typed.key, 'version-de-precio-inmutable')
        const resolved = resolveBillingCatalogApiError(error)
        assert.equal(resolved.title, 'Catálogo de cobro')
        assert.equal(resolved.code, BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE)
      }
    }
  })

  test('permite vinculación manual → stripe con id en el mismo save', async ({ assert }) => {
    const price = await createPersistedPrice()
    price.billingPlanPriceProvider = BILLING_PROVIDER_KEYS.STRIPE
    price.billingPlanPriceStripePriceId = 'price_link_ok'
    await price.save()
    await price.refresh()
    assert.equal(price.billingPlanPriceProvider, BILLING_PROVIDER_KEYS.STRIPE)
    assert.equal(price.billingPlanPriceStripePriceId, 'price_link_ok')
  })

  test('permite completar id en versión stripe pendiente', async ({ assert }) => {
    const price = await createPersistedPrice({
      billingPlanPriceProvider: BILLING_PROVIDER_KEYS.STRIPE,
      billingPlanPriceStripePriceId: null,
    })
    price.billingPlanPriceStripePriceId = 'price_pending_ok'
    await price.save()
    await price.refresh()
    assert.equal(price.billingPlanPriceStripePriceId, 'price_pending_ok')
  })

  test('save sin cambios no lanza', async ({ assert }) => {
    const price = await createPersistedPrice()
    await assert.doesNotReject(() => price.save())
  })
})

import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import ApiToken from '#models/api_token'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { providerRequestFailed } from '#modules/billing-provider/billing_provider.errors'
import {
  BILLING_PROVIDER_KEYS,
  type BillingCatalogProviderPort,
  type BillingProviderPort,
  type CatalogPriceDraft,
  type CatalogProductDraft,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import BillingCatalogService from '#services/billing_catalog_service'

const TEST_PASSWORD = 'BillingLinkStripe123!'

class FakeStripeCatalogAdapter implements BillingProviderPort, BillingCatalogProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  readonly calls = {
    createCatalogPrice: [] as CatalogPriceDraft[],
  }

  failCreatePrice = false

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
    return { externalId: `prod_fake_${draft.billingPlanId}` }
  }

  async createCatalogPrice(draft: CatalogPriceDraft) {
    this.calls.createCatalogPrice.push(draft)
    if (this.failCreatePrice) {
      throw providerRequestFailed('createCatalogPrice', {
        stripeErrorType: 'invalid_request_error',
        stripeRequestId: 'req_http',
      })
    }
    return { externalId: `price_fake_${draft.billingPlanPriceId}` }
  }

  async archiveCatalogProduct() {
    return undefined
  }

  async archiveCatalogPrice() {
    return undefined
  }
}

async function createPlatformAdmin(emailPrefix: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const person = await Person.create({
    personFirstname: 'Billing',
    personLastname: 'LinkStripe',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function loginPlatform(client: { post: (url: string) => { json: (body: Record<string, unknown>) => Promise<{ assertStatus: (code: number) => void; body: () => { data?: { token?: string } } }> } }, email: string) {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token
  if (!token) throw new Error('Sin token de plataforma')
  return token
}

async function createLinkFixture(): Promise<{ planId: number; priceId: number }> {
  const catalog = new BillingCatalogService()
  const stamp = Date.now()
  const plan = await catalog.createPlan({
    billingPlanName: `HTTP Link Stripe ${stamp}`,
  })
  const price = await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceProvider: BILLING_PROVIDER_KEYS.MANUAL,
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })
  await catalog.publishPlan(plan.billingPlanId)
  return { planId: plan.billingPlanId, priceId: price.billingPlanPriceId }
}

test.group('Billing catalog link-stripe HTTP (7553)', (group) => {
  let admin: Awaited<ReturnType<typeof createPlatformAdmin>> | null = null
  let restoreProvider: (() => void) | null = null
  let fake: FakeStripeCatalogAdapter

  group.setup(async () => {
    admin = await createPlatformAdmin('link-stripe-admin')
  })

  group.teardown(async () => {
    restoreProvider?.()
    if (admin) {
      await ApiToken.query().where('tokenable_id', admin.user.userId).delete()
      await User.query().where('user_id', admin.user.userId).delete()
      await Person.query().where('person_id', admin.person.personId).delete()
    }
  })

  group.each.setup(() => {
    fake = new FakeStripeCatalogAdapter()
    restoreProvider = billingProviderRegistry.register(fake)
  })

  group.each.teardown(() => {
    restoreProvider?.()
    restoreProvider = null
  })

  test('CA-9 — sin llaves Stripe responde STRIPE_NOT_CONFIGURED', async ({ client, assert }) => {
    restoreProvider?.()
    restoreProvider = billingProviderRegistry.register(
      new StripeBillingProviderAdapter({
        status: 'disabled',
        reason: 'missing-secret',
        warnings: [],
      })
    )

    const { planId, priceId } = await createLinkFixture()
    const token = await loginPlatform(client, admin!.user.userEmail)
    const response = await client
      .post(`/api/platform/billing/plans/${planId}/prices/${priceId}/link-stripe`)
      .header('Authorization', `Bearer ${token}`)
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({})

    response.assertStatus(500)
    const body = response.body() as { code?: string; detail?: string; key?: string }
    assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED)
    assert.equal(body.detail, BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL)
    assert.equal(body.key, 'stripe-no-configurado')

    const price = await BillingPlanPrice.findOrFail(priceId)
    assert.equal(price.billingPlanPriceProvider, BILLING_PROVIDER_KEYS.MANUAL)
  })

  test('CA-10 — fallo del proveedor en POST', async ({ client, assert }) => {
    fake.failCreatePrice = true
    const { planId, priceId } = await createLinkFixture()
    const token = await loginPlatform(client, admin!.user.userEmail)
    const response = await client
      .post(`/api/platform/billing/plans/${planId}/prices/${priceId}/link-stripe`)
      .header('Authorization', `Bearer ${token}`)
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({})

    response.assertStatus(500)
    const body = response.body() as { code?: string; key?: string }
    assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED)
    assert.equal(body.key, 'fallo-del-proveedor-de-cobro')
  })

  test('CA-15 — 200 ignora cuerpo malicioso; 403 sin token de plataforma', async ({
    client,
    assert,
  }) => {
    const { planId, priceId } = await createLinkFixture()
    const token = await loginPlatform(client, admin!.user.userEmail)
    const ok = await client
      .post(`/api/platform/billing/plans/${planId}/prices/${priceId}/link-stripe`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        billingPlanPriceStripePriceId: 'price_evil',
        billingPlanPriceProvider: 'manual',
        unitAmountCents: 999,
      })

    ok.assertStatus(200)
    const data = (ok.body() as { data?: { billingPlanPriceStripePriceId?: string; alreadyLinked?: boolean } })
      .data
    assert.equal(data?.billingPlanPriceStripePriceId, `price_fake_${priceId}`)
    assert.equal(data?.alreadyLinked, false)
    assert.equal(fake.calls.createCatalogPrice[0]?.unitAmountCents, 0)

    const forbidden = await client
      .post(`/api/platform/billing/plans/${planId}/prices/${priceId}/link-stripe`)
      .loginAs(admin!.user)
      .json({})

    forbidden.assertStatus(403)
    assert.equal((forbidden.body() as { key?: string }).key, 'AUTH.PLATFORM.FORBIDDEN')
  })
})

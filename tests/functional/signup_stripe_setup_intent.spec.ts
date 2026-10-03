import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import SignupDraft from '#models/signup_draft'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingCatalogService from '#services/billing_catalog_service'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import type {
  BillingProviderPort,
  BillingCheckoutProviderPort,
  CardSetupRequest,
  CardSetup,
  SubscriptionOpening,
  SubscriptionOpeningRequest,
  RecordedPaymentRequest,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import SignupDraftService, { SIGNUP_CARD_SETUP_UNAUTHORIZED_BODY } from '#services/signup_draft_service'
import type { I18n } from '@adonisjs/i18n'

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

const FIXTURE_TOKEN = '3f2b9c1e-7d4a-4e8b-9a61-5c0d2e7f8a90'
const SETUP_INTENT_URL = '/api/auth/signup/setup-intent'

class FakeStripeCheckoutAdapter implements BillingProviderPort, BillingCheckoutProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  calls: CardSetupRequest[] = []
  variant: 'stable' | 'race' = 'stable'

  async openSubscription(_request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    return {
      provider: BILLING_PROVIDER_KEYS.STRIPE,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment(_request: RecordedPaymentRequest): Promise<void> {}

  async prepareCardSetup(request: CardSetupRequest): Promise<CardSetup> {
    this.calls.push(request)
    const id = request.owner.signupDraftId
    const suffix = this.variant === 'race' ? `${Date.now()}-${Math.random()}` : String(id)
    return {
      customerRef: `cus_fake_${suffix}`,
      setupIntentRef: `seti_fake_${suffix}`,
      clientSecret: `seti_fake_${id}_secret_fixture`,
      publishableKey: 'pk_test_fixturePub1',
      confirmed: false,
    }
  }
}

async function createVerifiedDraft(params: {
  planId: number
  employees: number
  email?: string
  token?: string | null
  verified?: boolean
}): Promise<SignupDraft> {
  return SignupDraft.create({
    signupDraftEmail: params.email ?? `setup-intent-${Date.now()}@fixture.test`,
    signupDraftFirstName: 'Prospecto',
    signupDraftLastName: 'Fixture',
    signupDraftSecondLastName: null,
    signupDraftBusinessUnitName: 'Empresa Fixture',
    signupDraftBillingPlanId: params.planId,
    signupDraftContractedEmployees: params.employees,
    signupDraftPinCode: null,
    signupDraftPinExpiresAt: null,
    signupDraftEmailVerifiedAt: params.verified === false ? null : DateTime.now(),
    signupDraftToken: params.token === undefined ? FIXTURE_TOKEN : params.token,
  })
}

async function createManualPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Setup Intent Manual ${stamp}`,
    billingPlanDescription: 'Fixture manual',
    billingPlanProvider: 'manual',
  })
  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })
  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createStripePlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Setup Intent Stripe ${stamp}`,
    billingPlanDescription: 'Fixture stripe',
    billingPlanProvider: 'manual',
  })
  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 14,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: 'price_fake_1',
    billingPlanPriceProvider: 'stripe',
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })
  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

test.group('POST /api/auth/signup/setup-intent — manual (USRH1790718243123 CA-1)', () => {
  test('precio manual responde required false sin llamar al proveedor', async ({ client, assert }) => {
    const planId = await createManualPlan(Date.now())
    const draft = await createVerifiedDraft({ planId, employees: 30 })

    const response = await client.post(SETUP_INTENT_URL).json({
      signupDraftId: draft.signupDraftId,
      signupToken: FIXTURE_TOKEN,
    })

    response.assertStatus(200)
    assert.deepEqual(response.body(), { type: 'success', data: { required: false } })

    const reloaded = await SignupDraft.findOrFail(draft.signupDraftId)
    assert.isNull(reloaded.signupDraftStripeCustomerId)
    assert.isNull(reloaded.signupDraftStripeSetupIntentId)

    await draft.delete()
  })
})

test.group('POST /api/auth/signup/setup-intent — stripe (CA-3, CA-4)', (group) => {
  let restoreRegistry: (() => void) | null = null
  let fake: FakeStripeCheckoutAdapter

  group.each.setup(() => {
    fake = new FakeStripeCheckoutAdapter()
    restoreRegistry = billingProviderRegistry.register(fake)
  })

  group.each.teardown(() => {
    restoreRegistry?.()
  })

  test('crea refs en borrador y devuelve clientSecret', async ({ client, assert }) => {
    const planId = await createStripePlan(Date.now())
    const draft = await createVerifiedDraft({ planId, employees: 30 })

    const response = await client.post(SETUP_INTENT_URL).json({
      signupDraftId: draft.signupDraftId,
      signupToken: FIXTURE_TOKEN,
    })

    response.assertStatus(200)
    assert.equal(response.header('cache-control'), 'no-store')
    assert.deepEqual(response.body().data, {
      required: true,
      clientSecret: `seti_fake_${draft.signupDraftId}_secret_fixture`,
      publishableKey: 'pk_test_fixturePub1',
      cardConfirmed: false,
    })

    assert.equal(fake.calls.length, 1)
    assert.deepEqual(fake.calls[0].owner, {
      kind: 'signup_draft',
      signupDraftId: draft.signupDraftId,
    })
    assert.equal(fake.calls[0].email, draft.signupDraftEmail)
    assert.isNull(fake.calls[0].customerRef)
    assert.isNull(fake.calls[0].setupIntentRef)

    const reloaded = await SignupDraft.findOrFail(draft.signupDraftId)
    assert.equal(reloaded.signupDraftStripeCustomerId, `cus_fake_${draft.signupDraftId}`)
    assert.equal(reloaded.signupDraftStripeSetupIntentId, `seti_fake_${draft.signupDraftId}`)
    assert.notInclude(JSON.stringify(reloaded.serialize()), '_secret_')

    await draft.delete()
  })

  test('reutiliza customerRef y setupIntentRef en repeticiones', async ({ client, assert }) => {
    const planId = await createStripePlan(Date.now())
    const draft = await createVerifiedDraft({ planId, employees: 30 })

    for (let i = 0; i < 3; i++) {
      const response = await client.post(SETUP_INTENT_URL).json({
        signupDraftId: draft.signupDraftId,
        signupToken: FIXTURE_TOKEN,
      })
      response.assertStatus(200)
    }

    assert.equal(fake.calls.length, 3)
    assert.equal(fake.calls[1].customerRef, `cus_fake_${draft.signupDraftId}`)
    assert.equal(fake.calls[1].setupIntentRef, `seti_fake_${draft.signupDraftId}`)
    assert.equal(fake.calls[2].customerRef, `cus_fake_${draft.signupDraftId}`)
    assert.equal(fake.calls[2].setupIntentRef, `seti_fake_${draft.signupDraftId}`)

    await draft.delete()
  })
})

test.group('SignupDraftService.prepareCardSetup — rechazo uniforme (CA-5)', () => {
  test('siete casos devuelven el mismo 401 sin tocar Stripe', async ({ assert }) => {
    const service = new SignupDraftService(getI18nStub())
    const planId = await createManualPlan(Date.now())
    const verified = await createVerifiedDraft({ planId, employees: 30 })
    const unverified = await createVerifiedDraft({
      planId,
      employees: 30,
      email: `unverified-${Date.now()}@fixture.test`,
      verified: false,
    })
    const noToken = await createVerifiedDraft({
      planId,
      employees: 30,
      email: `notoken-${Date.now()}@fixture.test`,
      token: null,
    })

    const expected = SIGNUP_CARD_SETUP_UNAUTHORIZED_BODY
    const cases = [
      { signupDraftId: 9_999_999, signupToken: FIXTURE_TOKEN },
      { signupDraftId: verified.signupDraftId, signupToken: `${FIXTURE_TOKEN.slice(0, -1)}1` },
      { signupDraftId: unverified.signupDraftId, signupToken: FIXTURE_TOKEN },
      { signupDraftId: noToken.signupDraftId, signupToken: FIXTURE_TOKEN },
    ]

    for (const item of cases) {
      const result = await service.prepareCardSetup(item)
      assert.equal(result.status, 401)
      assert.deepEqual(result.body, expected)
    }

    const deleted = await createVerifiedDraft({
      planId,
      employees: 30,
      email: `deleted-${Date.now()}@fixture.test`,
    })
    await deleted.delete()
    const deletedResult = await service.prepareCardSetup({
      signupDraftId: deleted.signupDraftId,
      signupToken: FIXTURE_TOKEN,
    })
    assert.equal(deletedResult.status, 401)
    assert.deepEqual(deletedResult.body, expected)

    await verified.delete()
    await unverified.delete()
    await noToken.delete()
  })
})

test.group('POST /api/auth/signup/setup-intent — credencial antes de plan (CA-10)', () => {
  test('sin plan con token incorrecto responde 401 por HTTP', async ({ client, assert }) => {
    const draft = await SignupDraft.create({
      signupDraftEmail: `noplan-${Date.now()}@fixture.test`,
      signupDraftFirstName: 'A',
      signupDraftLastName: 'B',
      signupDraftSecondLastName: null,
      signupDraftBusinessUnitName: 'X',
      signupDraftBillingPlanId: null,
      signupDraftContractedEmployees: null,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: FIXTURE_TOKEN,
    })

    const response = await client.post(SETUP_INTENT_URL).json({
      signupDraftId: draft.signupDraftId,
      signupToken: `${FIXTURE_TOKEN.slice(0, -1)}9`,
    })

    response.assertStatus(401)
    assert.deepEqual(response.body(), SIGNUP_CARD_SETUP_UNAUTHORIZED_BODY)
    await draft.delete()
  })
})

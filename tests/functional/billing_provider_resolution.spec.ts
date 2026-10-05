import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import DiscountCode from '#models/discount_code'
import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { resolveBillingProviderApiError } from '#helpers/billing_provider_api_error'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import { ensureRole } from '#tests/helpers/ensure_role'

const TEST_PASSWORD = 'BillingProviderResolution123!'

class StripeProbeAdapter implements BillingProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  lastRequest: SubscriptionOpeningRequest | null = null

  async openSubscription(request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    this.lastRequest = request
    return {
      provider: BILLING_PROVIDER_KEYS.STRIPE,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment(_request: RecordedPaymentRequest): Promise<void> {
    return undefined
  }
}

async function createPublishedPlan(stamp: number, priceProvider = 'manual'): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Provider Resolution Plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1790708507467',
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
    billingPlanPriceProvider: priceProvider,
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createPlatformAdmin(): Promise<{ user: User; person: Person }> {
  const role = await ensureRole('root')
  const email = `platform-billing-provider-${Date.now()}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Platform',
    personLastname: 'Billing',
    personSecondLastname: 'Provider',
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

async function loginPlatformConsole(
  client: {
    post: (url: string) => {
      json: (body: Record<string, unknown>) => Promise<{
        assertStatus: (code: number) => void
        body: () => { data?: { token?: string } }
      }>
    }
  },
  email: string
): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
}

async function cleanupScene(params: {
  businessUnitId?: number
  planIds?: number[]
  allianceId?: number
  codeId?: number
}) {
  if (params.businessUnitId) {
    await AllianceAttribution.query().where('business_unit_id', params.businessUnitId).delete()
    await BillingSubscription.query().where('business_unit_id', params.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', params.businessUnitId).delete()
  }
  if (params.codeId) {
    await DiscountCode.query().where('discount_code_id', params.codeId).delete()
  }
  if (params.allianceId) {
    await Alliance.query().where('alliance_id', params.allianceId).delete()
  }
  for (const planId of params.planIds ?? []) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group('Billing provider — resolución en el alta (USRH1790708507467)', () => {
  test('CA-2: hereda stripe del precio cuando hay adaptador registrado', async ({ assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp, 'stripe')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Stripe Provider BU ${stamp}`,
      businessUnitSlug: `stripe-provider-bu-${stamp}`,
      businessUnitLegalName: `Stripe Provider Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const probe = new StripeProbeAdapter()
    const restore = billingProviderRegistry.register(probe)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        skipTrial: true,
      })

      assert.equal(subscription.billingSubscriptionProvider, 'stripe')
      const planPrice = await BillingPlanPrice.query().where('billing_plan_id', planId).firstOrFail()
      assert.deepEqual(probe.lastRequest, {
        businessUnitId: businessUnit.businessUnitId,
        billingPlanId: planId,
        billingPlanPriceId: planPrice.billingPlanPriceId,
        contractedEmployees: 10,
      })
    } finally {
      restore()
      await cleanupScene({ businessUnitId: businessUnit.businessUnitId, planIds: [planId] })
    }
  })

  test('CA-2: con precio manual la suscripción queda manual', async ({ assert }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp, 'manual')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Manual Provider BU ${stamp}`,
      businessUnitSlug: `manual-provider-bu-${stamp}`,
      businessUnitLegalName: `Manual Provider Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      assert.equal(subscription.billingSubscriptionProvider, 'manual')
    } finally {
      await cleanupScene({ businessUnitId: businessUnit.businessUnitId, planIds: [planId] })
    }
  })

  test('CA-4: alta de plataforma fail-closed sin escrituras parciales', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 2
    const manualPlanId = await createPublishedPlan(stamp, 'manual')
    const unknownProviderPlanId = await createPublishedPlan(stamp + 1, 'desconocido')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Fail Closed BU ${stamp}`,
      businessUnitSlug: `fail-closed-bu-${stamp}`,
      businessUnitLegalName: `Fail Closed Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const service = new BillingSubscriptionService()
    const live = await service.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: manualPlanId,
      contractedEmployees: 10,
      skipTrial: true,
    })

    const alliance = await Alliance.create({
      allianceName: `Alliance ${stamp}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 10,
      allianceDefaultTermPeriods: 12,
      allianceActive: 1,
    })
    const code = await DiscountCode.create({
      discountCodeCode: `PRV${stamp}`,
      discountCodeName: `Code ${stamp}`,
      discountCodeKind: 'percent',
      discountCodeValue: 5,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
      allianceId: alliance.allianceId,
    })
    const admin = await createPlatformAdmin()
    const platformToken = await loginPlatformConsole(client, admin.user.userEmail)
    const subsBefore = await BillingSubscription.query().where(
      'business_unit_id',
      businessUnit.businessUnitId
    )
    const redeemBefore = code.discountCodeRedeemedCount

    try {
      const response = await client
        .post('/api/platform/billing/subscriptions')
        .header('Authorization', `Bearer ${platformToken}`)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: unknownProviderPlanId,
          contractedEmployees: 20,
          replaceLiveSubscription: true,
          discountCode: code.discountCodeCode,
        })

      response.assertStatus(500)
      const body = response.body()
      assert.equal(body.title, 'Proveedor de cobro')
      assert.equal(body.detail, BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL)
      assert.equal(body.key, 'proveedor-de-cobro-no-soportado')
      assert.equal(body.code, 'PLT.PRV.ADAPTER_NOT_REGISTERED')

      const reloadedLive = await BillingSubscription.findOrFail(live.billingSubscriptionId)
      assert.equal(reloadedLive.billingSubscriptionStatus, 'active')
      assert.lengthOf(
        await BillingSubscription.query().where('business_unit_id', businessUnit.businessUnitId),
        subsBefore.length
      )
      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, redeemBefore)
      assert.lengthOf(
        await AllianceAttribution.query().where('business_unit_id', businessUnit.businessUnitId),
        0
      )
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planIds: [manualPlanId, unknownProviderPlanId],
        allianceId: alliance.allianceId,
        codeId: code.discountCodeId,
      })
      await User.query().where('user_id', admin.user.userId).delete()
      await Person.query().where('person_id', admin.person.personId).delete()
    }
  })

  test('7496-CA-6: precio stripe sin llaves → STRIPE_NOT_CONFIGURED y sin filas', async ({
    assert,
  }) => {
    const stamp = Date.now() + 20
    const planId = await createPublishedPlan(stamp, 'stripe')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Stripe Not Configured BU ${stamp}`,
      businessUnitSlug: `stripe-not-configured-bu-${stamp}`,
      businessUnitLegalName: `Stripe Not Configured Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const disabledAdapter = new StripeBillingProviderAdapter({
      status: 'disabled',
      reason: 'missing-secret',
      warnings: [],
    })
    const restore = billingProviderRegistry.register(disabledAdapter)
    const service = new BillingSubscriptionService()
    const subsBefore = await BillingSubscription.query().where(
      'business_unit_id',
      businessUnit.businessUnitId
    )

    try {
      let caught: unknown
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          skipTrial: true,
        })
      } catch (error) {
        caught = error
      }

      assert.instanceOf(caught, BillingProviderServiceError)
      const providerError = caught as BillingProviderServiceError
      assert.equal(providerError.errorCode, BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED)
      assert.deepEqual(resolveBillingProviderApiError(providerError), {
        title: 'Proveedor de cobro',
        detail: BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
        key: 'stripe-no-configurado',
        code: 'PLT.PRV.STRIPE_NOT_CONFIGURED',
        status: 500,
      })

      assert.lengthOf(
        await BillingSubscription.query().where('business_unit_id', businessUnit.businessUnitId),
        subsBefore.length
      )
    } finally {
      restore()
      await cleanupScene({ businessUnitId: businessUnit.businessUnitId, planIds: [planId] })
    }
  })

  test('7496-CA-7: precio stripe habilitado → OPERATION_NOT_AVAILABLE y sin filas', async ({
    assert,
  }) => {
    const stamp = Date.now() + 21
    const planId = await createPublishedPlan(stamp, 'stripe')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Stripe Op NA BU ${stamp}`,
      businessUnitSlug: `stripe-op-na-bu-${stamp}`,
      businessUnitLegalName: `Stripe Op NA Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const enabledAdapter = new StripeBillingProviderAdapter({
      status: 'enabled',
      mode: 'test',
      secretKey: 'sk_test_fixtureSecret1',
      publishableKey: 'pk_test_fixturePub1',
      webhookSecret: null,
    })
    const restore = billingProviderRegistry.register(enabledAdapter)
    const service = new BillingSubscriptionService()
    const subsBefore = await BillingSubscription.query().where(
      'business_unit_id',
      businessUnit.businessUnitId
    )

    try {
      let caught: unknown
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          skipTrial: true,
        })
      } catch (error) {
        caught = error
      }

      assert.instanceOf(caught, BillingProviderServiceError)
      const providerError = caught as BillingProviderServiceError
      assert.equal(providerError.errorCode, BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE)
      assert.equal(providerError.detail, BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL)

      assert.lengthOf(
        await BillingSubscription.query().where('business_unit_id', businessUnit.businessUnitId),
        subsBefore.length
      )
    } finally {
      restore()
      await cleanupScene({ businessUnitId: businessUnit.businessUnitId, planIds: [planId] })
    }
  })

  test('CA-8: changePlan conserva el proveedor de la suscripción', async ({ assert }) => {
    const stamp = Date.now() + 3
    const manualPlanA = await createPublishedPlan(stamp, 'manual')
    const manualPlanB = await createPublishedPlan(stamp + 100, 'manual')
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Change Plan Provider BU ${stamp}`,
      businessUnitSlug: `change-plan-provider-bu-${stamp}`,
      businessUnitLegalName: `Change Plan Provider Legal ${stamp}`,
      businessUnitActive: 1,
    })
    const service = new BillingSubscriptionService()
    const subscription = await service.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: manualPlanA,
      contractedEmployees: 10,
      skipTrial: true,
    })
    subscription.billingSubscriptionProvider = 'stripe'
    await subscription.save()

    try {
      const updated = await service.changePlan(subscription.billingSubscriptionId, manualPlanB)
      assert.equal(updated.billingSubscriptionProvider, 'stripe')
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planIds: [manualPlanA, manualPlanB],
      })
    }
  })
})

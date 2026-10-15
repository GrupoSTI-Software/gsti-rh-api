import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Stripe from 'stripe'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import BillingSubscription from '#models/billing_subscription'
import BusinessUnit from '#models/business_unit'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import BillingCustomerIdentityService, {
  toProviderCustomerAddress,
} from '#services/billing_customer_identity_service'
import type { TenantBillingProfileView } from '../../../app/interfaces/tenant_billing_profile_interface.js'
import TenantBillingProfileService from '#services/tenant_billing_profile_service'

const ENABLED_SETTINGS = {
  status: 'enabled' as const,
  mode: 'test' as const,
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: 'pk_test_fixturePub1',
  webhookSecret: null,
}

test.group('BillingCustomerIdentityService (VLRH-H1791925351695)', () => {
  test('toProviderCustomerAddress une calle y número', ({ assert }) => {
    const view = {
      street: 'Av. Juárez',
      exteriorNumber: '120',
      interiorNumber: '4B',
      neighborhood: 'Centro',
      municipality: 'Monterrey',
      state: 'Nuevo León',
      postalCode: '64000',
    } as TenantBillingProfileView
    assert.deepEqual(toProviderCustomerAddress(view), {
      line1: 'Av. Juárez 120',
      line2: '4B, Centro',
      city: 'Monterrey',
      state: 'Nuevo León',
      postalCode: '64000',
    })
  })

  test('CA-14: suscripción cancelada no llama al proveedor', async ({ assert }) => {
    let stripeCalls = 0
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => {
      stripeCalls += 1
      return {
        customers: { update: async () => ({}) },
        subscriptions: { update: async () => ({}) },
      } as unknown as Stripe
    })
    const restore = billingProviderRegistry.register(adapter)

    const sub = new BillingSubscription()
    sub.billingSubscriptionId = 9001
    sub.businessUnitId = 1
    sub.billingPlanId = 2
    sub.billingPlanPriceId = 3
    sub.billingSubscriptionProvider = 'stripe'
    sub.billingSubscriptionStatus = 'canceled'
    sub.billingSubscriptionStripeCustomerId = 'cus_x'
    sub.billingSubscriptionStripeSubscriptionId = 'sub_x'
    sub.updatedAt = DateTime.now()

    const service = new BillingCustomerIdentityService()
    try {
      await (service as unknown as { syncSubscriptionRow: (s: BillingSubscription, t: 'profile') => Promise<void> }).syncSubscriptionRow(
        sub,
        'profile'
      )
      assert.equal(stripeCalls, 0)
    } finally {
      restore()
    }
  })

  test('CA-10: fallo de Stripe no rechaza syncForSubscription', async ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () =>
      ({
        customers: {
          update: async () => {
            throw Object.assign(new Error('fixture'), {
              type: 'invalid_request_error',
              raw: { message: 'fixture' },
            })
          },
        },
        subscriptions: {
          update: async () => ({}),
        },
      }) as unknown as Stripe
    )
    const restore = billingProviderRegistry.register(adapter)

    const sub = new BillingSubscription()
    sub.billingSubscriptionId = 9002
    sub.businessUnitId = 1
    sub.billingPlanId = 2
    sub.billingPlanPriceId = 3
    sub.billingSubscriptionProvider = 'stripe'
    sub.billingSubscriptionStatus = 'active'
    sub.billingSubscriptionStripeCustomerId = 'cus_x'
    sub.billingSubscriptionStripeSubscriptionId = 'sub_x'
    sub.updatedAt = DateTime.now()

    const bu = new BusinessUnit()
    bu.businessUnitId = 1
    bu.businessUnitPublicId = 'bu_pub'
    bu.businessUnitLegalName = 'Empresa Fixture'

    const profileStub = {
      getForTenant: async () =>
        ({
          exists: false,
          legalName: 'Empresa Fixture',
          updatedAt: null,
        }) as TenantBillingProfileView,
    } as unknown as TenantBillingProfileService

    const service = new BillingCustomerIdentityService(profileStub)

    const originalBuQuery = BusinessUnit.query
    BusinessUnit.query = (() =>
      ({
        where: () => ({
          whereNull: () => ({
            first: async () => bu,
          }),
        }),
      })) as unknown as typeof BusinessUnit.query

    try {
      await assert.doesNotReject(() =>
        (service as unknown as { syncSubscriptionRow: (s: BillingSubscription, t: 'profile') => Promise<void> }).syncSubscriptionRow(
          sub,
          'profile'
        )
      )
    } finally {
      BusinessUnit.query = originalBuQuery
      restore()
    }
  })

  test('CA-6: perfil que lanza deja contact null en sync', async ({ assert }) => {
    const captured: unknown[] = []
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () =>
      ({
        customers: {
          update: async (_id: string, params: unknown) => {
            captured.push(params)
            return {}
          },
        },
        subscriptions: {
          update: async () => ({}),
        },
      }) as unknown as Stripe
    )
    const restore = billingProviderRegistry.register(adapter)

    const sub = new BillingSubscription()
    sub.billingSubscriptionId = 9003
    sub.businessUnitId = 5
    sub.billingPlanId = 2
    sub.billingPlanPriceId = 3
    sub.billingSubscriptionProvider = 'stripe'
    sub.billingSubscriptionStatus = 'active'
    sub.billingSubscriptionStripeCustomerId = 'cus_x'
    sub.billingSubscriptionStripeSubscriptionId = 'sub_x'
    sub.updatedAt = DateTime.now()

    const bu = new BusinessUnit()
    bu.businessUnitId = 5
    bu.businessUnitPublicId = 'bu_5'
    bu.businessUnitLegalName = 'Legal Name Fixture'

    const profileStub = {
      getForTenant: async () => {
        throw new Error('profile read failed')
      },
    } as unknown as TenantBillingProfileService

    const service = new BillingCustomerIdentityService(profileStub)
    const originalBuQuery = BusinessUnit.query
    BusinessUnit.query = (() =>
      ({
        where: () => ({
          whereNull: () => ({
            first: async () => bu,
          }),
        }),
      })) as unknown as typeof BusinessUnit.query

    try {
      await (service as unknown as { syncSubscriptionRow: (s: BillingSubscription, t: 'profile') => Promise<void> }).syncSubscriptionRow(
        sub,
        'profile'
      )
      const params = captured[0] as { email?: string; address?: unknown; name?: string }
      assert.equal(params.name, 'Legal Name Fixture')
      assert.notProperty(params, 'email')
      assert.notProperty(params, 'address')
    } finally {
      BusinessUnit.query = originalBuQuery
      restore()
    }
  })

  test('STRIPE_NOT_CONFIGURED no rechaza syncForSubscription', async ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(
      {
        status: 'disabled',
        reason: 'missing-secret',
        warnings: [],
      },
      () => ({}) as Stripe
    )
    const restore = billingProviderRegistry.register(adapter)

    const sub = new BillingSubscription()
    sub.billingSubscriptionId = 9004
    sub.businessUnitId = 1
    sub.billingPlanId = 2
    sub.billingPlanPriceId = 3
    sub.billingSubscriptionProvider = 'stripe'
    sub.billingSubscriptionStatus = 'active'
    sub.billingSubscriptionStripeCustomerId = 'cus_x'
    sub.billingSubscriptionStripeSubscriptionId = 'sub_x'
    sub.updatedAt = DateTime.now()

    const bu = new BusinessUnit()
    bu.businessUnitId = 1
    bu.businessUnitPublicId = 'bu_1'
    bu.businessUnitLegalName = 'Empresa'

    const profileStub = {
      getForTenant: async () =>
        ({
          exists: false,
          legalName: 'Empresa',
          updatedAt: null,
        }) as TenantBillingProfileView,
    } as unknown as TenantBillingProfileService

    const service = new BillingCustomerIdentityService(profileStub)
    const originalBuQuery = BusinessUnit.query
    BusinessUnit.query = (() =>
      ({
        where: () => ({
          whereNull: () => ({
            first: async () => bu,
          }),
        }),
      })) as unknown as typeof BusinessUnit.query

    try {
      await assert.doesNotReject(() =>
        (service as unknown as { syncSubscriptionRow: (s: BillingSubscription, t: 'profile') => Promise<void> }).syncSubscriptionRow(
          sub,
          'profile'
        )
      )
      assert.equal(BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED, 'PLT.PRV.STRIPE_NOT_CONFIGURED')
    } finally {
      BusinessUnit.query = originalBuQuery
      restore()
    }
  })
})

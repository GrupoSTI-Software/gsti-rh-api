import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_PROVIDER_STATE_MISMATCH_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { resolveBillingProviderApiError } from '#helpers/billing_provider_api_error'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'
import BillingProviderSubscriptionStateHandler, {
  decideProviderStatus,
  isProviderTransitionDuplicate,
  providerEventBusinessDate,
  type ProviderStatusDecision,
} from '#modules/billing-provider/billing_provider_subscription_state.handler'
import type { BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type BillingSubscriptionStateProviderPort,
  type ProviderPaymentFailure,
  type ProviderSubscriptionState,
  type ProviderSubscriptionStatus,
} from '#modules/billing-provider/billing_provider.port'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'

const LOCALS: BillingSubscriptionStatus[] = ['trialing', 'active', 'past_due', 'canceled']
const REMOTES: ProviderSubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
  'unknown',
]

function decisionKey(decision: ProviderStatusDecision): string {
  if (decision.kind === 'none') {
    return 'none'
  }
  if (decision.kind === 'alert') {
    return `alert:${decision.alert}`
  }
  return `write:${decision.to}:${decision.reason}`
}

function expectedDecision(
  local: BillingSubscriptionStatus,
  remote: ProviderSubscriptionStatus
): ProviderStatusDecision {
  const live = local === 'trialing' || local === 'active'

  if (remote === 'past_due') {
    if (live) return { kind: 'write', to: 'past_due', reason: 'provider_past_due' }
    if (local === 'past_due') return { kind: 'none' }
    return { kind: 'alert', alert: 'local-canceled' }
  }
  if (remote === 'unpaid') {
    if (live) return { kind: 'write', to: 'past_due', reason: 'provider_unpaid' }
    if (local === 'past_due') return { kind: 'none' }
    return { kind: 'alert', alert: 'local-canceled' }
  }
  if (remote === 'canceled' || remote === 'incomplete_expired') {
    if (local === 'canceled') return { kind: 'none' }
    return { kind: 'write', to: 'canceled', reason: 'provider_canceled' }
  }
  if (remote === 'active' || remote === 'trialing') {
    if (local === 'canceled') return { kind: 'alert', alert: 'local-canceled' }
    return { kind: 'none' }
  }
  if (local === 'canceled') {
    return { kind: 'alert', alert: 'local-canceled' }
  }
  return { kind: 'alert', alert: 'unexpected-status' }
}

class FakeStateProvider implements BillingProviderPort, BillingSubscriptionStateProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  state: ProviderSubscriptionState = {
    subscriptionRef: 'sub_fixtureUnit',
    customerRef: 'cus_fixtureUnit',
    status: 'past_due',
  }
  failure: ProviderPaymentFailure = {
    invoiceRef: 'in_fixtureUnit',
    subscriptionRef: 'sub_fixtureUnit',
    customerRef: 'cus_fixtureUnit',
    errorCode: null,
    declineCode: null,
    intentStatus: null,
  }
  readSubscriptionStateImpl: (() => Promise<ProviderSubscriptionState>) | null = null

  async readSubscriptionState(subscriptionRef: string): Promise<ProviderSubscriptionState> {
    if (this.readSubscriptionStateImpl) {
      return this.readSubscriptionStateImpl()
    }
    const ref = this.state.subscriptionRef || subscriptionRef
    return { ...this.state, subscriptionRef: ref }
  }

  async readInvoicePaymentFailure(invoiceRef: string): Promise<ProviderPaymentFailure> {
    return { ...this.failure, invoiceRef }
  }

  async openSubscription(): Promise<never> {
    throw new Error('not used')
  }
  async admitRecordedPayment(): Promise<void> {
    throw new Error('not used')
  }
  verifyWebhookEvent(): never {
    throw new Error('not used')
  }
}

async function createStripeSubscriptionUnitFixture(): Promise<
  BillingSubscription & { subRef: string; cusRef: string }
> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const subRef = `sub_fixtureUnit_${stamp}`
  const cusRef = `cus_fixtureUnit_${stamp}`
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Unit State Plan ${stamp}`,
    billingPlanDescription: '7723 unit',
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

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Unit State BU ${stamp}`
  businessUnit.businessUnitSlug = `unit-state-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Unit State Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: plan.billingPlanId,
    contractedEmployees: 10,
    skipTrial: true,
  })
  subscription.billingSubscriptionProvider = BILLING_PROVIDER_KEYS.STRIPE
  subscription.billingSubscriptionStripeSubscriptionId = subRef
  subscription.billingSubscriptionStripeCustomerId = cusRef
  subscription.billingSubscriptionStatus = 'active'
  await subscription.save()
  return Object.assign(subscription, { subRef, cusRef })
}

async function cleanupUnitSubscription(subscriptionId: number): Promise<void> {
  await BillingSubscriptionTransition.query()
    .where('billing_subscription_id', subscriptionId)
    .delete()
  const sub = await BillingSubscription.find(subscriptionId)
  if (sub) {
    await sub.delete()
  }
}

test.group('BillingProviderSubscriptionStateHandler — funciones puras (7723 / CA-6)', () => {
  test('decideProviderStatus: tabla 4×9', ({ assert }) => {
    for (const local of LOCALS) {
      for (const remote of REMOTES) {
        const expected = expectedDecision(local, remote)
        const actual = decideProviderStatus(local, remote)
        assert.equal(
          decisionKey(actual),
          decisionKey(expected),
          `local=${local} remote=${remote}`
        )
      }
    }
  })

  test('providerEventBusinessDate en America/Mexico_City', ({ assert }) => {
    assert.equal(providerEventBusinessDate(1_789_536_600), '2026-09-15')
    assert.equal(providerEventBusinessDate(1_789_540_200), '2026-09-16')
  })

  test('isProviderTransitionDuplicate por nombre de índice', ({ assert }) => {
    assert.isTrue(
      isProviderTransitionDuplicate({
        code: 'ER_DUP_ENTRY',
        sqlMessage:
          "Duplicate entry for key 'billing_subscription_transitions.uq_billing_sub_transition_cut_origin'",
      })
    )
    assert.isTrue(
      isProviderTransitionDuplicate({
        original: {
          code: 'ER_DUP_ENTRY',
          sqlMessage: 'uq_billing_sub_transition_cut_origin',
        },
      })
    )
    assert.isFalse(
      isProviderTransitionDuplicate({
        code: 'ER_DUP_ENTRY',
        sqlMessage: 'uq_billing_subscription_live_business_unit',
      })
    )
    assert.isFalse(isProviderTransitionDuplicate(new Error('Duplicate entry')))
    assert.isFalse(isProviderTransitionDuplicate(null))
  })
})

test.group('BillingProviderSubscriptionStateHandler — handle (7723)', () => {
  test('CA-7: transición duplicada por índice → processed sin relanzar', async ({ assert }) => {
    const subscription = await createStripeSubscriptionUnitFixture()
    await BillingSubscriptionTransition.create({
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingSubscriptionTransitionFrom: 'active',
      billingSubscriptionTransitionTo: 'past_due',
      billingSubscriptionTransitionReason: 'provider_past_due',
      billingSubscriptionTransitionCutDate: DateTime.fromISO('2026-09-20'),
      billingSubscriptionTransitionOrigin: 'provider',
      billingSubscriptionTransitionOriginKey: 'evt_fixtureS2h',
    })

    const provider = new FakeStateProvider()
    provider.state = {
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      status: 'past_due',
    }

    const handler = new BillingProviderSubscriptionStateHandler()
    const outcome = await handler.handle({
      event: {
        id: 'evt_fixtureS2h',
        type: 'customer.subscription.updated',
        objectType: 'subscription',
        objectId: subscription.subRef,
        createdAt: 1_789_916_400,
        livemode: false,
        fromConnectedAccount: false,
        object: {
          subscriptionRef: subscription.subRef,
          customerRef: subscription.cusRef,
          status: 'past_due',
        },
      },
      billingSubscription: subscription,
      provider,
    })

    assert.deepEqual(outcome, { status: 'processed' })
    await subscription.refresh()
    assert.equal(subscription.billingSubscriptionStatus, 'active')
    assert.lengthOf(
      await BillingSubscriptionTransition.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      ),
      1
    )
    await cleanupUnitSubscription(subscription.billingSubscriptionId)
  })

  test('CA-8: pago concurrente gana sobre estado releído past_due', async ({ assert }) => {
    const subscription = await createStripeSubscriptionUnitFixture()
    const provider = new FakeStateProvider()
    provider.state = {
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      status: 'past_due',
    }

    const commitOrder: string[] = []
    let paymentDone: Promise<void> = Promise.resolve()
    provider.readSubscriptionStateImpl = async () => {
      paymentDone = db.transaction(async (trx) => {
        const locked = await BillingSubscription.query({ client: trx })
          .where('billing_subscription_id', subscription.billingSubscriptionId)
          .forUpdate()
          .firstOrFail()
        locked.billingSubscriptionStatus = 'active'
        await locked.save()
        commitOrder.push('payment')
      })
      return { ...provider.state }
    }

    const handler = new BillingProviderSubscriptionStateHandler()
    await handler.handle({
      event: {
        id: 'evt_fixtureRace',
        type: 'customer.subscription.updated',
        objectType: 'subscription',
        objectId: subscription.subRef,
        createdAt: 1_789_916_400,
        livemode: false,
        fromConnectedAccount: false,
        object: {
          subscriptionRef: subscription.subRef,
          customerRef: subscription.cusRef,
          status: 'past_due',
        },
      },
      billingSubscription: subscription,
      provider,
    })
    commitOrder.push('handler')
    await paymentDone
    await subscription.refresh()
    assert.equal(subscription.billingSubscriptionStatus, 'active')
    assert.deepEqual(commitOrder, ['handler', 'payment'])
    await cleanupUnitSubscription(subscription.billingSubscriptionId)
  })

  test('CA-11: mismatch expone code, key y resolveBillingProviderApiError', async ({ assert }) => {
    const subscription = await createStripeSubscriptionUnitFixture()
    const provider = new FakeStateProvider()
    provider.state = {
      subscriptionRef: 'sub_fixtureB',
      customerRef: subscription.cusRef,
      status: 'past_due',
    }

    const handler = new BillingProviderSubscriptionStateHandler()
    let caught: unknown
    try {
      await handler.handle({
        event: {
          id: 'evt_fixtureMismatchUnit',
          type: 'customer.subscription.updated',
          objectType: 'subscription',
          objectId: subscription.subRef,
          createdAt: 1_789_916_400,
          livemode: false,
          fromConnectedAccount: false,
          object: {
            subscriptionRef: subscription.subRef,
            customerRef: subscription.cusRef,
            status: 'past_due',
          },
        },
        billingSubscription: subscription,
        provider,
      })
    } catch (error) {
      caught = error
    }

    assert.instanceOf(caught, BillingProviderServiceError)
    const typed = caught as BillingProviderServiceError
    assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.PROVIDER_STATE_MISMATCH)
    assert.equal(typed.httpStatus, 500)
    assert.equal(typed.key, 'estado-del-proveedor-no-coincide')
    assert.equal(typed.detail, BILLING_PROVIDER_PROVIDER_STATE_MISMATCH_DETAIL)
    assert.deepEqual(resolveBillingProviderApiError(typed), {
      title: 'Proveedor de cobro',
      detail: BILLING_PROVIDER_PROVIDER_STATE_MISMATCH_DETAIL,
      key: 'estado-del-proveedor-no-coincide',
      code: BILLING_PROVIDER_ERROR_CODES.PROVIDER_STATE_MISMATCH,
      status: 500,
    })
    await cleanupUnitSubscription(subscription.billingSubscriptionId)
  })

  test('CA-12: proveedor manual sin interfaz de estado → OPERATION_NOT_AVAILABLE', async ({
    assert,
  }) => {
    const subscription = await createStripeSubscriptionUnitFixture()
    const handler = new BillingProviderSubscriptionStateHandler()
    let caught: unknown
    try {
      await handler.handle({
        event: {
          id: 'evt_fixtureNoStatePort',
          type: 'customer.subscription.updated',
          objectType: 'subscription',
          objectId: subscription.subRef,
          createdAt: 1_789_916_400,
          livemode: false,
          fromConnectedAccount: false,
          object: {
            subscriptionRef: subscription.subRef,
            customerRef: subscription.cusRef,
            status: 'past_due',
          },
        },
        billingSubscription: subscription,
        provider: new ManualBillingProviderAdapter(),
      })
    } catch (error) {
      caught = error
    }

    const typed = caught as BillingProviderServiceError
    assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE)
    assert.equal(typed.key, 'operacion-de-cobro-no-disponible')
    await cleanupUnitSubscription(subscription.billingSubscriptionId)
  })
})

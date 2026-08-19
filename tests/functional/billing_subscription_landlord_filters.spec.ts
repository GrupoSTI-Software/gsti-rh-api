import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { listBillingSubscriptionsValidator } from '#validators/billing_subscription'
import { BillingSubscriptionServiceError } from '../../app/exceptions/billing_subscription_service_error.js'

/**
 * USRH1785962095092 — filtrado y paginación server-side de
 * `GET /api/platform/billing/subscriptions`. Ejercita
 * `BillingSubscriptionService.listSubscriptions(filters)` directamente,
 * mismo criterio que el resto de la suite de suscripciones.
 */

async function createPublishedPlan(stamp: number, name = 'Filter Plan'): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `${name} ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1785962095092',
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

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Filter BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `filter-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Filter Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
  contractedEmployees: number
  contractedTotal: number
  trialEndsAt?: string | null
  deleted?: boolean
}

async function createSubscription(fixture: SubscriptionFixture): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.billingPlanId)
    .firstOrFail()

  const subscription = await BillingSubscription.create({
    businessUnitId: fixture.businessUnitId,
    billingPlanId: fixture.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: fixture.contractedEmployees,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: fixture.trialEndsAt ? 7 : 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: fixture.contractedTotal,
    billingSubscriptionContractedTaxAmount: 0,
    billingSubscriptionContractedTotal: fixture.contractedTotal,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: fixture.trialEndsAt ? DateTime.fromISO(fixture.trialEndsAt) : null,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId:
      fixture.status === 'canceled' ? null : fixture.businessUnitId,
  })

  if (fixture.deleted) {
    await subscription.delete()
  }

  return subscription
}

async function cleanup(businessUnitIds: number[], planIds: number[]) {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await subscription.forceDelete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }
  }
}

test.group('BillingSubscriptionService.listSubscriptions — filtros y paginación (USRH1785962095092)', () => {
  test('Criterio 1 — filtrar por empresa acota el listado y el conteo', async ({ assert }) => {
    const stamp = Date.now() + 200
    const planId = await createPublishedPlan(stamp)
    const buA = await createBusinessUnit(stamp, 'acme')
    const buB = await createBusinessUnit(stamp, 'other')

    await createSubscription({
      businessUnitId: buA.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
    })
    await createSubscription({
      businessUnitId: buB.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 20,
      contractedTotal: 200,
    })

    const service = new BillingSubscriptionService()
    try {
      const result = await service.listSubscriptions({ search: `acme ${stamp}` })
      assert.equal(result.meta.total, 1)
      assert.equal(result.data.length, 1)
      assert.equal(result.data[0].businessUnitId, buA.businessUnitId)
    } finally {
      await cleanup([buA.businessUnitId, buB.businessUnitId], [planId])
    }
  })

  test('Criterio 2 — los criterios se combinan con AND', async ({ assert }) => {
    const stamp = Date.now() + 201
    const planId = await createPublishedPlan(stamp)
    const buA = await createBusinessUnit(stamp, 'combo')

    await createSubscription({
      businessUnitId: buA.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
      contractedEmployees: 10,
      contractedTotal: 100,
    })

    const service = new BillingSubscriptionService()
    try {
      const matching = await service.listSubscriptions({
        search: `combo ${stamp}`,
        status: 'past_due',
        billingPlanId: planId,
      })
      assert.equal(matching.meta.total, 1)

      const nonMatching = await service.listSubscriptions({
        search: `combo ${stamp}`,
        status: 'active',
        billingPlanId: planId,
      })
      assert.equal(nonMatching.meta.total, 0)
      assert.deepEqual(nonMatching.data, [])
    } finally {
      await cleanup([buA.businessUnitId], [planId])
    }
  })

  test('Criterio 3 — rango de fin de prueba excluye las que no tienen fecha', async ({
    assert,
  }) => {
    const stamp = Date.now() + 202
    const planId = await createPublishedPlan(stamp)
    const buWithTrial = await createBusinessUnit(stamp, 'trial')
    const buNoTrial = await createBusinessUnit(stamp, 'no-trial')

    await createSubscription({
      businessUnitId: buWithTrial.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      contractedEmployees: 10,
      contractedTotal: 100,
      trialEndsAt: '2026-08-15',
    })
    await createSubscription({
      businessUnitId: buNoTrial.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
      trialEndsAt: null,
    })

    const service = new BillingSubscriptionService()
    try {
      const result = await service.listSubscriptions({
        billingPlanId: planId,
        trialEndsFrom: '2026-08-01',
        trialEndsTo: '2026-08-31',
      })
      assert.equal(result.meta.total, 1)
      assert.equal(result.data[0].businessUnitId, buWithTrial.businessUnitId)
    } finally {
      await cleanup([buWithTrial.businessUnitId, buNoTrial.businessUnitId], [planId])
    }
  })

  test('Criterio 4 — rango de fechas invertido se rechaza con PLT.SUB.VAL_INPUT', async ({
    assert,
  }) => {
    const service = new BillingSubscriptionService()
    let thrown: unknown = null
    try {
      await service.listSubscriptions({ trialEndsFrom: '2026-09-01', trialEndsTo: '2026-08-01' })
    } catch (error) {
      thrown = error
    }

    assert.instanceOf(thrown, BillingSubscriptionServiceError)
    assert.equal((thrown as BillingSubscriptionServiceError).errorCode, 'PLT.SUB.VAL_INPUT')
    assert.equal((thrown as BillingSubscriptionServiceError).httpStatus, 422)
  })

  test('Criterio 5 — estado inexistente se rechaza en el validador de query', async ({
    assert,
  }) => {
    let thrown: unknown = null
    try {
      await listBillingSubscriptionsValidator.validate({ status: 'vencida' })
    } catch (error) {
      thrown = error
    }
    assert.isNotNull(thrown)
  })

  test('rangos numéricos invertidos (minEmployees > maxEmployees, minTotal > maxTotal) se rechazan', async ({
    assert,
  }) => {
    const service = new BillingSubscriptionService()

    let employeesError: unknown = null
    try {
      await service.listSubscriptions({ minEmployees: 50, maxEmployees: 10 })
    } catch (error) {
      employeesError = error
    }
    assert.equal((employeesError as BillingSubscriptionServiceError)?.errorCode, 'PLT.SUB.VAL_INPUT')

    let totalError: unknown = null
    try {
      await service.listSubscriptions({ minTotal: 500, maxTotal: 100 })
    } catch (error) {
      totalError = error
    }
    assert.equal((totalError as BillingSubscriptionServiceError)?.errorCode, 'PLT.SUB.VAL_INPUT')
  })

  test('Criterio 6 — combinación válida sin coincidencias devuelve lista vacía, no error', async ({
    assert,
  }) => {
    const stamp = Date.now() + 203
    const planId = await createPublishedPlan(stamp)
    const buA = await createBusinessUnit(stamp, 'empty')

    await createSubscription({
      businessUnitId: buA.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
    })

    const service = new BillingSubscriptionService()
    try {
      const result = await service.listSubscriptions({
        billingPlanId: planId,
        status: 'canceled',
      })
      assert.deepEqual(result.data, [])
      assert.equal(result.meta.total, 0)
    } finally {
      await cleanup([buA.businessUnitId], [planId])
    }
  })

  test('rango de empleados y de total contratado acotan el listado', async ({ assert }) => {
    const stamp = Date.now() + 204
    const planId = await createPublishedPlan(stamp)
    const buSmall = await createBusinessUnit(stamp, 'small')
    const buBig = await createBusinessUnit(stamp, 'big')

    await createSubscription({
      businessUnitId: buSmall.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
    })
    await createSubscription({
      businessUnitId: buBig.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 100,
      contractedTotal: 5000,
    })

    const service = new BillingSubscriptionService()
    try {
      const byEmployees = await service.listSubscriptions({
        billingPlanId: planId,
        minEmployees: 50,
      })
      assert.equal(byEmployees.meta.total, 1)
      assert.equal(byEmployees.data[0].businessUnitId, buBig.businessUnitId)

      const byTotal = await service.listSubscriptions({ billingPlanId: planId, maxTotal: 200 })
      assert.equal(byTotal.meta.total, 1)
      assert.equal(byTotal.data[0].businessUnitId, buSmall.businessUnitId)
    } finally {
      await cleanup([buSmall.businessUnitId, buBig.businessUnitId], [planId])
    }
  })

  test('las eliminadas lógicamente siguen excluidas y las canceladas siguen incluidas', async ({
    assert,
  }) => {
    const stamp = Date.now() + 205
    const planId = await createPublishedPlan(stamp)
    const buDeleted = await createBusinessUnit(stamp, 'deleted')
    const buCanceled = await createBusinessUnit(stamp, 'canceled')

    await createSubscription({
      businessUnitId: buDeleted.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
      deleted: true,
    })
    await createSubscription({
      businessUnitId: buCanceled.businessUnitId,
      billingPlanId: planId,
      status: 'canceled',
      contractedEmployees: 10,
      contractedTotal: 100,
    })

    const service = new BillingSubscriptionService()
    try {
      const result = await service.listSubscriptions({ billingPlanId: planId })
      const ids = result.data.map((s) => s.businessUnitId)
      assert.isFalse(ids.includes(buDeleted.businessUnitId))
      assert.isTrue(ids.includes(buCanceled.businessUnitId))
    } finally {
      await cleanup([buDeleted.businessUnitId, buCanceled.businessUnitId], [planId])
    }
  })

  test('billingPlanId inexistente devuelve lista vacía, no 404', async ({ assert }) => {
    const service = new BillingSubscriptionService()
    const result = await service.listSubscriptions({ billingPlanId: 999_999_999 })
    assert.deepEqual(result.data, [])
    assert.equal(result.meta.total, 0)
  })

  test('página mayor que la última página devuelve lista vacía con meta coherente', async ({
    assert,
  }) => {
    const stamp = Date.now() + 206
    const planId = await createPublishedPlan(stamp)
    const buA = await createBusinessUnit(stamp, 'paged')

    await createSubscription({
      businessUnitId: buA.businessUnitId,
      billingPlanId: planId,
      status: 'active',
      contractedEmployees: 10,
      contractedTotal: 100,
    })

    const service = new BillingSubscriptionService()
    try {
      const result = await service.listSubscriptions({ billingPlanId: planId, page: 99, limit: 20 })
      assert.deepEqual(result.data, [])
      assert.equal(result.meta.total, 1)
      assert.equal(result.meta.page, 99)
      assert.equal(result.meta.lastPage, 1)
    } finally {
      await cleanup([buA.businessUnitId], [planId])
    }
  })

  test('Criterio 7 — sin filtros el comportamiento es el actual: orden asc y meta.total del sistema', async ({
    assert,
  }) => {
    const service = new BillingSubscriptionService()
    const result = await service.listSubscriptions()
    assert.isTrue(result.meta.total >= 0)
    assert.equal(result.meta.page, 1)
    assert.equal(result.meta.limit, 20)
    for (let i = 1; i < result.data.length; i++) {
      assert.isTrue(result.data[i - 1].billingSubscriptionId < result.data[i].billingSubscriptionId)
    }
  })
})

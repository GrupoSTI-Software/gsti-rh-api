import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toBusinessDateString } from '#utils/business_date'

/**
 * USRH1787714804407 — `discountBenefitRestoredFrom` en el detalle de
 * suscripción (`getSubscriptionDetail`, `GET /api/platform/billing/subscriptions/:id`).
 *
 * Espeja el patrón de `billing_subscription_pending_increase_detail.spec.ts`
 * (misma lectura auxiliar sin `join`, mismo enriquecimiento del detalle).
 * Cubre las cuatro situaciones del §4.2: sin código, beneficio vigente,
 * beneficio indefinido y beneficio agotado (con la fecha derivada del pago
 * que lo consumió).
 */
const TAX_RATE = 0.16
const CODE_TEXT = 'FJGHA897'

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `HU11 Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787714804407',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: TAX_RATE,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 10,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `HU11 BU ${stamp}`
  businessUnit.businessUnitSlug = `hu11-bu-${stamp}`
  businessUnit.businessUnitLegalName = `HU11 Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface FixtureOptions {
  discountCode?: {
    text: string
    kind: 'percent' | 'fixed_amount' | 'unit_price'
    value: number
    benefitPeriods: number | null
    benefitPeriodsUsed: number
  }
}

async function createSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  options: FixtureOptions = {}
): Promise<BillingSubscription> {
  const price = await BillingPlanPrice.query().where('billing_plan_id', planId).firstOrFail()
  const now = DateTime.now()
  const code = options.discountCode

  return BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: 79,
    billingSubscriptionContractedEmployees: 120,
    billingSubscriptionDiscountPercent: 10,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: 8532.0,
    billingSubscriptionContractedTaxAmount: 1365.12,
    billingSubscriptionContractedTotal: 9897.12,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
    billingSubscriptionDiscountCodeText: code?.text ?? null,
    billingSubscriptionDiscountCodeKind: code?.kind ?? null,
    billingSubscriptionDiscountCodeValue: code?.value ?? null,
    billingSubscriptionDiscountCodeBenefitPeriods: code?.benefitPeriods ?? null,
    billingSubscriptionDiscountCodeBenefitPeriodsUsed: code?.benefitPeriodsUsed ?? 0,
  })
}

/**
 * Crea un pago con la foto del código congelado, tal como lo dejaría
 * `billing_payment_service.ts` (eslabón 7): `benefitPeriodsUsedAfter` no
 * nulo solo mientras el código estaba vigente al momento de ese pago.
 */
async function createPayment(
  subscription: BillingSubscription,
  options: {
    periodEnd: string
    benefitPeriodsUsedAfter: number | null
    discountCodeText?: string | null
  }
): Promise<BillingPayment> {
  const paidAt = DateTime.now()
  return BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: 989712,
    billingPaymentPeriodAmountCents: 989712,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 989712,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 948000,
    billingPaymentDiscountAmountCents: 94800,
    billingPaymentSubtotalCents: 853200,
    billingPaymentTaxAmountCents: 136512,
    billingPaymentTotalCents: 989712,
    billingPaymentDiscountPercent: 10,
    billingPaymentTaxRate: TAX_RATE,
    billingPaymentDiscountCodeText: options.discountCodeText ?? null,
    billingPaymentDiscountCodeKind: options.discountCodeText ? 'percent' : null,
    billingPaymentCodeDiscountAmountCents: options.discountCodeText ? 127980 : 0,
    billingPaymentDiscountCodeBenefitPeriodsUsedAfter: options.benefitPeriodsUsedAfter,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: 'HU11-fixture',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: paidAt,
    billingPaymentPeriodStart: DateTime.fromISO(toBusinessDateString()),
    billingPaymentPeriodEnd: DateTime.fromISO(options.periodEnd),
  } as never)
}

async function cleanup(businessUnitId: number, planId: number | null) {
  await BillingSubscriptionChange.query()
    .where('business_unit_id', businessUnitId)
    .update({ billingSubscriptionChangeBillingPaymentId: null })
  await BillingPayment.query()
    .whereIn(
      'billing_subscription_id',
      BillingSubscription.query().where('business_unit_id', businessUnitId).select(
        'billing_subscription_id'
      )
    )
    .delete()
  await BillingSubscriptionChange.query().where('business_unit_id', businessUnitId).delete()
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  if (planId) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group(
  'BillingSubscriptionService.getSubscriptionDetail — discountBenefitRestoredFrom (USRH1787714804407)',
  () => {
    test('sin código congelado, discountBenefitRestoredFrom es null y no consulta billing_payments', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-1`
      const planId = await createPublishedPlan(Date.now())
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId)

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.isNull(detail.discountBenefitRestoredFrom)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('con código y beneficio indefinido (benefitPeriods null), discountBenefitRestoredFrom es null', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-2`
      const planId = await createPublishedPlan(Date.now() + 1)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId, {
          discountCode: {
            text: CODE_TEXT,
            kind: 'percent',
            value: 15,
            benefitPeriods: null,
            benefitPeriodsUsed: 5,
          },
        })

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.isNull(detail.discountBenefitRestoredFrom)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('con beneficio vigente (no agotado), discountBenefitRestoredFrom es null aunque haya pagos', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-3`
      const planId = await createPublishedPlan(Date.now() + 2)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId, {
          discountCode: {
            text: CODE_TEXT,
            kind: 'percent',
            value: 15,
            benefitPeriods: 3,
            benefitPeriodsUsed: 1,
          },
        })
        // Pago del primer periodo: usedAfter=1, no alcanza benefitPeriods=3.
        await createPayment(subscription, {
          periodEnd: '2026-10-01',
          benefitPeriodsUsedAfter: 1,
          discountCodeText: CODE_TEXT,
        })

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.isNull(detail.discountBenefitRestoredFrom)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('con beneficio agotado, discountBenefitRestoredFrom toma el period_end del pago que lo agotó', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-4`
      const planId = await createPublishedPlan(Date.now() + 3)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId, {
          discountCode: {
            text: CODE_TEXT,
            kind: 'percent',
            value: 15,
            benefitPeriods: 3,
            benefitPeriodsUsed: 3,
          },
        })
        // Pagos 1 y 2: con código, usedAfter 1 y 2 (no alcanzan 3).
        await createPayment(subscription, {
          periodEnd: '2026-10-01',
          benefitPeriodsUsedAfter: 1,
          discountCodeText: CODE_TEXT,
        })
        await createPayment(subscription, {
          periodEnd: '2026-11-01',
          benefitPeriodsUsedAfter: 2,
          discountCodeText: CODE_TEXT,
        })
        // Pago 3: agota el beneficio (usedAfter=3=benefitPeriods).
        await createPayment(subscription, {
          periodEnd: '2026-12-01',
          benefitPeriodsUsedAfter: 3,
          discountCodeText: CODE_TEXT,
        })
        // Pago 4: ya sin código (agotado), usedAfter null — no debe interferir.
        await createPayment(subscription, {
          periodEnd: '2027-01-01',
          benefitPeriodsUsedAfter: null,
          discountCodeText: null,
        })

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.equal(detail.discountBenefitRestoredFrom, '2026-12-01')
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('con beneficio agotado pero ningún pago registró el consumo, discountBenefitRestoredFrom es null (tolerante)', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-5`
      const planId = await createPublishedPlan(Date.now() + 4)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId, {
          discountCode: {
            text: CODE_TEXT,
            kind: 'percent',
            value: 15,
            benefitPeriods: 3,
            benefitPeriodsUsed: 3,
          },
        })
        // Ningún pago registrado (caso previo a esta tanda).

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.isNull(detail.discountBenefitRestoredFrom)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('pendingIncreaseChange y discountBenefitRestoredFrom conviven en el mismo detalle', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-6`
      const planId = await createPublishedPlan(Date.now() + 5)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionService()

      try {
        const subscription = await createSubscription(businessUnit, planId, {
          discountCode: {
            text: CODE_TEXT,
            kind: 'percent',
            value: 15,
            benefitPeriods: 3,
            benefitPeriodsUsed: 3,
          },
        })
        await createPayment(subscription, {
          periodEnd: '2026-12-01',
          benefitPeriodsUsedAfter: 3,
          discountCodeText: CODE_TEXT,
        })
        await BillingSubscriptionChange.create({
          billingSubscriptionId: subscription.billingSubscriptionId,
          businessUnitId: businessUnit.businessUnitId,
          billingSubscriptionChangeType: 'increase',
          billingSubscriptionChangeStatus: 'pending_payment',
          billingSubscriptionChangePreviousEmployees: 120,
          billingSubscriptionChangeNewEmployees: 150,
          billingSubscriptionChangeUnitAmount: 79,
          billingSubscriptionChangeDiscountPercent: 10,
          billingSubscriptionChangeTaxRate: TAX_RATE,
          billingSubscriptionChangeSubtotal: 10665.0,
          billingSubscriptionChangeTaxAmount: 1706.4,
          billingSubscriptionChangeTotal: 12371.4,
          billingSubscriptionChangeProratedAmountCents: 158354,
          billingSubscriptionChangeEffectiveAt: null,
          billingSubscriptionChangeAppliedAt: null,
          billingSubscriptionChangeBillingPaymentId: null,
          billingSubscriptionChangeNotApplicableReason: null,
        } as never)

        const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

        assert.isNotNull(detail.pendingIncreaseChange)
        assert.equal(detail.discountBenefitRestoredFrom, '2026-12-01')
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })
  }
)

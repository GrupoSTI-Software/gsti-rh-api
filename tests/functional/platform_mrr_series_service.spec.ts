import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import PlatformMrrService, { type PlatformMrrSeries } from '#services/platform_mrr_service'

/**
 * USRH1788052455654 — lo que solo la base puede romper: el universo de la serie
 * y sus filtros.
 *
 * Las reglas del cálculo (reparto, residuo, ventana, motivos, serie vacía) se
 * fijan en `tests/unit/services/platform_mrr_series.spec.ts`, sobre el núcleo
 * puro. Aquí se verifica por DIFERENCIA contra una foto previa: la base de
 * pruebas es compartida y ya trae cobros de otros fixtures, así que un importe
 * absoluto sería verde hoy y rojo mañana.
 */

const HOY = DateTime.now().startOf('month')

/** Primer día del mes que está `atras` meses antes del actual, como `DateTime`. */
function mesAtras(atras: number): DateTime {
  return HOY.minus({ months: atras })
}

/** Clave `YYYY-MM` del mes que está `atras` meses antes del actual. */
function claveMes(atras: number): string {
  return mesAtras(atras).toFormat('yyyy-MM')
}

function importeDe(serie: PlatformMrrSeries, mes: string): number {
  return serie.puntos.find((p) => p.mes === mes)?.mrrCobradoNetoCents ?? 0
}

function pagosDe(serie: PlatformMrrSeries, mes: string): number {
  return serie.puntos.find((p) => p.mes === mes)?.pagosConsiderados ?? 0
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Series Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788052455654',
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

interface SubscriptionFixture {
  planId: number
  stamp: number
  suffix: string
  businessUnitDeleted?: boolean
  subscriptionDeleted?: boolean
}

async function createSubscription(
  fixture: SubscriptionFixture
): Promise<{ buId: number; subId: number }> {
  const now = DateTime.utc()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Mrr Series BU ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitSlug = `mrr-series-bu-${fixture.suffix}-${fixture.stamp}`
  businessUnit.businessUnitLegalName = `Mrr Series Legal ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()

  const price = await BillingPlanPrice.query().where('billing_plan_id', fixture.planId).firstOrFail()

  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: fixture.planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: 650,
    billingSubscriptionContractedTaxAmount: 104,
    billingSubscriptionContractedTotal: 754,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })

  if (fixture.subscriptionDeleted) {
    await subscription.delete()
  }
  if (fixture.businessUnitDeleted) {
    await businessUnit.delete()
  }

  return { buId: businessUnit.businessUnitId, subId: subscription.billingSubscriptionId }
}

interface PaymentFixture {
  subId: number
  subtotalCents: number
  periodsCovered: number
  /** `null` simula el pago parcial: sin periodo, no se puede ubicar en ningún mes. */
  periodStart: DateTime | null
}

async function createPayment(fixture: PaymentFixture): Promise<void> {
  const periodEnd = fixture.periodStart
    ? fixture.periodStart.plus({ months: Math.max(fixture.periodsCovered, 1) })
    : null

  await BillingPayment.create({
    billingSubscriptionId: fixture.subId,
    billingPaymentAmountCents: fixture.subtotalCents,
    billingPaymentPeriodAmountCents: fixture.subtotalCents,
    billingPaymentPeriodsCovered: fixture.periodsCovered,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: fixture.subtotalCents,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: fixture.subtotalCents,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: fixture.subtotalCents,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `MRR-SERIES-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now(),
    billingPaymentPeriodStart: fixture.periodStart,
    billingPaymentPeriodEnd: periodEnd,
  })
}

/** Los pagos van primero: la FK de `billing_payments` es RESTRICT. */
async function cleanupFixtures(businessUnitIds: number[], planIds: number[]): Promise<void> {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .delete()
      await subscription.forceDelete()
    }
    await BusinessUnit.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group('PlatformMrrService.getMonthlySeries', (group) => {
  const service = new PlatformMrrService()
  let planId = 0
  const businessUnitIds: number[] = []

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnitIds, [planId])
  })

  test('CA-1 — un cobro de tres periodos reparte 100 000 centavos a cada uno de sus tres meses', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)

    const sub = await createSubscription({ planId, stamp: Date.now(), suffix: 'ca1' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 300_000,
      periodsCovered: 3,
      periodStart: mesAtras(4),
    })

    const after = await service.getMonthlySeries(12)

    for (const atras of [4, 3, 2]) {
      const mes = claveMes(atras)
      assert.equal(importeDe(after, mes) - importeDe(before, mes), 100_000)
      assert.equal(pagosDe(after, mes) - pagosDe(before, mes), 1)
    }
    // El mes siguiente al periodo cubierto no recibe nada.
    assert.equal(importeDe(after, claveMes(1)) - importeDe(before, claveMes(1)), 0)
  })

  test('CA-4 — un cobro sin periodo se cuenta aparte y no aporta a ningún mes', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(24)

    const sub = await createSubscription({ planId, stamp: Date.now() + 1, suffix: 'ca4' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 999_900,
      periodsCovered: 0,
      periodStart: null,
    })

    const after = await service.getMonthlySeries(24)

    assert.equal(after.pagosSinPeriodoExcluidos - before.pagosSinPeriodoExcluidos, 1)
    for (const punto of after.puntos) {
      assert.equal(punto.mrrCobradoNetoCents, importeDe(before, punto.mes))
      assert.equal(punto.pagosConsiderados, pagosDe(before, punto.mes))
    }
  })

  test('CA-6 — los cobros de suscripciones y de tenants dados de baja quedan fuera', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)
    const stamp = Date.now() + 2

    const subBorrada = await createSubscription({
      planId,
      stamp,
      suffix: 'ca6-sub',
      subscriptionDeleted: true,
    })
    businessUnitIds.push(subBorrada.buId)
    await createPayment({
      subId: subBorrada.subId,
      subtotalCents: 800_000,
      periodsCovered: 1,
      periodStart: mesAtras(2),
    })

    const buBorrada = await createSubscription({
      planId,
      stamp,
      suffix: 'ca6-bu',
      businessUnitDeleted: true,
    })
    businessUnitIds.push(buBorrada.buId)
    await createPayment({
      subId: buBorrada.subId,
      subtotalCents: 900_000,
      periodsCovered: 1,
      periodStart: mesAtras(2),
    })

    const after = await service.getMonthlySeries(12)

    // Ni el importe ni el conteo ni los descartados se mueven: los dos cobros
    // no existen para la serie.
    assert.equal(importeDe(after, claveMes(2)), importeDe(before, claveMes(2)))
    assert.equal(pagosDe(after, claveMes(2)), pagosDe(before, claveMes(2)))
    assert.equal(after.pagosSinPeriodoExcluidos, before.pagosSinPeriodoExcluidos)
  })

  test('un cobro de un solo periodo aporta su subtotal completo a un solo mes', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)

    const sub = await createSubscription({ planId, stamp: Date.now() + 3, suffix: 'uno' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 456_700,
      periodsCovered: 1,
      periodStart: mesAtras(5),
    })

    const after = await service.getMonthlySeries(12)

    assert.equal(importeDe(after, claveMes(5)) - importeDe(before, claveMes(5)), 456_700)
    assert.equal(importeDe(after, claveMes(4)) - importeDe(before, claveMes(4)), 0)
  })

  test('la ventana termina en el mes en curso y ese punto siempre es de baja confiabilidad', async ({
    assert,
  }) => {
    const serie = await service.getMonthlySeries(6)
    const ultimo = serie.puntos.at(-1)

    assert.isDefined(ultimo)
    assert.equal(ultimo!.mes, claveMes(0))
    assert.equal(serie.ventana.hasta, claveMes(0))
    assert.equal(ultimo!.confiabilidad, 'baja')
    assert.equal(ultimo!.motivoBajaConfiabilidad, 'mes-en-curso')
    assert.isAtMost(serie.puntos.length, 6)
  })

  test('el agregado no publica identificadores internos ni identidad de clientes', async ({
    assert,
  }) => {
    const serie = await service.getMonthlySeries(12)
    const raw = JSON.stringify(serie)

    for (const prohibido of [
      'businessUnitId',
      'business_unit_id',
      'billingSubscriptionId',
      'billingPaymentId',
      'rfc',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })
})

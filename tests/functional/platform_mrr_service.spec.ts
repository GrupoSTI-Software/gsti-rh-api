import { readFile } from 'node:fs/promises'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import PlatformMrrService from '#services/platform_mrr_service'

/**
 * USRH1788052455653 — reglas del agregado de MRR de plataforma.
 *
 * Las cifras se verifican por diferencia contra una foto previa: la base de
 * pruebas es compartida y ya trae suscripciones activas y en prueba de otros
 * fixtures, así que un total absoluto sería verde hoy y rojo mañana.
 */

interface MrrFixture {
  planId: number
  stamp: number
  suffix: string
  status: BillingSubscriptionStatus
  /** Importe contratado SIN IVA, en pesos. Es la columna congelada que el MRR suma. */
  contractedSubtotal: number
  /** Precio unitario congelado. Con descuento queda por arriba de `contractedSubtotal / asientos`. */
  contractedUnitAmount?: number
  contractedEmployees?: number
  /** Solo para probar que NO se usa: el cálculo jamás lo lee. */
  discountPercent?: number
  currency?: string
  businessUnitActive?: number
  businessUnitDeleted?: boolean
  subscriptionDeleted?: boolean
  /**
   * `false` deja el candado `billing_subscription_live_business_unit_id` en NULL.
   * Es la única forma de tener dos activas en la misma empresa: la columna
   * espejo es UNIQUE y nullable, así que dos NULL conviven (CA-5).
   */
  holdsLiveLock?: boolean
  /** Reusar una empresa ya creada en lugar de crear otra. */
  businessUnitId?: number
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788052455653',
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

/** Crea (o reusa) empresa y le cuelga una suscripción con el trato congelado del caso. */
async function createMrrSubscription(
  fixture: MrrFixture
): Promise<{ buId: number; subId: number }> {
  const now = DateTime.utc()

  let businessUnitId = fixture.businessUnitId
  let businessUnit: BusinessUnit | null = null

  if (businessUnitId === undefined) {
    businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Mrr BU ${fixture.suffix} ${fixture.stamp}`
    businessUnit.businessUnitSlug = `mrr-bu-${fixture.suffix}-${fixture.stamp}`
    businessUnit.businessUnitLegalName = `Mrr Legal ${fixture.suffix} ${fixture.stamp}`
    businessUnit.businessUnitActive = fixture.businessUnitActive ?? 1
    await businessUnit.save()
    businessUnitId = businessUnit.businessUnitId
  }

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.planId)
    .firstOrFail()

  const subtotal = fixture.contractedSubtotal
  const taxAmount = Math.round(subtotal * 0.16 * 100) / 100

  const subscription = await BillingSubscription.create({
    businessUnitId,
    billingPlanId: fixture.planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: fixture.contractedUnitAmount ?? 65,
    billingSubscriptionContractedEmployees: fixture.contractedEmployees ?? 10,
    billingSubscriptionDiscountPercent: fixture.discountPercent ?? 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: fixture.currency ?? 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: subtotal,
    billingSubscriptionContractedTaxAmount: taxAmount,
    billingSubscriptionContractedTotal: subtotal + taxAmount,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: fixture.status === 'trialing' ? now.plus({ days: 7 }) : null,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId:
      (fixture.holdsLiveLock ?? true) ? businessUnitId : null,
  })

  if (fixture.subscriptionDeleted) {
    await subscription.delete()
  }
  if (fixture.businessUnitDeleted && businessUnit) {
    await businessUnit.delete()
  }

  return { buId: businessUnitId, subId: subscription.billingSubscriptionId }
}

async function cleanupFixtures(businessUnitIds: number[], planIds: number[]): Promise<void> {
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
    if (plan) await plan.delete()
  }
}

test.group('PlatformMrrService.getMrrSnapshot', (group) => {
  const service = new PlatformMrrService()
  let planId = 0
  const businessUnitIds: number[] = []

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnitIds, [planId])
  })

  test('CA-1 — una activa suma su subtotal congelado en centavos y su conteo', async ({
    assert,
  }) => {
    const before = await service.getMrrSnapshot()

    const created = await createMrrSubscription({
      planId,
      stamp: Date.now(),
      suffix: 'ca1',
      status: 'active',
      contractedSubtotal: 5000,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 500000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 1)
    assert.match(after.calculadoAl, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('CA-2 — la activa con descuento aporta el importe sellado, no el precio de lista', async ({
    assert,
  }) => {
    const before = await service.getMrrSnapshot()

    // Lista: 10 asientos × $650.00 = $6,500.00. Sellado con descuento: $5,000.00.
    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 1,
      suffix: 'ca2',
      status: 'active',
      contractedSubtotal: 5000,
      contractedUnitAmount: 650,
      contractedEmployees: 10,
      discountPercent: 23.0769,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 500000)
    assert.notEqual(after.mrrActualNetoCents - before.mrrActualNetoCents, 650000)
  })

  test('CA-2 — el cálculo no menciona el porcentaje de descuento en ningún punto', async ({
    assert,
  }) => {
    const source = await readFile(
      new URL('../../app/services/platform_mrr_service.ts', import.meta.url),
      'utf8'
    )

    // El riesgo es silencioso: recalcular desde el porcentaje reportaría precio
    // de lista sin fallar, porque el catálogo admite descuentos que no son
    // porcentaje (`fixed_amount`, `unit_price`).
    assert.notInclude(source, 'discount_percent')
    assert.notInclude(source, 'DiscountPercent')
  })

  test('CA-3 — la de prueba va al proyectado y no entra al actual', async ({ assert }) => {
    const before = await service.getMrrSnapshot()

    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 2,
      suffix: 'ca3',
      status: 'trialing',
      contractedSubtotal: 2000,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrProyectadoTrialCents - before.mrrProyectadoTrialCents, 200000)
    assert.equal(after.suscripcionesEnPrueba - before.suscripcionesEnPrueba, 1)
    assert.equal(after.mrrActualNetoCents, before.mrrActualNetoCents)
    assert.equal(after.suscripcionesActivas, before.suscripcionesActivas)
  })

  test('CA-3 — el resultado no expone ningún campo que sea la suma de las dos cifras', async ({
    assert,
  }) => {
    const snapshot = await service.getMrrSnapshot()
    const suma = snapshot.mrrActualNetoCents + snapshot.mrrProyectadoTrialCents

    assert.deepEqual(Object.keys(snapshot).sort(), [
      'calculadoAl',
      'monedas',
      'mrrActualNetoCents',
      'mrrProyectadoTrialCents',
      'suscripcionesActivas',
      'suscripcionesEnPrueba',
    ])
    assert.notInclude(Object.values(snapshot), suma)
  })

  test('CA-4 — al caer en past_due el actual baja exactamente ese importe', async ({ assert }) => {
    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 3,
      suffix: 'ca4',
      status: 'active',
      contractedSubtotal: 3000,
    })
    businessUnitIds.push(created.buId)

    const conActiva = await service.getMrrSnapshot()

    const subscription = await BillingSubscription.findOrFail(created.subId)
    subscription.billingSubscriptionStatus = 'past_due'
    await subscription.save()

    const conMorosa = await service.getMrrSnapshot()

    assert.equal(conActiva.mrrActualNetoCents - conMorosa.mrrActualNetoCents, 300000)
    assert.equal(conActiva.suscripcionesActivas - conMorosa.suscripcionesActivas, 1)
    // El importe de la morosa se reporta en la cartera vencida, no aquí.
    assert.equal(conMorosa.mrrProyectadoTrialCents, conActiva.mrrProyectadoTrialCents)
  })

  test('CA-5 — un tenant con dos activas aporta las dos, no la mejor', async ({ assert }) => {
    const before = await service.getMrrSnapshot()
    const stamp = Date.now() + 4

    const primera = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca5',
      status: 'active',
      contractedSubtotal: 4000,
    })
    businessUnitIds.push(primera.buId)

    // Segunda activa de la MISMA empresa, sin el candado de suscripción viva.
    await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca5-bis',
      status: 'active',
      contractedSubtotal: 1500,
      businessUnitId: primera.buId,
      holdsLiveLock: false,
    })

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 550000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 2)
    // La regla de "mejor suscripción por empresa" del listado daría 400000.
    assert.notEqual(after.mrrActualNetoCents - before.mrrActualNetoCents, 400000)
  })

  test('CA-6 — borrados fuera; empresa desactivada dentro', async ({ assert }) => {
    const before = await service.getMrrSnapshot()
    const stamp = Date.now() + 5

    const subBorrada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-sub',
      status: 'active',
      contractedSubtotal: 8000,
      subscriptionDeleted: true,
    })
    businessUnitIds.push(subBorrada.buId)

    const empresaBorrada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-bu',
      status: 'active',
      contractedSubtotal: 9000,
      businessUnitDeleted: true,
    })
    businessUnitIds.push(empresaBorrada.buId)

    const desactivada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-off',
      status: 'active',
      contractedSubtotal: 1000,
      businessUnitActive: 0,
    })
    businessUnitIds.push(desactivada.buId)

    const after = await service.getMrrSnapshot()

    // Solo la desactivada suma: manda el estado de la suscripción, no el de la empresa.
    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 100000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 1)
  })

  test('CA-10 — el reparto por moneda cuenta activas y en prueba, ordenado por código', async ({
    assert,
  }) => {
    const stamp = Date.now() + 6

    const enUsd = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca10',
      status: 'active',
      contractedSubtotal: 1000,
      currency: 'USD',
    })
    businessUnitIds.push(enUsd.buId)

    const snapshot = await service.getMrrSnapshot()
    const codigos = snapshot.monedas.map((moneda) => moneda.codigo)

    assert.include(codigos, 'USD')
    assert.include(codigos, 'MXN')
    assert.deepEqual(codigos, [...codigos].sort())
    assert.isAtLeast(snapshot.monedas.length, 2)

    const usd = snapshot.monedas.find((moneda) => moneda.codigo === 'USD')
    assert.isDefined(usd)
    assert.isAtLeast(usd!.suscripciones, 1)
    assert.deepEqual(Object.keys(usd!).sort(), ['codigo', 'suscripciones'])
  })
})

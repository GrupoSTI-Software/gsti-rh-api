import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DateTime } from 'luxon'
import { PDFDocument } from 'pdf-lib'
import { test } from '@japa/runner'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import AllianceCommission from '#models/alliance_commission'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingPayment from '#models/billing_payment'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import { ALLIANCE_ERROR_CODES, ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import AllianceAttributionService from '#services/alliance_attribution_service'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingPaymentService from '#services/billing_payment_service'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

const TEST_PASSWORD = 'AllianceCommissionAccrual123!'
const ATTRIBUTION_BASE = '/api/platform/alliance-attributions'

/**
 * Devengo de comisión al registrar un pago (ESB-07-09-09-09).
 *
 * Cifras del ejemplo ilustrativo: 50 empleados a $200, 20 % de descuento,
 * IVA 16 % → periodo $8,000.00 sin IVA / $9,280.00 con IVA. Comisión 10 %.
 */
const UNIT_AMOUNT = 200
const EMPLOYEES = 50
const NEW_EMPLOYEES = 60
const DISCOUNT_PERCENT = 20
const TAX_RATE = 0.16
const SUBTOTAL = 8_000
const TAX_AMOUNT = 1_280
const CONTRACTED_TOTAL = 9_280
const PERIOD_AMOUNT_CENTS = 928_000
const SUBTOTAL_CENTS = 800_000
const NEW_SUBTOTAL = 9_600
const NEW_TAX_AMOUNT = 1_536
const NEW_CONTRACTED_TOTAL = 11_136
const NEW_PERIOD_AMOUNT_CENTS = 1_113_600
const NEW_SUBTOTAL_CENTS = 960_000
const PRORATED_CENTS = 116_000
const COMMISSION_PERCENT = 10

interface MysqlErrorShape {
  code?: string
  sqlMessage?: string
  original?: { code?: string; sqlMessage?: string }
  cause?: { code?: string; sqlMessage?: string }
}

function mysqlError(error: unknown): { code?: string; sqlMessage: string } {
  const err = error as MysqlErrorShape
  const inner = err.original ?? err.cause ?? err
  return {
    code: inner.code ?? err.code,
    sqlMessage: inner.sqlMessage ?? err.sqlMessage ?? (error instanceof Error ? error.message : ''),
  }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance commission plan ${stamp}`,
    billingPlanDescription: 'Fixture ESB-07-09-09-09',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: UNIT_AMOUNT,
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
    billingVolumeTierDiscountPercent: DISCOUNT_PERCENT,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  return BusinessUnit.create({
    businessUnitName: `Commission BU ${suffix} ${stamp}`,
    businessUnitSlug: `commission-bu-${suffix}-${stamp}`,
    businessUnitLegalName: `Commission Legal ${suffix} ${stamp}`,
    businessUnitActive: 1,
  })
}

async function createAllianceRow(params: {
  name: string
  percent: number
  term: number | null
  active?: 0 | 1
}): Promise<Alliance> {
  return Alliance.create({
    allianceName: params.name,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: params.percent,
    allianceDefaultTermPeriods: params.term,
    allianceActive: params.active ?? 1,
  })
}

async function createSubscription(params: {
  businessUnitId: number
  billingPlanId: number
  status?: BillingSubscriptionStatus
  creditBalanceCents?: number
}): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', params.billingPlanId)
    .firstOrFail()

  return BillingSubscription.create({
    businessUnitId: params.businessUnitId,
    billingPlanId: params.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: params.status ?? 'past_due',
    billingSubscriptionContractedUnitAmount: UNIT_AMOUNT,
    billingSubscriptionContractedEmployees: EMPLOYEES,
    billingSubscriptionDiscountPercent: DISCOUNT_PERCENT,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: SUBTOTAL,
    billingSubscriptionContractedTaxAmount: TAX_AMOUNT,
    billingSubscriptionContractedTotal: CONTRACTED_TOTAL,
    billingSubscriptionCreditBalanceCents: params.creditBalanceCents ?? 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: params.businessUnitId,
  })
}

async function createPendingIncrease(
  subscription: BillingSubscription
): Promise<BillingSubscriptionChange> {
  return BillingSubscriptionChange.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    businessUnitId: subscription.businessUnitId,
    billingSubscriptionChangeType: 'increase',
    billingSubscriptionChangeStatus: 'pending_payment',
    billingSubscriptionChangePreviousEmployees: EMPLOYEES,
    billingSubscriptionChangeNewEmployees: NEW_EMPLOYEES,
    billingSubscriptionChangeUnitAmount: UNIT_AMOUNT,
    billingSubscriptionChangeDiscountPercent: DISCOUNT_PERCENT,
    billingSubscriptionChangeTaxRate: TAX_RATE,
    billingSubscriptionChangeSubtotal: NEW_SUBTOTAL,
    billingSubscriptionChangeTaxAmount: NEW_TAX_AMOUNT,
    billingSubscriptionChangeTotal: NEW_CONTRACTED_TOTAL,
    billingSubscriptionChangeProratedAmountCents: PRORATED_CENTS,
    billingSubscriptionChangeEffectiveAt: null,
    billingSubscriptionChangeAppliedAt: null,
    billingSubscriptionChangeBillingPaymentId: null,
    billingSubscriptionChangeNotApplicableReason: null,
  })
}

async function buildPdfReceipt(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  return Buffer.from(await doc.save())
}

async function makeReceipt(): Promise<{
  tmpPath: string
  size: number
  cleanup: () => Promise<void>
}> {
  const pdf = await buildPdfReceipt()
  const tmpPath = path.join(
    os.tmpdir(),
    `alliance-commission-receipt-${Date.now()}-${Math.random()}.pdf`
  )
  await fs.writeFile(tmpPath, pdf)
  return {
    tmpPath,
    size: pdf.length,
    cleanup: () => fs.unlink(tmpPath).catch(() => undefined),
  }
}

function receiptInput(receipt: { tmpPath: string; size: number }) {
  return {
    tmpPath: receipt.tmpPath,
    clientName: 'comprobante.pdf',
    size: receipt.size,
    headers: { 'content-type': 'application/pdf' },
  }
}

async function pay(
  subscriptionId: number,
  input: {
    amountCents?: number
    allowCustomAmount?: boolean
    paidAt?: string
    method?: 'transfer' | 'cash' | 'other'
  }
) {
  const receipt = await makeReceipt()
  const service = new BillingPaymentService()
  try {
    return await service.registerPayment(
      subscriptionId,
      {
        amountCents: input.amountCents,
        allowCustomAmount: input.allowCustomAmount,
        method: input.method ?? 'transfer',
        paidAt: input.paidAt ?? DateTime.now().toISO()!,
      },
      receiptInput(receipt)
    )
  } finally {
    await receipt.cleanup()
  }
}

async function commissionsOf(attributionId: number): Promise<AllianceCommission[]> {
  return AllianceCommission.query()
    .where('alliance_attribution_id', attributionId)
    .orderBy('alliance_commission_id', 'asc')
}

async function cleanupFixture(params: {
  businessUnitId: number
  planId: number
  allianceId?: number
}) {
  await AllianceCommission.query().where('business_unit_id', params.businessUnitId).delete()

  const subscriptions = await BillingSubscription.query()
    .withTrashed()
    .where('business_unit_id', params.businessUnitId)
  for (const subscription of subscriptions) {
    await BillingSubscriptionChange.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .update({ billingSubscriptionChangeBillingPaymentId: null })
    await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await BillingSubscriptionChange.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await subscription.forceDelete()
  }

  await AllianceAttribution.query().where('business_unit_id', params.businessUnitId).delete()
  if (params.allianceId) {
    await Alliance.query().where('alliance_id', params.allianceId).delete()
  }
  await BusinessUnit.query().where('business_unit_id', params.businessUnitId).delete()

  await BillingVolumeTier.query().where('billing_plan_id', params.planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', params.planId).delete()
  const plan = await BillingPlan.find(params.planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('Devengo de comisión de alianza al registrar un pago', () => {
  test('reproduz la tabla del ejemplo: seis pagos, seis periodos y $4,960.00', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'tabla')
    const alliance = await createAllianceRow({
      name: `Comisión tabla ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const paidOn = '2026-03-15'
      const paidAt = `${paidOn}T12:00:00.000-06:00`

      const first = await pay(subscription.billingSubscriptionId, {
        paidAt,
      })
      assert.equal(first.periodsCovered, 1)
      assert.equal(first.amountCents, PERIOD_AMOUNT_CENTS)
      assert.isUndefined((first as { commission?: unknown }).commission)

      const second = await pay(subscription.billingSubscriptionId, {
        amountCents: 500_000,
        allowCustomAmount: true,
        paidAt,
      })
      assert.equal(second.periodsCovered, 0)

      const third = await pay(subscription.billingSubscriptionId, {
        amountCents: 428_000,
        allowCustomAmount: true,
        paidAt,
      })
      assert.equal(third.periodsCovered, 1)

      const fourth = await pay(subscription.billingSubscriptionId, {
        amountCents: 3_000_000,
        allowCustomAmount: true,
        paidAt,
      })
      assert.equal(fourth.periodsCovered, 3)
      assert.equal(fourth.creditBalanceAfterCents, 216_000)

      await createPendingIncrease(subscription)
      const fifth = await pay(subscription.billingSubscriptionId, {
        amountCents: PRORATED_CENTS,
        paidAt,
      })
      assert.equal(fifth.periodsCovered, 0)
      assert.equal(fifth.debtAppliedCents, PRORATED_CENTS)
      assert.equal(fifth.creditBalanceAfterCents, 216_000)

      const sixth = await pay(subscription.billingSubscriptionId, {
        amountCents: 897_600,
        allowCustomAmount: true,
        paidAt,
      })
      assert.equal(sixth.periodsCovered, 1)
      assert.equal(sixth.periodAmountCents, NEW_PERIOD_AMOUNT_CENTS)
      assert.equal(sixth.creditBalanceAfterCents, 0)

      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 4)
      assert.equal(
        rows.reduce((sum, row) => sum + row.allianceCommissionPeriods, 0),
        6
      )
      assert.equal(
        rows.reduce((sum, row) => sum + row.allianceCommissionAmountCents, 0),
        496_000
      )

      assert.equal(rows[0].billingPaymentId, first.billingPaymentId)
      assert.equal(rows[0].allianceCommissionPeriods, 1)
      assert.equal(rows[0].allianceCommissionBaseCents, SUBTOTAL_CENTS)
      assert.equal(rows[0].allianceCommissionPercent, 10)
      assert.equal(rows[0].allianceCommissionAmountCents, 80_000)
      assert.equal(toCalendarIsoDate(rows[0].allianceCommissionPaidOn), paidOn)
      assert.equal(rows[0].allianceId, alliance.allianceId)
      assert.equal(rows[0].businessUnitId, bu.businessUnitId)

      assert.equal(rows[1].billingPaymentId, third.billingPaymentId)
      assert.equal(rows[1].allianceCommissionAmountCents, 80_000)

      assert.equal(rows[2].billingPaymentId, fourth.billingPaymentId)
      assert.equal(rows[2].allianceCommissionPeriods, 3)
      assert.equal(rows[2].allianceCommissionBaseCents, 2_400_000)
      assert.equal(rows[2].allianceCommissionAmountCents, 240_000)

      assert.equal(rows[3].billingPaymentId, sixth.billingPaymentId)
      assert.equal(rows[3].allianceCommissionPeriods, 1)
      assert.equal(rows[3].allianceCommissionBaseCents, NEW_SUBTOTAL_CENTS)
      assert.equal(rows[3].allianceCommissionAmountCents, 96_000)

      const bySecond = await AllianceCommission.query().where(
        'billing_payment_id',
        second.billingPaymentId
      )
      const byFifth = await AllianceCommission.query().where(
        'billing_payment_id',
        fifth.billingPaymentId
      )
      assert.lengthOf(bySecond, 0)
      assert.lengthOf(byFifth, 0)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('el adelanto no pasa del plazo: tres periodos cubiertos, comisión de dos', async ({
    assert,
  }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'tope')
    const alliance = await createAllianceRow({
      name: `Comisión tope ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
      allianceAttributionTermPeriods: 12,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const ten = await pay(subscription.billingSubscriptionId, {
        amountCents: 10 * PERIOD_AMOUNT_CENTS,
        allowCustomAmount: true,
      })
      assert.equal(ten.periodsCovered, 10)

      const advance = await pay(subscription.billingSubscriptionId, {
        amountCents: 3 * PERIOD_AMOUNT_CENTS,
        allowCustomAmount: true,
      })
      assert.equal(advance.periodsCovered, 3)
      assert.equal(advance.creditBalanceAfterCents, 0)

      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 2)
      assert.equal(rows[0].allianceCommissionPeriods, 10)
      assert.equal(rows[1].allianceCommissionPeriods, 2)
      assert.equal(rows[1].allianceCommissionBaseCents, 1_600_000)
      assert.equal(rows[1].allianceCommissionAmountCents, 160_000)
      assert.equal(rows[1].billingPaymentId, advance.billingPaymentId)

      const next = await pay(subscription.billingSubscriptionId, {})
      assert.equal(next.periodsCovered, 1)
      const after = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(after, 2)

      const live = await AllianceAttribution.findOrFail(attribution.allianceAttributionId)
      assert.isNull(live.allianceAttributionClosedAt)

      const below = await attributions
        .updateAllianceAttribution(attribution.allianceAttributionId, {
          allianceAttributionTermPeriods: 10,
        })
        .then(() => null)
        .catch((error: unknown) => error)
      assert.instanceOf(below, AllianceServiceError)
      const belowError = below as AllianceServiceError
      assert.equal(belowError.errorCode, ALLIANCE_ERROR_CODES.ATTRIBUTION_TERM_BELOW_ACCRUED)
      assert.equal(belowError.httpStatus, 422)
      assert.equal(belowError.key, ALLIANCE_ERRORS.ATTRIBUTION_TERM_BELOW_ACCRUED.key)

      const equal = await attributions.updateAllianceAttribution(
        attribution.allianceAttributionId,
        { allianceAttributionTermPeriods: 12 }
      )
      assert.equal(equal.allianceAttributionTermPeriods, 12)

      const extended = await attributions.updateAllianceAttribution(
        attribution.allianceAttributionId,
        { allianceAttributionTermPeriods: 14 }
      )
      assert.equal(extended.allianceAttributionTermPeriods, 14)

      const revived = await pay(subscription.billingSubscriptionId, {})
      assert.equal(revived.periodsCovered, 1)
      const revivedRows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(revivedRows, 3)
      assert.equal(revivedRows[2].allianceCommissionAmountCents, 80_000)
      assert.equal(revivedRows[2].allianceCommissionPercent, 10)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('el 0 % no escribe comisión ni gasta plazo; al subir, el siguiente pago sí', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'cero')
    const alliance = await createAllianceRow({
      name: `Comisión cero ${stamp}`,
      percent: 0,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
      allianceAttributionCommissionPercent: 0,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      await pay(subscription.billingSubscriptionId, {})
      assert.lengthOf(await commissionsOf(attribution.allianceAttributionId), 0)

      await attributions.updateAllianceAttribution(attribution.allianceAttributionId, {
        allianceAttributionCommissionPercent: 12,
      })

      const second = await pay(subscription.billingSubscriptionId, {})
      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].billingPaymentId, second.billingPaymentId)
      assert.equal(rows[0].allianceCommissionPercent, 12)
      assert.equal(rows[0].allianceCommissionAmountCents, 96_000)
      assert.equal(rows[0].allianceCommissionPeriods, 1)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('cerrar corta hacia adelante y conserva lo ya escrito', async ({ assert }) => {
    const stamp = Date.now() + 3
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'cierre')
    const alliance = await createAllianceRow({
      name: `Comisión cierre ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: '2026-01-01',
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const first = await pay(subscription.billingSubscriptionId, {
        paidAt: '2026-09-01T12:00:00.000-06:00',
      })

      await attributions.closeAllianceAttribution(attribution.allianceAttributionId, {
        allianceAttributionClosedAt: '2026-08-15',
        allianceAttributionCloseReason: 'Terminó el acuerdo',
      })

      const afterClose = await pay(subscription.billingSubscriptionId, {})
      assert.equal(afterClose.periodsCovered, 1)

      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].billingPaymentId, first.billingPaymentId)
      assert.equal(toCalendarIsoDate(rows[0].allianceCommissionPaidOn), '2026-09-01')
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('alianza desactivada sigue devengando; fecha de pago anterior al inicio también', async ({
    assert,
  }) => {
    const stamp = Date.now() + 4
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'inactiva')
    const alliance = await createAllianceRow({
      name: `Comisión inactiva ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
      active: 0,
    })
    const startsAt = toBusinessDateString()
    const row = await AllianceAttribution.create({
      allianceId: alliance.allianceId,
      businessUnitId: bu.businessUnitId,
      allianceAttributionCommissionPercent: COMMISSION_PERCENT,
      allianceAttributionTermPeriods: 12,
      allianceAttributionStartsAt: DateTime.fromISO(startsAt, { zone: 'utc' }),
      allianceAttributionClosedAt: null,
      allianceAttributionCloseReason: null,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const result = await pay(subscription.billingSubscriptionId, {
        paidAt: '2020-06-01T12:00:00.000-06:00',
      })
      const rows = await commissionsOf(row.allianceAttributionId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].billingPaymentId, result.billingPaymentId)
      assert.equal(rows[0].allianceCommissionAmountCents, 80_000)
      assert.equal(toCalendarIsoDate(rows[0].allianceCommissionPaidOn), '2020-06-01')
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('sin atribución viva el pago queda igual y no escribe comisión', async ({ assert }) => {
    const stamp = Date.now() + 5
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'directa')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const result = await pay(subscription.billingSubscriptionId, {})
      assert.equal(result.periodsCovered, 1)
      assert.equal(result.amountCents, PERIOD_AMOUNT_CENTS)
      const rows = await AllianceCommission.query().where(
        'billing_payment_id',
        result.billingPaymentId
      )
      assert.lengthOf(rows, 0)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
      })
    }
  })

  test('el porcentaje congelado no cambia al renegociar; el UNIQUE impide doble cobro', async ({
    assert,
  }) => {
    const stamp = Date.now() + 6
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'congelado')
    const alliance = await createAllianceRow({
      name: `Comisión congelada ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: null,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
      allianceAttributionTermPeriods: null,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const first = await pay(subscription.billingSubscriptionId, {
        amountCents: 3 * PERIOD_AMOUNT_CENTS,
        allowCustomAmount: true,
      })
      assert.equal(first.periodsCovered, 3)

      await attributions.updateAllianceAttribution(attribution.allianceAttributionId, {
        allianceAttributionCommissionPercent: 12,
      })

      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].allianceCommissionPercent, 10)
      assert.equal(rows[0].allianceCommissionPeriods, 3)
      assert.equal(rows[0].allianceCommissionAmountCents, 240_000)

      let caught: unknown = null
      try {
        await AllianceCommission.create({
          allianceId: alliance.allianceId,
          allianceAttributionId: attribution.allianceAttributionId,
          businessUnitId: bu.businessUnitId,
          billingPaymentId: first.billingPaymentId,
          allianceCommissionPeriods: 1,
          allianceCommissionBaseCents: SUBTOTAL_CENTS,
          allianceCommissionPercent: 10,
          allianceCommissionAmountCents: 80_000,
          allianceCommissionPaidOn: DateTime.fromISO(toBusinessDateString(), { zone: 'utc' }),
        })
      } catch (error) {
        caught = error
      }
      assert.equal(mysqlError(caught).code, 'ER_DUP_ENTRY')
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('bajar el plazo a lo ya devengado se permite; indeterminado también', async ({
    assert,
  }) => {
    const stamp = Date.now() + 7
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'piso')
    const alliance = await createAllianceRow({
      name: `Comisión piso ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      await pay(subscription.billingSubscriptionId, {})
      const equal = await attributions.updateAllianceAttribution(
        attribution.allianceAttributionId,
        { allianceAttributionTermPeriods: 1 }
      )
      assert.equal(equal.allianceAttributionTermPeriods, 1)

      const indefinite = await attributions.updateAllianceAttribution(
        attribution.allianceAttributionId,
        { allianceAttributionTermPeriods: null }
      )
      assert.isNull(indefinite.allianceAttributionTermPeriods)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('PATCH HTTP rechaza un plazo por debajo de lo ya devengado', async ({ client, assert }) => {
    const stamp = Date.now() + 8
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'http-piso')
    const alliance = await createAllianceRow({
      name: `Comisión HTTP ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const role = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'root')
      .firstOrFail()
    const email = `commission-http-${stamp}@gsti-tests.local`
    const person = await Person.create({
      personFirstname: 'Commission',
      personLastname: 'Http',
      personSecondLastname: 'Piso',
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
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      await pay(subscription.billingSubscriptionId, {
        amountCents: 2 * PERIOD_AMOUNT_CENTS,
        allowCustomAmount: true,
      })

      const rejected = await client
        .patch(`${ATTRIBUTION_BASE}/${attribution.allianceAttributionId}`)
        .loginAs(user)
        .json({ allianceAttributionTermPeriods: 1 })
      rejected.assertStatus(422)
      assert.equal(rejected.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_TERM_BELOW_ACCRUED)
      assert.equal(rejected.body().key, ALLIANCE_ERRORS.ATTRIBUTION_TERM_BELOW_ACCRUED.key)

      const allowed = await client
        .patch(`${ATTRIBUTION_BASE}/${attribution.allianceAttributionId}`)
        .loginAs(user)
        .json({ allianceAttributionTermPeriods: 2 })
      allowed.assertStatus(200)
      assert.equal(allowed.body().data.allianceAttributionTermPeriods, 2)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
      await user.related('businessUnits').detach()
      await User.query().where('user_id', user.userId).delete()
      await Person.query().where('person_id', person.personId).delete()
    }
  })

  test('si escribir la comisión falla, el pago no queda asentado', async ({ assert }) => {
    const stamp = Date.now() + 9
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'rollback')
    const alliance = await createAllianceRow({
      name: `Comisión rollback ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })
    const originalCreate = AllianceCommission.create

    try {
      AllianceCommission.create = (async () => {
        throw new Error('fallo controlado al escribir la comisión')
      }) as typeof AllianceCommission.create

      let caught: unknown = null
      try {
        await pay(subscription.billingSubscriptionId, {})
      } catch (error) {
        caught = error
      }
      assert.isNotNull(caught)

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)
      assert.lengthOf(await commissionsOf(attribution.allianceAttributionId), 0)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionCreditBalanceCents, 0)
      assert.equal(reloaded.billingSubscriptionStatus, 'past_due')
    } finally {
      AllianceCommission.create = originalCreate
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('dos pagos a la vez no devengan más periodos que el plazo', async ({ assert }) => {
    const stamp = Date.now() + 10
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'carrera')
    const alliance = await createAllianceRow({
      name: `Comisión carrera ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 1,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
      allianceAttributionTermPeriods: 1,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const [first, second] = await Promise.all([
        pay(subscription.billingSubscriptionId, {}),
        pay(subscription.billingSubscriptionId, {}),
      ])
      assert.equal(first.periodsCovered, 1)
      assert.equal(second.periodsCovered, 1)

      const rows = await commissionsOf(attribution.allianceAttributionId)
      const accrued = rows.reduce((sum, row) => sum + row.allianceCommissionPeriods, 0)
      assert.equal(accrued, 1)
      assert.isAtMost(rows.length, 1)

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 2)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('atribuir después de un pago no rellena comisión hacia atrás', async ({ assert }) => {
    const stamp = Date.now() + 11
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'atras')
    const alliance = await createAllianceRow({
      name: `Comisión atrás ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      const previous = await pay(subscription.billingSubscriptionId, {})
      const attributions = new AllianceAttributionService()
      const attribution = await attributions.createAttribution({
        allianceId: alliance.allianceId,
        businessUnitPublicId: bu.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-01-01',
      })

      const before = await AllianceCommission.query().where(
        'billing_payment_id',
        previous.billingPaymentId
      )
      assert.lengthOf(before, 0)

      const next = await pay(subscription.billingSubscriptionId, {})
      const rows = await commissionsOf(attribution.allianceAttributionId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].billingPaymentId, next.billingPaymentId)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('ajustar o cerrar no muta una comisión ya escrita', async ({ assert }) => {
    const stamp = Date.now() + 12
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'inmutable')
    const alliance = await createAllianceRow({
      name: `Comisión inmutable ${stamp}`,
      percent: COMMISSION_PERCENT,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const attribution = await attributions.createAttribution({
      allianceId: alliance.allianceId,
      businessUnitPublicId: bu.businessUnitPublicId,
      allianceAttributionStartsAt: '2026-01-01',
    })
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
    })

    try {
      await pay(subscription.billingSubscriptionId, {
        paidAt: '2026-09-01T12:00:00.000-06:00',
      })
      const [before] = await commissionsOf(attribution.allianceAttributionId)
      const snapshot = {
        allianceId: before.allianceId,
        attributionId: before.allianceAttributionId,
        paymentId: before.billingPaymentId,
        periods: before.allianceCommissionPeriods,
        base: before.allianceCommissionBaseCents,
        percent: before.allianceCommissionPercent,
        amount: before.allianceCommissionAmountCents,
        paidOn: toCalendarIsoDate(before.allianceCommissionPaidOn),
        createdAt: before.allianceCommissionCreatedAt.toISO(),
      }

      await attributions.updateAllianceAttribution(attribution.allianceAttributionId, {
        allianceAttributionCommissionPercent: 12,
        allianceAttributionTermPeriods: 18,
        allianceAttributionStartsAt: '2026-02-01',
      })
      await attributions.closeAllianceAttribution(attribution.allianceAttributionId, {
        allianceAttributionClosedAt: '2026-08-01',
        allianceAttributionCloseReason: 'Cierre de prueba de inmutabilidad',
      })

      const [after] = await commissionsOf(attribution.allianceAttributionId)
      assert.equal(after.allianceId, snapshot.allianceId)
      assert.equal(after.allianceAttributionId, snapshot.attributionId)
      assert.equal(after.billingPaymentId, snapshot.paymentId)
      assert.equal(after.allianceCommissionPeriods, snapshot.periods)
      assert.equal(after.allianceCommissionBaseCents, snapshot.base)
      assert.equal(after.allianceCommissionPercent, snapshot.percent)
      assert.equal(after.allianceCommissionAmountCents, snapshot.amount)
      assert.equal(toCalendarIsoDate(after.allianceCommissionPaidOn), snapshot.paidOn)
      assert.equal(after.allianceCommissionCreatedAt.toISO(), snapshot.createdAt)
    } finally {
      await cleanupFixture({
        businessUnitId: bu.businessUnitId,
        planId,
        allianceId: alliance.allianceId,
      })
    }
  })
})


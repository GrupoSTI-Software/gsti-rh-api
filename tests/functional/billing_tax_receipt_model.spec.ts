import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  SAT_CANCELLATION_REASON_EXPECTED_COUNT,
  SAT_CANCELLATION_REASON_SEED_DATA,
} from '#database/data/sat_cancellation_reason_seed_data'
import {
  SAT_CATALOG_EXPECTED_COUNTS,
  SAT_CFDI_USE_SEED_DATA,
  SAT_TAX_REGIME_SEED_DATA,
} from '#database/data/sat_catalog_seed_data'
import SatCancellationReasonSeeder from '#database/seeders/0060_sat_cancellation_reason_seeder'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingTaxReceipt from '#models/billing_tax_receipt'
import SatCancellationReason from '#models/sat_cancellation_reason'
import User from '#models/user'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * Tests funcionales — modelo y garantías de BD del comprobante fiscal
 * (USRH1788288461952 §5). No cubren alta HTTP: esa superficie es de la
 * rebanada 2.
 */

const UNIT_AMOUNT = 100
const EMPLOYEES = 10
const TAX_RATE = 0.16
const CONTRACTED_TOTAL = 1_160
const PLAIN_RFC = 'XAXX010101000'
const LEGAL_NAME = 'Receptor de prueba SA de CV'

interface MysqlErrorShape {
  code?: string
  errno?: number
  sqlMessage?: string
  original?: { code?: string; errno?: number; sqlMessage?: string }
  cause?: { code?: string; errno?: number; sqlMessage?: string }
}

function mysqlError(error: unknown): { code?: string; errno?: number; sqlMessage: string } {
  const err = error as MysqlErrorShape
  const inner = err.original ?? err.cause ?? err
  return {
    code: inner.code ?? err.code,
    errno: inner.errno ?? err.errno,
    sqlMessage: inner.sqlMessage ?? err.sqlMessage ?? (error instanceof Error ? error.message : ''),
  }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Tax receipt plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788288461952',
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
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Tax receipt BU ${stamp}`
  businessUnit.businessUnitSlug = `tax-receipt-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Tax receipt Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function createSubscription(
  businessUnitId: number,
  billingPlanId: number
): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', billingPlanId)
    .firstOrFail()

  return BillingSubscription.create({
    businessUnitId,
    billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'trialing',
    billingSubscriptionContractedUnitAmount: UNIT_AMOUNT,
    billingSubscriptionContractedEmployees: EMPLOYEES,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: CONTRACTED_TOTAL / 1.16,
    billingSubscriptionContractedTaxAmount: CONTRACTED_TOTAL - CONTRACTED_TOTAL / 1.16,
    billingSubscriptionContractedTotal: CONTRACTED_TOTAL,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnitId,
  })
}

async function createPayment(
  subscription: BillingSubscription,
  reference: string
): Promise<BillingPayment> {
  return BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: 116_000,
    billingPaymentPeriodAmountCents: 0,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 0,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 0,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 0,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: reference,
    billingPaymentReceiptPath: 'billing/payments/receipts/tax-receipt-fixture.pdf',
    billingPaymentReceiptMime: 'application/pdf',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodStart: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodEnd: DateTime.now(),
  })
}

interface ReceiptOverrides {
  billingPaymentId?: number
  uuid: string
  status?: BillingTaxReceipt['status']
  rfc?: string | null
  cancellationReasonCode?: string | null
}

async function insertReceipt(
  subscription: BillingSubscription,
  payment: BillingPayment,
  overrides: ReceiptOverrides
): Promise<BillingTaxReceipt> {
  return BillingTaxReceipt.create({
    billingPaymentId: overrides.billingPaymentId ?? payment.billingPaymentId,
    billingSubscriptionId: subscription.billingSubscriptionId,
    uuid: overrides.uuid,
    stampedAt: DateTime.now(),
    legalName: LEGAL_NAME,
    subtotalCents: 100_000,
    discountAmountCents: 0,
    taxAmountCents: 16_000,
    totalCents: 116_000,
    taxRate: TAX_RATE,
    rfc: overrides.rfc === undefined ? PLAIN_RFC : overrides.rfc,
    postalCode: '01000',
    taxRegimeCode: '601',
    cfdiUseCode: 'G03',
    ...(overrides.status ? { status: overrides.status } : {}),
    ...(overrides.cancellationReasonCode
      ? { cancellationReasonCode: overrides.cancellationReasonCode }
      : {}),
  })
}

async function cleanupFixtures(businessUnitId: number, planId: number) {
  const subscriptions = await BillingSubscription.query()
    .withTrashed()
    .where('business_unit_id', businessUnitId)

  for (const subscription of subscriptions) {
    const payments = await BillingPayment.query().where(
      'billing_subscription_id',
      subscription.billingSubscriptionId
    )
    const paymentIds = payments.map((row) => row.billingPaymentId)
    if (paymentIds.length > 0) {
      await BillingTaxReceipt.query().whereIn('billing_payment_id', paymentIds).delete()
    }
    await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await subscription.forceDelete()
  }

  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('BillingTaxReceipt modelo (USRH1788288461952 §5)', (group) => {
  let stamp: number
  let planId: number
  let businessUnit: BusinessUnit
  let subscription: BillingSubscription
  let paymentA: BillingPayment
  let paymentB: BillingPayment
  let folioSeq = 0

  const nextFolio = () => {
    folioSeq += 1
    const hex = `${stamp}${folioSeq}`.padStart(12, '0').slice(-12)
    return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`
  }

  group.setup(async () => {
    stamp = Date.now()
    planId = await createPublishedPlan(stamp)
    businessUnit = await createBusinessUnit(stamp)
    subscription = await createSubscription(businessUnit.businessUnitId, planId)
    paymentA = await createPayment(subscription, `BTR-A-${stamp}`)
    paymentB = await createPayment(subscription, `BTR-B-${stamp}`)
  })

  group.each.teardown(async () => {
    await BillingTaxReceipt.query()
      .whereIn('billing_payment_id', [paymentA.billingPaymentId, paymentB.billingPaymentId])
      .delete()
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnit.businessUnitId, planId)
  })

  test('insertar issued usa defaults y no muta pago ni suscripción', async ({ assert }) => {
    const paymentBefore = await BillingPayment.findOrFail(paymentA.billingPaymentId)
    const subscriptionBefore = await BillingSubscription.findOrFail(
      subscription.billingSubscriptionId
    )

    const receipt = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })
    await receipt.refresh()

    assert.equal(receipt.status, 'issued')
    assert.equal(receipt.issuer, 'odoo')
    assert.isNull(receipt.xmlPath)
    assert.isNull(receipt.xmlMime)
    assert.isNull(receipt.pdfPath)
    assert.isNull(receipt.pdfMime)
    assert.isNull(receipt.cancellationReasonCode)
    assert.isNull(receipt.cancelledAt)
    assert.isNull(receipt.substituteUuid)

    const paymentAfter = await BillingPayment.findOrFail(paymentA.billingPaymentId)
    const subscriptionAfter = await BillingSubscription.findOrFail(
      subscription.billingSubscriptionId
    )
    assert.equal(paymentAfter.billingPaymentAmountCents, paymentBefore.billingPaymentAmountCents)
    assert.equal(paymentAfter.billingPaymentReference, paymentBefore.billingPaymentReference)
    assert.equal(
      subscriptionAfter.billingSubscriptionStatus,
      subscriptionBefore.billingSubscriptionStatus
    )
    assert.equal(
      subscriptionAfter.billingSubscriptionContractedTotal,
      subscriptionBefore.billingSubscriptionContractedTotal
    )
  })

  test('segundo issued sobre el mismo pago es ER_DUP_ENTRY del UNIQUE vivo', async ({
    assert,
  }) => {
    await insertReceipt(subscription, paymentA, { uuid: nextFolio() })

    let caught: unknown = null
    try {
      await insertReceipt(subscription, paymentA, { uuid: nextFolio() })
    } catch (error) {
      caught = error
    }

    const parsed = mysqlError(caught)
    assert.isNotNull(caught, 'se esperaba ER_DUP_ENTRY sobre billing_tax_receipts_payment_live_unique')
    assert.equal(parsed.code, 'ER_DUP_ENTRY')
    assert.equal(parsed.errno, 1062)
    assert.include(parsed.sqlMessage, 'billing_tax_receipts_payment_live_unique')
  })

  test('tras cancelar el vivo se puede insertar otro issued y conviven', async ({ assert }) => {
    const first = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })
    first.status = 'cancelled'
    first.cancellationReasonCode = '02'
    first.cancelledAt = DateTime.now()
    await first.save()

    const second = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })
    await second.refresh()
    await first.refresh()

    assert.equal(first.status, 'cancelled')
    assert.equal(second.status, 'issued')

    const rows = await BillingTaxReceipt.query().where(
      'billing_payment_id',
      paymentA.billingPaymentId
    )
    assert.lengthOf(rows, 2)
  })

  test('varios no vivos sobre el mismo pago no colisionan', async ({ assert }) => {
    await insertReceipt(subscription, paymentA, {
      uuid: nextFolio(),
      status: 'cancelled',
      cancellationReasonCode: '02',
    })
    await insertReceipt(subscription, paymentA, {
      uuid: nextFolio(),
      status: 'substituted',
      cancellationReasonCode: '01',
    })

    const rows = await BillingTaxReceipt.query().where(
      'billing_payment_id',
      paymentA.billingPaymentId
    )
    assert.lengthOf(rows, 2)
    assert.sameMembers(
      rows.map((row) => row.status),
      ['cancelled', 'substituted']
    )
  })

  test('folio fiscal repetido es ER_DUP_ENTRY aunque el original esté cancelado', async ({
    assert,
  }) => {
    const uuid = nextFolio()
    const original = await insertReceipt(subscription, paymentA, { uuid })
    original.status = 'cancelled'
    original.cancellationReasonCode = '03'
    original.cancelledAt = DateTime.now()
    await original.save()

    let caught: unknown = null
    try {
      await insertReceipt(subscription, paymentB, { uuid })
    } catch (error) {
      caught = error
    }

    const parsed = mysqlError(caught)
    assert.isNotNull(caught, 'se esperaba ER_DUP_ENTRY sobre billing_tax_receipts_uuid_unique')
    assert.equal(parsed.code, 'ER_DUP_ENTRY')
    assert.equal(parsed.errno, 1062)
    assert.include(parsed.sqlMessage, 'billing_tax_receipts_uuid_unique')
  })

  test('el RFC se cifra en reposo y el modelo lo descifra', async ({ assert }) => {
    const receipt = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })

    const [rows] = await db.rawQuery(
      'SELECT billing_tax_receipt_rfc AS rfc FROM billing_tax_receipts WHERE billing_tax_receipt_id = ?',
      [receipt.billingTaxReceiptId]
    )
    const stored = (rows as { rfc: string }[])[0].rfc

    assert.isString(stored)
    assert.notEqual(stored, PLAIN_RFC)
    assert.notInclude(stored, PLAIN_RFC)

    await receipt.refresh()
    assert.equal(receipt.rfc, PLAIN_RFC)
  })

  test('serialize() no expone la clave rfc', async ({ assert }) => {
    const receipt = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })
    const payload = receipt.serialize()

    assert.notProperty(payload, 'rfc')
    assert.equal(receipt.rfc, PLAIN_RFC)
  })

  test('ciphertext corrupto deja rfc en null sin lanzar', async ({ assert }) => {
    const receipt = await insertReceipt(subscription, paymentA, { uuid: nextFolio() })

    await db.rawQuery(
      'UPDATE billing_tax_receipts SET billing_tax_receipt_rfc = ? WHERE billing_tax_receipt_id = ?',
      ['ciphertext-corrupto-no-aes', receipt.billingTaxReceiptId]
    )

    const reloaded = await BillingTaxReceipt.query()
      .where('billing_tax_receipt_id', receipt.billingTaxReceiptId)
      .firstOrFail()

    assert.isNull(reloaded.rfc)
  })

  test('seeder corrido dos veces deja exactamente 4 motivos', async ({ assert }) => {
    const seeder = new SatCancellationReasonSeeder({} as never)
    await seeder.run()
    await seeder.run()

    const rows = await SatCancellationReason.query().orderBy('satCancellationReasonCode', 'asc')
    assert.lengthOf(rows, SAT_CANCELLATION_REASON_EXPECTED_COUNT)
    assert.deepEqual(
      rows.map((row) => ({
        code: row.satCancellationReasonCode,
        requiresSubstitute: row.satCancellationReasonRequiresSubstitute,
      })),
      SAT_CANCELLATION_REASON_SEED_DATA.map((row) => ({
        code: row.code,
        requiresSubstitute: row.requiresSubstitute ? 1 : 0,
      }))
    )
  })

  test('GET /api/billing/sat-catalogs con sesión trae los tres catálogos', async ({
    client,
    assert,
  }) => {
    const user = await User.query().whereNull('user_deleted_at').firstOrFail()
    const response = await client.get('/api/billing/sat-catalogs').loginAs(user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')

    const { taxRegimes, cfdiUses, cancellationReasons } = body.data
    assert.lengthOf(taxRegimes, SAT_CATALOG_EXPECTED_COUNTS.taxRegimes)
    assert.lengthOf(cfdiUses, SAT_CATALOG_EXPECTED_COUNTS.cfdiUses)
    assert.lengthOf(cancellationReasons, SAT_CANCELLATION_REASON_EXPECTED_COUNT)

    assert.deepEqual(
      taxRegimes.map((row: { code: string; description: string }) => [row.code, row.description]),
      SAT_TAX_REGIME_SEED_DATA.map((row) => [row.code, row.description])
    )
    const expectedCfdiUses = [...SAT_CFDI_USE_SEED_DATA]
      .sort((left, right) => left.code.localeCompare(right.code, 'es'))
      .map((row) => [row.code, row.description])
    assert.deepEqual(
      cfdiUses.map((row: { code: string; description: string }) => [row.code, row.description]),
      expectedCfdiUses
    )
    assert.deepEqual(
      cancellationReasons,
      SAT_CANCELLATION_REASON_SEED_DATA.map((row) => ({
        code: row.code,
        description: row.description,
        requiresSubstitute: row.requiresSubstitute,
      }))
    )
  })

  test('GET /api/billing/sat-catalogs sin sesión responde 401', async ({ client }) => {
    const response = await client.get('/api/billing/sat-catalogs')
    response.assertStatus(401)
  })

  test('RESTRICT impide borrar un pago que ya tiene comprobante', async ({ assert }) => {
    await insertReceipt(subscription, paymentA, { uuid: nextFolio() })

    let caught: unknown = null
    try {
      await BillingPayment.query().where('billing_payment_id', paymentA.billingPaymentId).delete()
    } catch (error) {
      caught = error
    }

    const parsed = mysqlError(caught)
    assert.isNotNull(caught, 'se esperaba rechazo de la FK RESTRICT')
    assert.include(parsed.sqlMessage, 'foreign key constraint fails')

    const stillThere = await BillingPayment.find(paymentA.billingPaymentId)
    assert.isNotNull(stillThere)
  })
})

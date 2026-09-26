import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { SAT_CANCELLATION_REASON_SEED_DATA } from '#database/data/sat_cancellation_reason_seed_data'
import { BILLING_TAX_RECEIPT_ERRORS } from '#constants/billing_tax_receipt_error_codes'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingTaxReceipt from '#models/billing_tax_receipt'
import Person from '#models/person'
import Role from '#models/role'
import SatCancellationReason from '#models/sat_cancellation_reason'
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import SatCancellationReasonSeeder from '#database/seeders/0060_sat_cancellation_reason_seeder'
import BillingCatalogService from '#services/billing_catalog_service'
import { blindIndex } from '#utils/blind_index'

/**
 * Tests funcionales — cancelación e historia fiscal (USRH1788288462019 · anexo A).
 */

const TEST_PASSWORD = 'TaxReceiptCancelHttpTest123!'
const RFC = 'ABC010101AB9'
const LEGAL_NAME = 'Empresa Demo SA de CV'
const POSTAL_CODE = '06600'
const TAX_REGIME_CODE = '601'
const CFDI_USE_CODE = 'G03'
const SUBTOTAL_CENTS = 800_000
const DISCOUNT_AMOUNT_CENTS = 200_000
const TAX_AMOUNT_CENTS = 128_000
const TOTAL_CENTS = 928_000
const TAX_RATE = 0.16
const MISSING_PAYMENT_ID = 2_147_483_641
const MISSING_TAX_RECEIPT_ID = 2_147_483_642
const SUBSTITUTE_UUID = '9c8b7a65-4321-4def-8abc-1234567890ab'
const SUBSTITUTE_UUID_UPPER = '9C8B7A65-4321-4DEF-8ABC-1234567890AB'

interface Actor {
  user: User
  person: Person
}

interface SnapshotAmounts {
  subtotalCents: number
  discountAmountCents: number
  taxAmountCents: number
  totalCents: number
  taxRate: number
}

const SNAPSHOT: SnapshotAmounts = {
  subtotalCents: SUBTOTAL_CENTS,
  discountAmountCents: DISCOUNT_AMOUNT_CENTS,
  taxAmountCents: TAX_AMOUNT_CENTS,
  totalCents: TOTAL_CENTS,
  taxRate: TAX_RATE,
}

function taxReceiptUrl(paymentId: number): string {
  return `/api/platform/billing/payments/${paymentId}/tax-receipt`
}

function taxReceiptsUrl(paymentId: number): string {
  return `/api/platform/billing/payments/${paymentId}/tax-receipts`
}

function cancelUrl(taxReceiptId: number): string {
  return `/api/platform/billing/tax-receipts/${taxReceiptId}/cancel`
}

function nextFolio(stamp: number, seq: number): string {
  const hex = `${stamp}${seq}`.padStart(12, '0').slice(-12)
  return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<Actor> {
  const runStamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${runStamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'TaxReceiptCancel',
    personLastname: 'Http',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Tax receipt cancel HTTP plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788288462019',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 100,
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
  return BusinessUnit.create({
    businessUnitName: `Tax receipt cancel HTTP ${stamp}`,
    businessUnitSlug: `tax-receipt-cancel-${stamp}`,
    businessUnitLegalName: `Tax receipt cancel Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createSubscription(
  businessUnitId: number,
  billingPlanId: number
): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query().where('billing_plan_id', billingPlanId).firstOrFail()

  return BillingSubscription.create({
    businessUnitId,
    billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'trialing',
    billingSubscriptionContractedUnitAmount: 100,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: TOTAL_CENTS / 100 / 1.16,
    billingSubscriptionContractedTaxAmount: TOTAL_CENTS / 100 - TOTAL_CENTS / 100 / 1.16,
    billingSubscriptionContractedTotal: TOTAL_CENTS / 100,
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
    billingPaymentAmountCents: SNAPSHOT.totalCents,
    billingPaymentPeriodAmountCents: SNAPSHOT.totalCents,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: SNAPSHOT.subtotalCents + SNAPSHOT.discountAmountCents,
    billingPaymentDiscountAmountCents: SNAPSHOT.discountAmountCents,
    billingPaymentSubtotalCents: SNAPSHOT.subtotalCents,
    billingPaymentTaxAmountCents: SNAPSHOT.taxAmountCents,
    billingPaymentTotalCents: SNAPSHOT.totalCents,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: SNAPSHOT.taxRate,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: reference,
    billingPaymentReceiptPath: 'billing/payments/receipts/tax-receipt-cancel.pdf',
    billingPaymentReceiptMime: 'application/pdf',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodStart: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodEnd: DateTime.now(),
  })
}

async function createLiveReceiptInDb(
  payment: BillingPayment,
  subscriptionId: number,
  uuid: string,
  stampedAt: DateTime
): Promise<BillingTaxReceipt> {
  return BillingTaxReceipt.create({
    billingPaymentId: payment.billingPaymentId,
    billingSubscriptionId: subscriptionId,
    uuid: uuid.toUpperCase(),
    stampedAt,
    status: 'issued',
    issuer: 'odoo',
    legalName: LEGAL_NAME,
    rfc: RFC,
    postalCode: POSTAL_CODE,
    taxRegimeCode: TAX_REGIME_CODE,
    cfdiUseCode: CFDI_USE_CODE,
    subtotalCents: SUBTOTAL_CENTS,
    discountAmountCents: DISCOUNT_AMOUNT_CENTS,
    taxAmountCents: TAX_AMOUNT_CENTS,
    totalCents: TOTAL_CENTS,
    taxRate: TAX_RATE,
  })
}

async function assertStillIssued(receiptId: number, assert: { equal: Function; isNull: Function }) {
  const row = await BillingTaxReceipt.findOrFail(receiptId)
  assert.equal(row.status, 'issued')
  assert.isNull(row.cancellationReasonCode)
  assert.isNull(row.cancelledAt)
  assert.isNull(row.substituteUuid)
}

async function countLiveReceipts(paymentId: number): Promise<number> {
  const rows = await db
    .from('billing_tax_receipts')
    .where('billing_payment_id', paymentId)
    .whereNotNull('billing_tax_receipt_is_live')
    .count('* as total')

  return Number(rows[0]?.total ?? 0)
}

test.group('BillingTaxReceipt cancellation HTTP (USRH1788288462019 · anexo A)', (group) => {
  let stamp: number
  let folioSeq = 0
  let planId: number
  let admin: Actor
  let outsider: Actor
  let unit: BusinessUnit
  let subscription: BillingSubscription
  const paymentIds: number[] = []
  let inactiveReasonId: number | null = null

  const uniqueFolio = () => {
    folioSeq += 1
    return nextFolio(stamp, folioSeq)
  }

  const validCancelledAt = (hoursAfterStamp = 6) =>
    DateTime.now().minus({ hours: hoursAfterStamp }).startOf('second').toISO()!

  group.setup(async () => {
    stamp = Date.now()
    await new SatCancellationReasonSeeder({} as never).run()
    admin = await createActor('tax-cancel-admin', true)
    outsider = await createActor('tax-cancel-outsider', false)
    planId = await createPublishedPlan(stamp)

    unit = await createBusinessUnit(stamp)
    await TenantBillingProfile.create({
      businessUnitId: unit.businessUnitId,
      rfc: RFC,
      rfcHash: blindIndex(RFC),
      legalName: LEGAL_NAME,
      postalCode: POSTAL_CODE,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: CFDI_USE_CODE,
      billingEmail: 'facturas-cancel@gsti-tests.local',
    })

    subscription = await createSubscription(unit.businessUnitId, planId)

    const inactive = await SatCancellationReason.create({
      satCancellationReasonCode: '05',
      satCancellationReasonDescription: 'Motivo inactivo de prueba',
      satCancellationReasonRequiresSubstitute: 0,
      satCancellationReasonActive: 0,
    })
    inactiveReasonId = inactive.satCancellationReasonId
  })

  group.each.teardown(async () => {
    if (paymentIds.length === 0) return
    await BillingTaxReceipt.query().whereIn('billing_payment_id', paymentIds).delete()
    await BillingPayment.query().whereIn('billing_payment_id', paymentIds).delete()
    paymentIds.length = 0
  })

  group.teardown(async () => {
    await subscription.forceDelete()
    await TenantBillingProfile.query().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()

    if (inactiveReasonId) {
      await SatCancellationReason.query().where('sat_cancellation_reason_id', inactiveReasonId).delete()
    }

    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }

    for (const actor of [admin, outsider]) {
      await User.query().where('user_id', actor.user.userId).delete()
      await Person.query().where('person_id', actor.person.personId).delete()
    }
  })

  async function freshPayment(referenceSuffix: string): Promise<BillingPayment> {
    const payment = await createPayment(subscription, `BTR-CANCEL-${referenceSuffix}-${stamp}`)
    paymentIds.push(payment.billingPaymentId)
    return payment
  }

  async function liveReceipt(payment: BillingPayment, daysAgo = 2): Promise<BillingTaxReceipt> {
    return createLiveReceiptInDb(
      payment,
      subscription.billingSubscriptionId,
      uniqueFolio(),
      DateTime.now().minus({ days: daysAgo })
    )
  }

  async function liveReceiptId(payment: BillingPayment, daysAgo = 2): Promise<number> {
    const receipt = await liveReceipt(payment, daysAgo)
    return receipt.billingTaxReceiptId
  }

  async function createLiveReceiptId(
    payment: BillingPayment,
    uuid: string,
    stampedAt: DateTime
  ): Promise<number> {
    const receipt = await createLiveReceiptInDb(
      payment,
      subscription.billingSubscriptionId,
      uuid,
      stampedAt
    )
    return receipt.billingTaxReceiptId
  }

  test('cancelación con motivo 02 deja status cancelled y libera el vivo del pago', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('ok-02')
    const receipt = await liveReceipt(payment, 3)
    const receiptId = receipt.billingTaxReceiptId

    const response = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.status, 'cancelled')
    assert.isNotNull(body.data.cancellation)
    assert.equal(body.data.cancellation.reasonCode, '02')
    assert.equal(
      body.data.cancellation.reasonDescription,
      SAT_CANCELLATION_REASON_SEED_DATA.find((row) => row.code === '02')!.description
    )
    assert.isFalse(body.data.cancellation.requiresSubstitute)
    assert.isNull(body.data.cancellation.substituteUuid)

    const live = await client.get(taxReceiptUrl(payment.billingPaymentId)).loginAs(admin.user)
    live.assertStatus(200)
    assert.isNull(live.body().data)

    assert.equal(await countLiveReceipts(payment.billingPaymentId), 0)
  })

  test('cancelación con motivo 01 exige sustituto y guarda en MAYÚSCULAS', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('ok-01')
    const receipt = await liveReceipt(payment, 2)
    const receiptId = receipt.billingTaxReceiptId

    const response = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '01',
        cancelledAt: validCancelledAt(),
        substituteUuid: SUBSTITUTE_UUID.toLowerCase(),
      })
      .loginAs(admin.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.status, 'substituted')
    assert.equal(body.data.cancellation.substituteUuid, SUBSTITUTE_UUID_UPPER)
    assert.isTrue(body.data.cancellation.requiresSubstitute)

    const row = await BillingTaxReceipt.findOrFail(receiptId)
    assert.equal(row.substituteUuid, SUBSTITUTE_UUID_UPPER)
  })

  test('matriz requiresSubstitute: 01 sin sustituto y 02 con sustituto son 422', async ({
    client,
    assert,
  }) => {
    const paymentRequired = await freshPayment('req')
    const receiptRequired = await liveReceiptId(paymentRequired, 2)

    const missingSubstitute = await client
      .post(cancelUrl(receiptRequired))
      .json({
        cancellationReasonCode: '01',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)

    missingSubstitute.assertStatus(422)
    assert.equal(
      missingSubstitute.body().code,
      BILLING_TAX_RECEIPT_ERRORS.SUBSTITUTE_UUID_REQUIRED.code
    )
    await assertStillIssued(receiptRequired, assert)

    const paymentForbidden = await freshPayment('forbidden')
    const receiptForbidden = await liveReceiptId(paymentForbidden, 2)

    const withSubstitute = await client
      .post(cancelUrl(receiptForbidden))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: validCancelledAt(),
        substituteUuid: SUBSTITUTE_UUID,
      })
      .loginAs(admin.user)

    withSubstitute.assertStatus(422)
    assert.equal(
      withSubstitute.body().code,
      BILLING_TAX_RECEIPT_ERRORS.SUBSTITUTE_UUID_NOT_ALLOWED.code
    )
    await assertStillIssued(receiptForbidden, assert)
  })

  test('motivo inexistente o inactivo es 422 UNKNOWN_CANCELLATION_REASON', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('reason')
    const receiptId = await liveReceiptId(payment, 2)

    const unknown = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '99',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)

    unknown.assertStatus(422)
    assert.equal(unknown.body().code, BILLING_TAX_RECEIPT_ERRORS.UNKNOWN_CANCELLATION_REASON.code)
    await assertStillIssued(receiptId, assert)

    const inactive = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '05',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)

    inactive.assertStatus(422)
    assert.equal(inactive.body().code, BILLING_TAX_RECEIPT_ERRORS.UNKNOWN_CANCELLATION_REASON.code)
    await assertStillIssued(receiptId, assert)
  })

  test('fechas imposibles: futura VAL_INPUT; anterior al timbrado CANCELLED_AT_BEFORE_STAMPED', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('dates')
    const stampedAt = DateTime.now().minus({ days: 1 })
    const receiptId = await createLiveReceiptId(payment, uniqueFolio(), stampedAt)

    const future = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: DateTime.now().plus({ minutes: 10 }).toISO()!,
      })
      .loginAs(admin.user)

    future.assertStatus(422)
    assert.equal(future.body().code, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.code)
    await assertStillIssued(receiptId, assert)

    const beforeStamp = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: DateTime.now().minus({ days: 2 }).toISO()!,
      })
      .loginAs(admin.user)

    beforeStamp.assertStatus(422)
    assert.equal(
      beforeStamp.body().code,
      BILLING_TAX_RECEIPT_ERRORS.CANCELLED_AT_BEFORE_STAMPED.code
    )
    await assertStillIssued(receiptId, assert)
  })

  test('re-cancelación secuencial es 409 y conserva motivo y fecha originales', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('recancel')
    const receiptId = await liveReceiptId(payment, 2)
    const firstCancelledAt = validCancelledAt()

    const first = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: firstCancelledAt,
      })
      .loginAs(admin.user)
    first.assertStatus(200)

    const second = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '03',
        cancelledAt: DateTime.now().minus({ hours: 1 }).toISO()!,
      })
      .loginAs(admin.user)

    second.assertStatus(409)
    assert.equal(second.body().code, BILLING_TAX_RECEIPT_ERRORS.ALREADY_CANCELLED.code)

    const row = await BillingTaxReceipt.findOrFail(receiptId)
    assert.equal(row.cancellationReasonCode, '02')
    assert.equal(row.cancelledAt!.toISO(), DateTime.fromISO(firstCancelledAt).toISO())
  })

  test('concurrencia: Promise.all produce exactamente 200 y 409', async ({ client, assert }) => {
    const payment = await freshPayment('race')
    const receiptId = await liveReceiptId(payment, 2)

    const cancelledAtA = DateTime.now().minus({ hours: 6 }).toISO()!
    const cancelledAtB = DateTime.now().minus({ hours: 5 }).toISO()!

    const [a, b] = await Promise.all([
      client
        .post(cancelUrl(receiptId))
        .json({ cancellationReasonCode: '02', cancelledAt: cancelledAtA })
        .loginAs(admin.user),
      client
        .post(cancelUrl(receiptId))
        .json({ cancellationReasonCode: '03', cancelledAt: cancelledAtB })
        .loginAs(admin.user),
    ])

    const statuses = [a.status(), b.status()].sort()
    assert.deepEqual(statuses, [200, 409])

    const loser = a.status() === 409 ? a : b
    assert.equal(loser.body().code, BILLING_TAX_RECEIPT_ERRORS.ALREADY_CANCELLED.code)

    const winner = a.status() === 200 ? a : b
    const row = await BillingTaxReceipt.findOrFail(receiptId)
    assert.equal(row.cancellationReasonCode, winner.body().data.cancellation.reasonCode)
    assert.equal(row.cancelledAt!.toISO(), winner.body().data.cancellation.cancelledAt)
    assert.equal(await countLiveReceipts(payment.billingPaymentId), 0)
  })

  test('tras cancelar admite el alta del sustituto y el folio cancelado queda quemado', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('substitute')
    const cancelledUuid = uniqueFolio().toUpperCase()
    const receiptId = await createLiveReceiptId(
      payment,
      cancelledUuid,
      DateTime.now().minus({ days: 2 })
    )

    const cancelOk = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)
    cancelOk.assertStatus(200)

    const substituteUuid = uniqueFolio()
    const substitute = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', substituteUuid)
      .field('stampedAt', DateTime.now().minus({ hours: 1 }).toISO()!)
      .loginAs(admin.user)

    substitute.assertStatus(201)
    assert.equal(substitute.body().data.status, 'issued')

    const burned = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', cancelledUuid.toLowerCase())
      .field('stampedAt', DateTime.now().minus({ minutes: 30 }).toISO()!)
      .loginAs(admin.user)

    burned.assertStatus(409)
    assert.equal(burned.body().code, BILLING_TAX_RECEIPT_ERRORS.UUID_ALREADY_REGISTERED.code)
  })

  test('historia fiscal devuelve DTO completo ordenado; vacía e inexistente', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('history')
    const stampedOld = DateTime.now().minus({ days: 10 }).toISO()!
    const stampedMid = DateTime.now().minus({ days: 5 }).toISO()!
    const stampedLive = DateTime.now().minus({ days: 1 }).toISO()!

    await BillingTaxReceipt.create({
      billingPaymentId: payment.billingPaymentId,
      billingSubscriptionId: subscription.billingSubscriptionId,
      uuid: uniqueFolio().toUpperCase(),
      stampedAt: DateTime.fromISO(stampedOld),
      status: 'cancelled',
      cancellationReasonCode: '03',
      cancelledAt: DateTime.fromISO(stampedOld).plus({ hours: 1 }),
      legalName: LEGAL_NAME,
      rfc: RFC,
      postalCode: POSTAL_CODE,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: CFDI_USE_CODE,
      subtotalCents: SUBTOTAL_CENTS,
      discountAmountCents: DISCOUNT_AMOUNT_CENTS,
      taxAmountCents: TAX_AMOUNT_CENTS,
      totalCents: TOTAL_CENTS,
      taxRate: TAX_RATE,
    })

    await BillingTaxReceipt.create({
      billingPaymentId: payment.billingPaymentId,
      billingSubscriptionId: subscription.billingSubscriptionId,
      uuid: uniqueFolio().toUpperCase(),
      stampedAt: DateTime.fromISO(stampedMid),
      status: 'substituted',
      cancellationReasonCode: '01',
      cancelledAt: DateTime.fromISO(stampedMid).plus({ hours: 2 }),
      substituteUuid: SUBSTITUTE_UUID_UPPER,
      legalName: LEGAL_NAME,
      rfc: RFC,
      postalCode: POSTAL_CODE,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: CFDI_USE_CODE,
      subtotalCents: SUBTOTAL_CENTS,
      discountAmountCents: DISCOUNT_AMOUNT_CENTS,
      taxAmountCents: TAX_AMOUNT_CENTS,
      totalCents: TOTAL_CENTS,
      taxRate: TAX_RATE,
    })

    await createLiveReceiptInDb(
      payment,
      subscription.billingSubscriptionId,
      uniqueFolio(),
      DateTime.fromISO(stampedLive)
    )

    const history = await client.get(taxReceiptsUrl(payment.billingPaymentId)).loginAs(admin.user)
    history.assertStatus(200)
    const items = history.body().data as Array<Record<string, unknown>>
    assert.lengthOf(items, 3)
    assert.equal(items[0].status, 'issued')
    assert.isNull(items[0].cancellation)
    assert.isNotNull(items[1].cancellation)
    assert.isNotNull(items[2].cancellation)
    assert.isAbove(Date.parse(String(items[0].stampedAt)), Date.parse(String(items[1].stampedAt)))
    assert.isAbove(Date.parse(String(items[1].stampedAt)), Date.parse(String(items[2].stampedAt)))

    const emptyPayment = await freshPayment('empty-history')
    const empty = await client.get(taxReceiptsUrl(emptyPayment.billingPaymentId)).loginAs(admin.user)
    empty.assertStatus(200)
    assert.deepEqual(empty.body().data, [])

    const missing = await client.get(taxReceiptsUrl(MISSING_PAYMENT_ID)).loginAs(admin.user)
    missing.assertStatus(404)
    assert.equal(missing.body().code, BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND.code)
  })

  test('cancelación no muta el pago ni la suscripción', async ({ client, assert }) => {
    const payment = await freshPayment('immutable')
    const paymentBefore = await BillingPayment.findOrFail(payment.billingPaymentId)
    const subscriptionBefore = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

    const receiptId = await liveReceiptId(payment, 2)

    const cancelOk = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '02',
        cancelledAt: validCancelledAt(),
      })
      .loginAs(admin.user)
    cancelOk.assertStatus(200)

    const paymentAfter = await BillingPayment.findOrFail(payment.billingPaymentId)
    const subscriptionAfter = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

    assert.equal(paymentAfter.billingPaymentAmountCents, paymentBefore.billingPaymentAmountCents)
    assert.equal(paymentAfter.billingPaymentTotalCents, paymentBefore.billingPaymentTotalCents)
    assert.equal(
      subscriptionAfter.billingSubscriptionContractedTotal,
      subscriptionBefore.billingSubscriptionContractedTotal
    )
    assert.equal(
      subscriptionAfter.billingSubscriptionStatus,
      subscriptionBefore.billingSubscriptionStatus
    )
  })

  test('folio sustituto malformado con motivo 01 es 422 INVALID_UUID_FORMAT', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('bad-substitute')
    const receiptId = await liveReceiptId(payment, 2)

    const response = await client
      .post(cancelUrl(receiptId))
      .json({
        cancellationReasonCode: '01',
        cancelledAt: validCancelledAt(),
        substituteUuid: 'folio-sustituto-invalido',
      })
      .loginAs(admin.user)

    response.assertStatus(422)
    assert.equal(response.body().code, BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT.code)
    assert.equal(response.body().key, BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT.key)
    await assertStillIssued(receiptId, assert)
  })

  test('401 sin sesión; 403 middleware; 404 uniforme en comprobante inexistente', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('security')
    const receiptId = await liveReceiptId(payment, 2)

    const payload = {
      cancellationReasonCode: '02',
      cancelledAt: validCancelledAt(),
    }

    const unauthCancel = await client.post(cancelUrl(receiptId)).json(payload)
    unauthCancel.assertStatus(401)

    const unauthHistory = await client.get(taxReceiptsUrl(payment.billingPaymentId))
    unauthHistory.assertStatus(401)

    const forbiddenCancel = await client.post(cancelUrl(receiptId)).json(payload).loginAs(outsider.user)
    forbiddenCancel.assertStatus(403)
    assert.equal(forbiddenCancel.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.notProperty(forbiddenCancel.body(), 'code')

    const missing = await client.post(cancelUrl(MISSING_TAX_RECEIPT_ID)).json(payload).loginAs(admin.user)
    missing.assertStatus(404)
    assert.equal(missing.body().code, BILLING_TAX_RECEIPT_ERRORS.TAX_RECEIPT_NOT_FOUND.code)
    assert.equal(missing.body().key, BILLING_TAX_RECEIPT_ERRORS.TAX_RECEIPT_NOT_FOUND.key)
  })
})

import { DateTime } from 'luxon'
import { test } from '@japa/runner'
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
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import BillingCatalogService from '#services/billing_catalog_service'
import { blindIndex } from '#utils/blind_index'

/**
 * Tests funcionales — alta y lectura del comprobante fiscal
 * (USRH1788288461963 §5).
 */

const TEST_PASSWORD = 'TaxReceiptHttpTest123!'
const RFC = 'ABC010101AB9'
const LEGAL_NAME = 'Empresa Demo SA de CV'
const POSTAL_CODE = '06600'
const TAX_REGIME_CODE = '601'
const TAX_REGIME_LABEL = 'General de Ley Personas Morales'
const CFDI_USE_CODE = 'G03'
const CFDI_USE_LABEL = 'Gastos en general'
const SUBTOTAL_CENTS = 800_000
const DISCOUNT_AMOUNT_CENTS = 200_000
const TAX_AMOUNT_CENTS = 128_000
const TOTAL_CENTS = 928_000
const TAX_RATE = 0.16
const MISSING_PAYMENT_ID = 2_147_483_641

const TEST_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const TEST_UUID_UPPER = '3F2504E0-4F89-41D3-9A0C-0305E82C3301'

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

function taxReceiptUrl(paymentId: number): string {
  return `/api/platform/billing/payments/${paymentId}/tax-receipt`
}

function paymentsUrl(subscriptionId: number): string {
  return `/api/platform/billing/subscriptions/${subscriptionId}/payments`
}

function nextFolio(stamp: number, seq: number): string {
  const hex = `${stamp}${seq}`.padStart(12, '0').slice(-12)
  return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<Actor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'TaxReceipt',
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
    billingPlanName: `Tax receipt HTTP plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788288461963',
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

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  return BusinessUnit.create({
    businessUnitName: `Tax receipt HTTP ${suffix} ${stamp}`,
    businessUnitSlug: `tax-receipt-http-${suffix}-${stamp}`,
    businessUnitLegalName: `Tax receipt HTTP Legal ${suffix} ${stamp}`,
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
  reference: string,
  amounts: SnapshotAmounts
): Promise<BillingPayment> {
  return BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: amounts.totalCents,
    billingPaymentPeriodAmountCents: amounts.totalCents,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: amounts.subtotalCents + amounts.discountAmountCents,
    billingPaymentDiscountAmountCents: amounts.discountAmountCents,
    billingPaymentSubtotalCents: amounts.subtotalCents,
    billingPaymentTaxAmountCents: amounts.taxAmountCents,
    billingPaymentTotalCents: amounts.totalCents,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: amounts.taxRate,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: reference,
    billingPaymentReceiptPath: 'billing/payments/receipts/tax-receipt-http.pdf',
    billingPaymentReceiptMime: 'application/pdf',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodStart: DateTime.now().minus({ months: 1 }),
    billingPaymentPeriodEnd: DateTime.now(),
  })
}

const SNAPSHOT: SnapshotAmounts = {
  subtotalCents: SUBTOTAL_CENTS,
  discountAmountCents: DISCOUNT_AMOUNT_CENTS,
  taxAmountCents: TAX_AMOUNT_CENTS,
  totalCents: TOTAL_CENTS,
  taxRate: TAX_RATE,
}

const LEGACY_SNAPSHOT: SnapshotAmounts = {
  subtotalCents: 0,
  discountAmountCents: 0,
  taxAmountCents: 0,
  totalCents: 0,
  taxRate: 0,
}

test.group('BillingTaxReceipt HTTP (USRH1788288461963 §5)', (group) => {
  let stamp: number
  let folioSeq = 0
  let planId: number
  let admin: Actor
  let outsider: Actor
  let completeUnit: BusinessUnit
  let incompleteUnit: BusinessUnit
  let completeSubscription: BillingSubscription
  let incompleteSubscription: BillingSubscription
  let paymentReady: BillingPayment
  let paymentOther: BillingPayment
  let paymentLegacy: BillingPayment
  let paymentIncomplete: BillingPayment

  const uniqueFolio = () => {
    folioSeq += 1
    return nextFolio(stamp, folioSeq)
  }

  group.setup(async () => {
    stamp = Date.now()
    admin = await createActor('tax-admin', true)
    outsider = await createActor('tax-outsider', false)
    planId = await createPublishedPlan(stamp)

    completeUnit = await createBusinessUnit(stamp, 'ok')
    await TenantBillingProfile.create({
      businessUnitId: completeUnit.businessUnitId,
      rfc: RFC,
      rfcHash: blindIndex(RFC),
      legalName: LEGAL_NAME,
      postalCode: POSTAL_CODE,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: CFDI_USE_CODE,
      billingEmail: 'facturas@gsti-tests.local',
    })

    incompleteUnit = await createBusinessUnit(stamp, 'inc')
    await TenantBillingProfile.create({
      businessUnitId: incompleteUnit.businessUnitId,
      rfc: RFC,
      rfcHash: blindIndex(RFC),
      legalName: LEGAL_NAME,
      postalCode: null,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: null,
      billingEmail: null,
    })

    completeSubscription = await createSubscription(completeUnit.businessUnitId, planId)
    incompleteSubscription = await createSubscription(incompleteUnit.businessUnitId, planId)

    paymentReady = await createPayment(completeSubscription, `BTR-READY-${stamp}`, SNAPSHOT)
    paymentOther = await createPayment(completeSubscription, `BTR-OTHER-${stamp}`, SNAPSHOT)
    paymentLegacy = await createPayment(completeSubscription, `BTR-LEGACY-${stamp}`, LEGACY_SNAPSHOT)
    paymentIncomplete = await createPayment(
      incompleteSubscription,
      `BTR-INC-${stamp}`,
      SNAPSHOT
    )
  })

  group.each.teardown(async () => {
    await BillingTaxReceipt.query()
      .whereIn('billing_payment_id', [
        paymentReady.billingPaymentId,
        paymentOther.billingPaymentId,
        paymentLegacy.billingPaymentId,
        paymentIncomplete.billingPaymentId,
      ])
      .delete()
  })

  group.teardown(async () => {
    const paymentIds = [
      paymentReady.billingPaymentId,
      paymentOther.billingPaymentId,
      paymentLegacy.billingPaymentId,
      paymentIncomplete.billingPaymentId,
    ]
    await BillingTaxReceipt.query().whereIn('billing_payment_id', paymentIds).delete()
    await BillingPayment.query().whereIn('billing_payment_id', paymentIds).delete()

    await completeSubscription.forceDelete()
    await incompleteSubscription.forceDelete()

    await TenantBillingProfile.query()
      .whereIn('business_unit_id', [completeUnit.businessUnitId, incompleteUnit.businessUnitId])
      .delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [completeUnit.businessUnitId, incompleteUnit.businessUnitId])
      .delete()

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

  test('alta correcta congela snapshot, guarda folio en mayúsculas y no muta el pago', async ({
    client,
    assert,
  }) => {
    const paymentBefore = await BillingPayment.findOrFail(paymentReady.billingPaymentId)
    const subscriptionBefore = await BillingSubscription.findOrFail(
      completeSubscription.billingSubscriptionId
    )
    const stampedAt = DateTime.now().minus({ hours: 2 }).toISO()!

    const response = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', TEST_UUID)
      .field('series', 'A')
      .field('folio', '1042')
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.uuid, TEST_UUID_UPPER)
    assert.equal(body.data.status, 'issued')
    assert.equal(body.data.issuer, 'odoo')
    assert.equal(body.data.billingPaymentId, paymentReady.billingPaymentId)
    assert.equal(body.data.billingSubscriptionId, completeSubscription.billingSubscriptionId)
    assert.equal(body.data.series, 'A')
    assert.equal(body.data.folio, '1042')
    assert.equal(body.data.receiver.rfc, RFC)
    assert.equal(body.data.receiver.legalName, LEGAL_NAME)
    assert.equal(body.data.receiver.postalCode, POSTAL_CODE)
    assert.equal(body.data.receiver.taxRegimeCode, TAX_REGIME_CODE)
    assert.equal(body.data.receiver.taxRegimeLabel, TAX_REGIME_LABEL)
    assert.equal(body.data.receiver.cfdiUseCode, CFDI_USE_CODE)
    assert.equal(body.data.receiver.cfdiUseLabel, CFDI_USE_LABEL)
    assert.deepEqual(body.data.amounts, {
      subtotalCents: SUBTOTAL_CENTS,
      discountAmountCents: DISCOUNT_AMOUNT_CENTS,
      taxAmountCents: TAX_AMOUNT_CENTS,
      totalCents: TOTAL_CENTS,
      taxRate: TAX_RATE,
    })
    assert.isFalse(body.data.xmlAvailable)
    assert.isFalse(body.data.pdfAvailable)
    assert.isNull(body.data.cancellation)

    const stored = await BillingTaxReceipt.query()
      .where('billingPaymentId', paymentReady.billingPaymentId)
      .firstOrFail()
    assert.equal(stored.uuid, TEST_UUID_UPPER)

    const paymentAfter = await BillingPayment.findOrFail(paymentReady.billingPaymentId)
    const subscriptionAfter = await BillingSubscription.findOrFail(
      completeSubscription.billingSubscriptionId
    )
    assert.equal(paymentAfter.billingPaymentAmountCents, paymentBefore.billingPaymentAmountCents)
    assert.equal(
      subscriptionAfter.billingSubscriptionStatus,
      subscriptionBefore.billingSubscriptionStatus
    )
    assert.equal(
      subscriptionAfter.billingSubscriptionContractedTotal,
      subscriptionBefore.billingSubscriptionContractedTotal
    )
  })

  test('segundo issued sobre el mismo pago es 409 LIVE_RECEIPT_EXISTS', async ({
    client,
    assert,
  }) => {
    const stampedAt = DateTime.now().minus({ hours: 1 }).toISO()!
    await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)

    const response = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.LIVE_RECEIPT_EXISTS.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.LIVE_RECEIPT_EXISTS.key)
    assert.equal(body.title, BILLING_TAX_RECEIPT_ERRORS.LIVE_RECEIPT_EXISTS.title)
    assert.notInclude(JSON.stringify(body).toLowerCase(), 'duplicate')
    assert.notInclude(JSON.stringify(body), 'billing_tax_receipts')

    const count = await BillingTaxReceipt.query()
      .where('billingPaymentId', paymentReady.billingPaymentId)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('folio ya usado aunque esté cancelado es 409 UUID_ALREADY_REGISTERED', async ({
    client,
    assert,
  }) => {
    const uuid = uniqueFolio().toUpperCase()
    await BillingTaxReceipt.create({
      billingPaymentId: paymentOther.billingPaymentId,
      billingSubscriptionId: completeSubscription.billingSubscriptionId,
      uuid,
      stampedAt: DateTime.now(),
      status: 'cancelled',
      cancellationReasonCode: '03',
      cancelledAt: DateTime.now(),
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

    const response = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uuid.toLowerCase())
      .field('stampedAt', DateTime.now().minus({ minutes: 10 }).toISO()!)
      .loginAs(admin.user)

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.UUID_ALREADY_REGISTERED.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.UUID_ALREADY_REGISTERED.key)
    assert.notInclude(JSON.stringify(body), 'ER_DUP_ENTRY')
  })

  test('dos altas simultáneas: una 201 y la otra 409, nunca 500', async ({ client, assert }) => {
    const stampedAt = DateTime.now().minus({ minutes: 20 }).toISO()!
    const [first, second] = await Promise.all([
      client
        .post(taxReceiptUrl(paymentReady.billingPaymentId))
        .field('uuid', uniqueFolio())
        .field('stampedAt', stampedAt)
        .loginAs(admin.user),
      client
        .post(taxReceiptUrl(paymentReady.billingPaymentId))
        .field('uuid', uniqueFolio())
        .field('stampedAt', stampedAt)
        .loginAs(admin.user),
    ])

    const statuses = [first.status(), second.status()].sort()
    assert.deepEqual(statuses, [201, 409])

    for (const response of [first, second]) {
      if (response.status() === 409) {
        const body = response.body()
        assert.oneOf(body.code, [
          BILLING_TAX_RECEIPT_ERRORS.LIVE_RECEIPT_EXISTS.code,
          BILLING_TAX_RECEIPT_ERRORS.UUID_ALREADY_REGISTERED.code,
        ])
        assert.notInclude(JSON.stringify(body), 'Duplicate entry')
        assert.notInclude(JSON.stringify(body), 'billing_tax_receipts')
      }
    }

    const rows = await BillingTaxReceipt.query().where(
      'billingPaymentId',
      paymentReady.billingPaymentId
    )
    assert.lengthOf(rows, 1)
  })

  test('perfil incompleto es 422 y solo nombra lo que falta', async ({ client, assert }) => {
    const response = await client
      .post(taxReceiptUrl(paymentIncomplete.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', DateTime.now().minus({ minutes: 5 }).toISO()!)
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.BILLING_PROFILE_INCOMPLETE.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.BILLING_PROFILE_INCOMPLETE.key)
    assert.deepEqual(body.data.missingFields, ['postalCode', 'cfdiUseCode'])
    assert.notProperty(body.data, 'rfc')
    assert.notProperty(body.data, 'legalName')
    assert.notInclude(JSON.stringify(body), RFC)

    const count = await BillingTaxReceipt.query()
      .where('billingPaymentId', paymentIncomplete.billingPaymentId)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('pago sin foto financiera es 422 PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(taxReceiptUrl(paymentLegacy.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', DateTime.now().minus({ minutes: 5 }).toISO()!)
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT.key)
  })

  test('folio fiscal malformado es 422 INVALID_UUID_FORMAT sin escribir', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', 'folio-invalido')
      .field('stampedAt', DateTime.now().minus({ minutes: 5 }).toISO()!)
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT.key)

    const count = await BillingTaxReceipt.query()
      .where('billingPaymentId', paymentReady.billingPaymentId)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('stampedAt en el futuro más allá de 5 min es 422 VAL_INPUT', async ({ client, assert }) => {
    const response = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', DateTime.now().plus({ minutes: 10 }).toISO()!)
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.key)
    assert.include(String(body.detail).toLowerCase(), 'stampedat')
  })

  test('GET del vivo devuelve el TaxReceiptView con RFC en claro', async ({ client, assert }) => {
    const stampedAt = DateTime.now().minus({ hours: 3 }).toISO()!
    await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('series', 'A')
      .field('folio', '1042')
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)

    const response = await client
      .get(taxReceiptUrl(paymentReady.billingPaymentId))
      .loginAs(admin.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.receiver.rfc, RFC)
    assert.isFalse(body.data.xmlAvailable)
    assert.isFalse(body.data.pdfAvailable)
    assert.isNull(body.data.cancellation)
    assert.equal(body.data.status, 'issued')
  })

  test('GET sin vivo o solo cancelado responde 200 con data null', async ({ client, assert }) => {
    const empty = await client.get(taxReceiptUrl(paymentReady.billingPaymentId)).loginAs(admin.user)
    empty.assertStatus(200)
    assert.isNull(empty.body().data)

    await BillingTaxReceipt.create({
      billingPaymentId: paymentReady.billingPaymentId,
      billingSubscriptionId: completeSubscription.billingSubscriptionId,
      uuid: uniqueFolio().toUpperCase(),
      stampedAt: DateTime.now(),
      status: 'cancelled',
      cancellationReasonCode: '02',
      cancelledAt: DateTime.now(),
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

    const cancelled = await client
      .get(taxReceiptUrl(paymentReady.billingPaymentId))
      .loginAs(admin.user)
    cancelled.assertStatus(200)
    assert.isNull(cancelled.body().data)
  })

  test('pago inexistente es el mismo 404 en POST y GET', async ({ client, assert }) => {
    const stampedAt = DateTime.now().minus({ minutes: 5 }).toISO()!
    const post = await client
      .post(taxReceiptUrl(MISSING_PAYMENT_ID))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)
    const get = await client.get(taxReceiptUrl(MISSING_PAYMENT_ID)).loginAs(admin.user)

    post.assertStatus(404)
    get.assertStatus(404)
    assert.deepEqual(
      { title: post.body().title, detail: post.body().detail, key: post.body().key, code: post.body().code },
      { title: get.body().title, detail: get.body().detail, key: get.body().key, code: get.body().code }
    )
    assert.equal(post.body().code, BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND.code)
    assert.equal(post.body().key, BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND.key)
  })

  test('sin sesión 401; usuario sin plataforma 403 del middleware', async ({ client, assert }) => {
    const stampedAt = DateTime.now().minus({ minutes: 5 }).toISO()!
    const unauth = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
    unauth.assertStatus(401)

    const forbidden = await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
      .loginAs(outsider.user)
    forbidden.assertStatus(403)
    assert.equal(forbidden.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.notProperty(forbidden.body(), 'code')
  })

  test('el histórico trae hasTaxReceipt sin datos fiscales', async ({ client, assert }) => {
    const stampedAt = DateTime.now().minus({ hours: 1 }).toISO()!
    await client
      .post(taxReceiptUrl(paymentReady.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt)
      .loginAs(admin.user)

    const response = await client
      .get(paymentsUrl(completeSubscription.billingSubscriptionId))
      .loginAs(admin.user)

    response.assertStatus(200)
    const items = response.body().data as Array<Record<string, unknown>>
    assert.isAbove(items.length, 0)

    const billed = items.find((row) => row.billingPaymentId === paymentReady.billingPaymentId)
    const pending = items.find((row) => row.billingPaymentId === paymentOther.billingPaymentId)
    assert.isTrue(billed?.hasTaxReceipt)
    assert.isFalse(pending?.hasTaxReceipt)

    for (const row of items) {
      assert.isBoolean(row.hasTaxReceipt)
      assert.notProperty(row, 'rfc')
      assert.notProperty(row, 'legalName')
      assert.notProperty(row, 'taxRegimeCode')
      assert.notProperty(row, 'cfdiUseCode')
      assert.notProperty(row, 'receiver')
    }
  })
})

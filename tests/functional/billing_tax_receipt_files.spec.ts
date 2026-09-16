import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { PDFDocument } from 'pdf-lib'
import {
  BILLING_TAX_RECEIPT_S3_FOLDER,
  BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS,
  BILLING_TAX_RECEIPT_XML_MAX_BYTES,
  BILLING_TAX_RECEIPT_XML_UPLOAD_CONTENT_TYPE,
} from '#constants/billing_tax_receipt'
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
import UploadService from '#services/upload_service'
import { blindIndex } from '#utils/blind_index'

/**
 * Tests funcionales — archivos del comprobante fiscal (USRH1788288461975 §5).
 */

const TEST_PASSWORD = 'TaxReceiptFilesHttpTest123!'
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
const MISSING_TAX_RECEIPT_ID = 2_147_483_641
const PDF_PROFILE_MAX_BYTES = 5 * 1024 * 1024

interface Actor {
  user: User
  person: Person
}

type UploadCall = {
  relativeKey: string
  contentType: string
}

function taxReceiptUrl(paymentId: number): string {
  return `/api/platform/billing/payments/${paymentId}/tax-receipt`
}

function downloadUrl(taxReceiptId: number, fileType: string): string {
  return `/api/platform/billing/tax-receipts/${taxReceiptId}/files/${fileType}/download`
}

function nextFolio(stamp: number, seq: number): string {
  const hex = `${stamp}${seq}`.padStart(12, '0').slice(-12)
  return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`
}

function buildCfdiXml(): Buffer {
  return Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>\n<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"></cfdi:Comprobante>\n'
  )
}

async function buildPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  return Buffer.from(await doc.save())
}

/** Evita `Buffer.concat`: en este TS choca Buffer vs Uint8Array. */
function paddedFile(prefix: Buffer, extraBytes: number): Buffer {
  const bytes = new Uint8Array(prefix.length + extraBytes)
  bytes.set(Uint8Array.from(prefix))
  return Buffer.from(bytes)
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<Actor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'TaxReceiptFiles',
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

function stubUploads(state: {
  mode: 'ok' | 'fail' | 'bad-sign'
  uploads: UploadCall[]
  signSeq: number
}) {
  const originalUpload = UploadService.prototype.uploadPrivateBuffer
  const originalLink = UploadService.prototype.getDownloadLink

  UploadService.prototype.uploadPrivateBuffer = async function (
    relativeKey: string,
    _body: Buffer,
    contentType: string
  ) {
    if (state.mode === 'fail') return null
    state.uploads.push({ relativeKey, contentType })
    return `returned-files/${relativeKey}`
  }

  UploadService.prototype.getDownloadLink = async function (
    filePath: string,
    expireSeconds = 60 * 60 * 24
  ) {
    if (state.mode === 'bad-sign') {
      return { status: 500, data: null, message: 'get_url_failed: AccessDenied interno' }
    }
    state.signSeq += 1
    return `https://signed.example/${filePath}?n=${state.signSeq}&X-Amz-Expires=${expireSeconds}`
  }

  return () => {
    UploadService.prototype.uploadPrivateBuffer = originalUpload
    UploadService.prototype.getDownloadLink = originalLink
  }
}

test.group('BillingTaxReceipt files HTTP (USRH1788288461975 §5)', (group) => {
  let stamp: number
  let folioSeq = 0
  let planId: number
  let admin: Actor
  let outsider: Actor
  let unit: BusinessUnit
  let subscription: BillingSubscription
  const paymentIds: number[] = []
  const uploadState = {
    mode: 'ok' as 'ok' | 'fail' | 'bad-sign',
    uploads: [] as UploadCall[],
    signSeq: 0,
  }
  let restoreUploads: (() => void) | null = null

  const uniqueFolio = () => {
    folioSeq += 1
    return nextFolio(stamp, folioSeq)
  }

  const stampedAt = () => DateTime.now().minus({ hours: 1 }).toISO()!

  async function freshPayment(referenceSuffix: string): Promise<BillingPayment> {
    const payment = await BillingPayment.create({
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPaymentAmountCents: TOTAL_CENTS,
      billingPaymentPeriodAmountCents: TOTAL_CENTS,
      billingPaymentPeriodsCovered: 1,
      billingPaymentCreditAppliedCents: 0,
      billingPaymentCreditBalanceAfterCents: 0,
      billingPaymentDebtAppliedCents: 0,
      billingPaymentIsCustomAmount: false,
      billingPaymentGrossCents: SUBTOTAL_CENTS + DISCOUNT_AMOUNT_CENTS,
      billingPaymentDiscountAmountCents: DISCOUNT_AMOUNT_CENTS,
      billingPaymentSubtotalCents: SUBTOTAL_CENTS,
      billingPaymentTaxAmountCents: TAX_AMOUNT_CENTS,
      billingPaymentTotalCents: TOTAL_CENTS,
      billingPaymentDiscountPercent: 0,
      billingPaymentTaxRate: TAX_RATE,
      billingPaymentMethod: 'transfer',
      billingPaymentReference: `BTR-FILES-${referenceSuffix}-${stamp}`,
      billingPaymentReceiptPath: 'billing/payments/receipts/tax-receipt-files.pdf',
      billingPaymentReceiptMime: 'application/pdf',
      billingPaymentProvider: 'manual',
      billingPaymentPaidAt: DateTime.now().minus({ months: 1 }),
      billingPaymentPeriodStart: DateTime.now().minus({ months: 1 }),
      billingPaymentPeriodEnd: DateTime.now(),
    })
    paymentIds.push(payment.billingPaymentId)
    return payment
  }

  group.setup(async () => {
    stamp = Date.now()
    admin = await createActor('tax-files-admin', true)
    outsider = await createActor('tax-files-outsider', false)

    const catalog = new BillingCatalogService()
    const plan = await catalog.createPlan({
      billingPlanName: `Tax receipt files plan ${stamp}`,
      billingPlanDescription: 'Fixture de USRH1788288461975',
      billingPlanProvider: 'manual',
    })
    planId = plan.billingPlanId

    await BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: 100,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: TAX_RATE,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: '2025-01-01',
      billingPlanPriceStripePriceId: null,
      billingPlanPriceProvider: 'manual',
    })
    await BillingVolumeTier.create({
      billingPlanId: planId,
      billingVolumeTierMinEmployees: 1,
      billingVolumeTierDiscountPercent: 0,
    })
    await catalog.publishPlan(planId)

    unit = await BusinessUnit.create({
      businessUnitName: `Tax receipt files ${stamp}`,
      businessUnitSlug: `tax-receipt-files-${stamp}`,
      businessUnitLegalName: `Tax receipt files Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })

    await TenantBillingProfile.create({
      businessUnitId: unit.businessUnitId,
      rfc: RFC,
      rfcHash: blindIndex(RFC),
      legalName: LEGAL_NAME,
      postalCode: POSTAL_CODE,
      taxRegimeCode: TAX_REGIME_CODE,
      cfdiUseCode: CFDI_USE_CODE,
      billingEmail: 'facturas@gsti-tests.local',
    })

    const now = DateTime.now()
    const price = await BillingPlanPrice.query().where('billing_plan_id', planId).firstOrFail()
    subscription = await BillingSubscription.create({
      businessUnitId: unit.businessUnitId,
      billingPlanId: planId,
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
      billingSubscriptionLiveBusinessUnitId: unit.businessUnitId,
    })

    restoreUploads = stubUploads(uploadState)
  })

  group.each.setup(() => {
    uploadState.mode = 'ok'
    uploadState.uploads = []
  })

  group.each.teardown(async () => {
    if (paymentIds.length === 0) return
    await BillingTaxReceipt.query().whereIn('billing_payment_id', paymentIds).delete()
  })

  group.teardown(async () => {
    restoreUploads?.()

    if (paymentIds.length > 0) {
      await BillingTaxReceipt.query().whereIn('billing_payment_id', paymentIds).delete()
      await BillingPayment.query().whereIn('billing_payment_id', paymentIds).delete()
    }

    await subscription.forceDelete()
    await TenantBillingProfile.query().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()

    for (const actor of [admin, outsider]) {
      await User.query().where('user_id', actor.user.userId).delete()
      await Person.query().where('person_id', actor.person.personId).delete()
    }
  })

  test('alta con XML y PDF guarda ambos, MIME real y Key devuelta', async ({ client, assert }) => {
    const payment = await freshPayment('both')
    const folio = uniqueFolio()
    const pdf = await buildPdf()

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', folio)
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'text/xml' })
      .file('pdf', pdf, { filename: 'acuse.pdf', contentType: 'application/pdf' })
      .loginAs(admin.user)

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isTrue(body.data.xmlAvailable)
    assert.isTrue(body.data.pdfAvailable)
    assert.notProperty(body.data, 'url')
    assert.notProperty(body.data, 'xmlPath')
    assert.notProperty(body.data, 'pdfPath')

    const stored = await BillingTaxReceipt.query()
      .where('billingPaymentId', payment.billingPaymentId)
      .firstOrFail()
    assert.equal(stored.xmlMime, 'application/xml')
    assert.equal(stored.pdfMime, 'application/pdf')
    assert.isTrue(stored.xmlPath?.startsWith('returned-files/'))
    assert.isTrue(stored.pdfPath?.startsWith('returned-files/'))
    assert.include(stored.xmlPath ?? '', `${BILLING_TAX_RECEIPT_S3_FOLDER}/${folio.toUpperCase()}/`)
    assert.notInclude(stored.xmlPath ?? '', RFC)
    assert.notInclude(stored.xmlPath ?? '', LEGAL_NAME)

    const xmlUpload = uploadState.uploads.find((call) => call.contentType === BILLING_TAX_RECEIPT_XML_UPLOAD_CONTENT_TYPE)
    const pdfUpload = uploadState.uploads.find((call) => call.contentType === 'application/pdf')
    assert.isDefined(xmlUpload)
    assert.isDefined(pdfUpload)
    assert.lengthOf(uploadState.uploads, 2)
  })

  test('alta solo con XML deja pdfAvailable en false', async ({ client, assert }) => {
    const payment = await freshPayment('xml-only')

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)

    response.assertStatus(201)
    assert.isTrue(response.body().data.xmlAvailable)
    assert.isFalse(response.body().data.pdfAvailable)

    const stored = await BillingTaxReceipt.query()
      .where('billingPaymentId', payment.billingPaymentId)
      .firstOrFail()
    assert.isNotNull(stored.xmlPath)
    assert.isNull(stored.pdfPath)
    assert.isNull(stored.pdfMime)
  })

  test('alta sin archivos no se bloquea y ambos flags quedan en false', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('none')

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .loginAs(admin.user)

    response.assertStatus(201)
    assert.isFalse(response.body().data.xmlAvailable)
    assert.isFalse(response.body().data.pdfAvailable)
    assert.lengthOf(uploadState.uploads, 0)
  })

  test('PDF renombrado a .xml es 422 FILE_TYPE_NOT_ALLOWED y no sube nada', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('pdf-as-xml')
    const pdf = await buildPdf()

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', pdf, { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED.key)
    assert.equal(body.title, BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED.title)
    assert.notInclude(JSON.stringify(body), RFC)
    assert.lengthOf(uploadState.uploads, 0)

    const count = await BillingTaxReceipt.query()
      .where('billingPaymentId', payment.billingPaymentId)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('XML que no es CFDI es 422 y no deja comprobante ni objeto', async ({ client, assert }) => {
    const payment = await freshPayment('not-cfdi')

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', Buffer.from('<?xml version="1.0"?><Nomina xmlns="http://www.sat.gob.mx/cfd/4"></Nomina>\n'), {
        filename: 'acuse.xml',
        contentType: 'application/xml',
      })
      .loginAs(admin.user)

    response.assertStatus(422)
    assert.equal(response.body().code, BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED.code)
    assert.lengthOf(uploadState.uploads, 0)
  })

  test('XML con DOCTYPE es 422 FILE_TYPE_NOT_ALLOWED', async ({ client, assert }) => {
    const payment = await freshPayment('doctype')

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file(
        'xml',
        Buffer.from(
          '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"></cfdi:Comprobante>\n'
        ),
        { filename: 'acuse.xml', contentType: 'application/xml' }
      )
      .loginAs(admin.user)

    response.assertStatus(422)
    assert.equal(response.body().code, BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED.code)
    assert.lengthOf(uploadState.uploads, 0)
  })

  test('XML sobre 1 MB es 422 FILE_TOO_LARGE y el detail nombra el límite', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('xml-big')
    const oversized = paddedFile(buildCfdiXml(), BILLING_TAX_RECEIPT_XML_MAX_BYTES)

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', oversized, { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE.key)
    assert.include(String(body.detail), '1 MB')
    assert.lengthOf(uploadState.uploads, 0)
  })

  test('PDF sobre 5 MB es 422 FILE_TOO_LARGE', async ({ client, assert }) => {
    const payment = await freshPayment('pdf-big')
    const oversized = paddedFile(Buffer.from('%PDF-1.4\n'), PDF_PROFILE_MAX_BYTES)

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('pdf', oversized, { filename: 'acuse.pdf', contentType: 'application/pdf' })
      .loginAs(admin.user)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE.key)
    assert.include(String(body.detail), '5 MB')
    assert.lengthOf(uploadState.uploads, 0)
  })

  test('S3 caído al subir es 500 FILE_UPLOAD_FAILED y no crea el comprobante', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('s3-down')
    uploadState.mode = 'fail'

    const response = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .setup((request) => {
        request.request.ok(() => true)
      })
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)

    response.assertStatus(500)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_UPLOAD_FAILED.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.FILE_UPLOAD_FAILED.key)
    assert.notInclude(JSON.stringify(body).toLowerCase(), 's3')

    const count = await BillingTaxReceipt.query()
      .where('billingPaymentId', payment.billingPaymentId)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('descarga XML firma 300 s y cada llamada es una URL distinta', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('download')
    const created = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)
    created.assertStatus(201)
    const taxReceiptId = created.body().data.billingTaxReceiptId as number

    const first = await client.get(downloadUrl(taxReceiptId, 'xml')).loginAs(admin.user)
    const second = await client.get(downloadUrl(taxReceiptId, 'xml')).loginAs(admin.user)

    first.assertStatus(200)
    second.assertStatus(200)
    assert.equal(first.body().data.expiresIn, BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS)
    assert.equal(second.body().data.expiresIn, 300)
    assert.isString(first.body().data.url)
    assert.notEqual(first.body().data.url, second.body().data.url)
    assert.notProperty(first.body().data, 'xmlPath')
    assert.notInclude(JSON.stringify(first.body()), RFC)
  })

  test('descarga de PDF ausente es 404 FILE_NOT_AVAILABLE', async ({ client, assert }) => {
    const payment = await freshPayment('no-pdf')
    const created = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)
    const taxReceiptId = created.body().data.billingTaxReceiptId as number

    const response = await client.get(downloadUrl(taxReceiptId, 'pdf')).loginAs(admin.user)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_NOT_AVAILABLE.code)
    assert.equal(body.key, BILLING_TAX_RECEIPT_ERRORS.FILE_NOT_AVAILABLE.key)
  })

  test('taxReceiptId inexistente es 404 TAX_RECEIPT_NOT_FOUND', async ({ client, assert }) => {
    const response = await client
      .get(downloadUrl(MISSING_TAX_RECEIPT_ID, 'xml'))
      .loginAs(admin.user)

    response.assertStatus(404)
    assert.equal(response.body().code, BILLING_TAX_RECEIPT_ERRORS.TAX_RECEIPT_NOT_FOUND.code)
    assert.equal(response.body().key, BILLING_TAX_RECEIPT_ERRORS.TAX_RECEIPT_NOT_FOUND.key)
  })

  test('getDownloadLink que no es string es 404 y no filtra S3', async ({ client, assert }) => {
    const payment = await freshPayment('bad-sign')
    const created = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)
    const taxReceiptId = created.body().data.billingTaxReceiptId as number

    uploadState.mode = 'bad-sign'
    const response = await client.get(downloadUrl(taxReceiptId, 'xml')).loginAs(admin.user)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.code, BILLING_TAX_RECEIPT_ERRORS.FILE_NOT_AVAILABLE.code)
    assert.notInclude(JSON.stringify(body), 'get_url_failed')
    assert.notInclude(JSON.stringify(body), 'AccessDenied')
  })

  test('fileType fuera del enum es 422 VAL_INPUT', async ({ client, assert }) => {
    const payment = await freshPayment('enum')
    const created = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .loginAs(admin.user)
    const taxReceiptId = created.body().data.billingTaxReceiptId as number

    const jpg = await client.get(downloadUrl(taxReceiptId, 'jpg')).loginAs(admin.user)
    const traversal = await client.get(downloadUrl(taxReceiptId, '..')).loginAs(admin.user)

    jpg.assertStatus(422)
    traversal.assertStatus(422)
    assert.equal(jpg.body().code, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.code)
    assert.equal(jpg.body().key, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.key)
    assert.equal(traversal.body().code, BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT.code)
  })

  test('sin platformAdmin es 403 en alta con archivos y en descarga', async ({
    client,
    assert,
  }) => {
    const payment = await freshPayment('forbidden')
    const created = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(admin.user)
    const taxReceiptId = created.body().data.billingTaxReceiptId as number

    const store = await client
      .post(taxReceiptUrl(payment.billingPaymentId))
      .field('uuid', uniqueFolio())
      .field('stampedAt', stampedAt())
      .file('xml', buildCfdiXml(), { filename: 'acuse.xml', contentType: 'application/xml' })
      .loginAs(outsider.user)
    store.assertStatus(403)
    assert.equal(store.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.notProperty(store.body(), 'code')

    const download = await client.get(downloadUrl(taxReceiptId, 'xml')).loginAs(outsider.user)
    download.assertStatus(403)
    assert.equal(download.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.notProperty(download.body(), 'code')
  })
})

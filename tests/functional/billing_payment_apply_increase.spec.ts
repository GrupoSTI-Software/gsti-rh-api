import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import mail from '@adonisjs/mail/services/main'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingPayment from '#models/billing_payment'
import Employee from '#models/employee'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingPaymentService from '#services/billing_payment_service'
import UploadService from '#services/upload_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import SubscriptionChangeNotApplicableMail from '#mails/subscription_change_not_applicable_mail'
import { BILLING_PAYMENT_ERROR_CODES } from '#constants/billing_payment_error_codes'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — POST /api/platform/billing/subscriptions/:id/payments
 * aplicando aumento pendiente (USRH1786107870856, CA-1…CA-12).
 */

const TEST_PASSWORD = 'BillingPaymentApplyIncrease123!'
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4 billing-payment-test')
const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

interface TenantFixture {
  businessUnit: BusinessUnit
}

interface PendingIncreaseFixture extends TenantFixture {
  subscription: BillingSubscription
  changeId: number
  proratedCents: number
  frozen: {
    unitAmount: number
    discountPercent: number
    taxRate: number
    subtotal: number
    taxAmount: number
    total: number
  }
}

let originalUploadPrivateBuffer: UploadService['uploadPrivateBuffer']
let originalDeleteFile: UploadService['deleteFile']

async function ensureAnyRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').first()
  if (!role) {
    throw new Error('Se requiere al menos un rol en BD.')
  }
  return role
}

async function createPlatformAdmin(): Promise<User> {
  const role = await ensureAnyRole()
  const email = `platform-admin-${STAMP}-${Math.floor(Math.random() * 10_000)}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'Platform'
  person.personLastname = 'Admin'
  person.personSecondLastname = 'Payment'
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.isPlatformAdmin = true
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return user
}

async function createTenant(): Promise<TenantFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Payment Apply BU ${stamp}`
  businessUnit.businessUnitSlug = `payment-apply-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Payment Apply Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()
  return { businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Payment Apply Plan ${stamp}`,
    billingPlanDescription: 'Fixture aplicar aumento al pagar',
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

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 51,
    billingVolumeTierDiscountPercent: 10,
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 101,
    billingVolumeTierDiscountPercent: 15,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number,
  options?: {
    periodEndOffsetDays?: number
    status?: BillingSubscription['billingSubscriptionStatus']
  }
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  const endOffset = options?.periodEndOffsetDays ?? 20
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({
    days: endOffset,
  })
  if (options?.status) {
    subscription.billingSubscriptionStatus = options.status
  }
  await subscription.save()
  return subscription
}

async function createPendingIncrease(
  planId: number,
  tenant: TenantFixture,
  contractedEmployees = 100,
  requestedEmployees = 150
): Promise<PendingIncreaseFixture> {
  const subscription = await createLiveSubscription(
    tenant.businessUnit,
    planId,
    contractedEmployees
  )

  const changeService = new BillingSubscriptionChangeService()
  const increase = await changeService.requestIncrease(
    tenant.businessUnit.businessUnitId,
    requestedEmployees
  )

  const change = await BillingSubscriptionChange.findOrFail(increase.billingSubscriptionChangeId)

  return {
    businessUnit: tenant.businessUnit,
    subscription,
    changeId: change.billingSubscriptionChangeId,
    proratedCents: increase.proration!.amountCents,
    frozen: {
      unitAmount: Number(change.billingSubscriptionChangeUnitAmount),
      discountPercent: Number(change.billingSubscriptionChangeDiscountPercent),
      taxRate: Number(change.billingSubscriptionChangeTaxRate),
      subtotal: Number(change.billingSubscriptionChangeSubtotal),
      taxAmount: Number(change.billingSubscriptionChangeTaxAmount),
      total: Number(change.billingSubscriptionChangeTotal),
    },
  }
}

async function writeTempReceipt(): Promise<string> {
  const path = join(tmpdir(), `billing-receipt-${Date.now()}-${Math.random()}.pdf`)
  await writeFile(path, VALID_PDF_BUFFER)
  return path
}

function isDeadlockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Deadlock')
}

async function registerPaymentViaService(
  subscriptionId: number,
  amountCents: number,
  reference?: string | null
) {
  const tmpPath = await writeTempReceipt()
  const service = new BillingPaymentService()
  try {
    return await service.registerPayment(
      subscriptionId,
      {
        amountCents,
        method: 'transfer',
        reference: reference ?? `REF-${Date.now()}`,
        paidAt: DateTime.now().toISO()!,
      },
      {
        tmpPath,
        clientName: 'receipt.pdf',
        size: VALID_PDF_BUFFER.length,
        headers: { 'content-type': 'application/pdf' },
      }
    )
  } finally {
    await unlink(tmpPath).catch(() => null)
  }
}

async function registerPaymentViaHttp(
  client: { post: (url: string) => ReturnType<import('@japa/api-client').ApiClient['post']> },
  admin: User,
  subscriptionId: number,
  amountCents: number,
  reference?: string
) {
  return client
    .post(`/api/platform/billing/subscriptions/${subscriptionId}/payments`)
    .loginAs(admin)
    .field('amountCents', amountCents)
    .field('method', 'transfer')
    .field('reference', reference ?? `HTTP-${Date.now()}`)
    .field('paidAt', DateTime.now().toISO()!)
    .file('receipt', VALID_PDF_BUFFER, {
      filename: 'receipt.pdf',
      contentType: 'application/pdf',
    })
}

async function seedActiveEmployees(businessUnitId: number, count: number): Promise<void> {
  const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()

  for (let i = 0; i < count; i++) {
    const person = new Person()
    person.personFirstname = 'Quota'
    person.personLastname = 'Seed'
    person.personSecondLastname = `${i}`
    person.personEmail = `quota-seed-${businessUnitId}-${i}-${STAMP}@gsti-tests.local`
    await person.save()

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'Quota'
    employee.employeeLastName = `Emp${i}`
    employee.employeeCode = `QTA-${businessUnitId}-${i}-${STAMP}`
    employee.employeePayrollNum = `QTA-${businessUnitId}-${i}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    await employee.save()
  }
}

async function cleanupTenant(tenant: TenantFixture | null) {
  if (!tenant) return
  const buId = tenant.businessUnit.businessUnitId

  await BillingSubscriptionChange.query()
    .where('business_unit_id', buId)
    .update({ billingSubscriptionChangeBillingPaymentId: null })

  const subscriptions = await BillingSubscription.query()
    .where('business_unit_id', buId)
    .select('billing_subscription_id')
  const subscriptionIds = subscriptions.map((row) => row.billingSubscriptionId)

  if (subscriptionIds.length > 0) {
    await BillingPayment.query().whereIn('billing_subscription_id', subscriptionIds).delete()
  }

  await BillingSubscriptionChange.query().where('business_unit_id', buId).delete()

  const employees = await Employee.query()
    .where('business_unit_id', buId)
    .select('person_id')
  const personIds = employees.map((row) => row.personId).filter(Boolean)

  await Employee.query().where('business_unit_id', buId).delete()
  if (personIds.length > 0) {
    await Person.query().whereIn('person_id', personIds).delete()
  }

  await BillingSubscription.query().where('business_unit_id', buId).delete()
  await BusinessUnit.query().where('business_unit_id', buId).delete()
}

async function cleanupPlatformAdmin(admin: User | null) {
  if (!admin) return
  await BusinessUnitUser.query().where('user_id', admin.userId).delete()
  await User.query().where('user_id', admin.userId).delete()
  if (admin.personId) {
    await Person.query().where('person_id', admin.personId).delete()
  }
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return

  const subscriptions = await BillingSubscription.query()
    .where('billing_plan_id', planId)
    .select('billing_subscription_id')
  const subscriptionIds = subscriptions.map((row) => row.billingSubscriptionId)

  if (subscriptionIds.length > 0) {
    await BillingSubscriptionChange.query()
      .whereIn('billing_subscription_id', subscriptionIds)
      .update({ billingSubscriptionChangeBillingPaymentId: null })
    await BillingPayment.query().whereIn('billing_subscription_id', subscriptionIds).delete()
    await BillingSubscriptionChange.query().whereIn('billing_subscription_id', subscriptionIds).delete()
    await BillingSubscription.query().whereIn('billing_subscription_id', subscriptionIds).delete()
  }

  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('POST /api/platform/billing/subscriptions/:id/payments — auth', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client
      .post('/api/platform/billing/subscriptions/1/payments')
      .field('amountCents', 1000)
      .field('method', 'transfer')
      .field('paidAt', DateTime.now().toISO()!)
      .file('receipt', VALID_PDF_BUFFER, {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      })
    response.assertStatus(401)
  })
})

test.group('POST /api/platform/billing/subscriptions/:id/payments — aplicar aumento (0856)', (group) => {
  let planId: number | null = null
  let platformAdmin: User | null = null

  group.setup(async () => {
    originalUploadPrivateBuffer = UploadService.prototype.uploadPrivateBuffer
    originalDeleteFile = UploadService.prototype.deleteFile
    UploadService.prototype.uploadPrivateBuffer = async (key) => `test-private/${key}`
    UploadService.prototype.deleteFile = async () =>
      ({
        status: 200,
        data: {},
        message: 'file_deleted_successfully',
      }) as Awaited<ReturnType<UploadService['deleteFile']>>

    planId = await createPublishedPlan(Date.now())
    platformAdmin = await createPlatformAdmin()
  })

  group.teardown(async () => {
    UploadService.prototype.uploadPrivateBuffer = originalUploadPrivateBuffer
    UploadService.prototype.deleteFile = originalDeleteFile
    await cleanupPlatformAdmin(platformAdmin)
    await cleanupPlan(planId)
  })

  test('CA-1: aplica el aumento completo al cubrir el adeudo', async ({ assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const result = await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents
      )

      assert.isNotNull(result.appliedChange)
      assert.equal(result.appliedChange!.billingSubscriptionChangeStatus, 'applied')
      assert.equal(result.appliedChange!.billingSubscriptionChangeNewEmployees, 150)

      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(subscription.billingSubscriptionContractedEmployees, 150)
      assert.equal(Number(subscription.billingSubscriptionContractedUnitAmount), fixture.frozen.unitAmount)
      assert.equal(Number(subscription.billingSubscriptionDiscountPercent), fixture.frozen.discountPercent)
      assert.equal(Number(subscription.billingSubscriptionContractedTaxRate), fixture.frozen.taxRate)
      assert.equal(Number(subscription.billingSubscriptionContractedSubtotal), fixture.frozen.subtotal)
      assert.equal(Number(subscription.billingSubscriptionContractedTaxAmount), fixture.frozen.taxAmount)
      assert.equal(Number(subscription.billingSubscriptionContractedTotal), fixture.frozen.total)

      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(change.billingSubscriptionChangeStatus, 'applied')
      assert.isNotNull(change.billingSubscriptionChangeAppliedAt)
      assert.equal(change.billingSubscriptionChangeBillingPaymentId, result.billingPaymentId)

      const quotaService = new EmployeeQuotaService()
      const quota = await quotaService.resolveQuota(tenant.businessUnit.businessUnitId)
      assert.equal(quota.limit, 150)
      assert.equal(quota.source, 'subscription')
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-2: recapturar el pago no duplica el aumento', async ({ assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const first = await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents,
        'RETRY-REF'
      )
      const second = await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents,
        'RETRY-REF-2'
      )

      assert.isNotNull(first.appliedChange)
      assert.isNull(second.appliedChange)

      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(subscription.billingSubscriptionContractedEmployees, 150)

      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(change.billingSubscriptionChangeStatus, 'applied')
      assert.equal(change.billingSubscriptionChangeBillingPaymentId, first.billingPaymentId)

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 2)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-3: dos capturas concurrentes aplican el aumento una sola vez', async ({ assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const [first, second] = await Promise.allSettled([
        registerPaymentViaService(fixture.subscription.billingSubscriptionId, fixture.proratedCents),
        registerPaymentViaService(fixture.subscription.billingSubscriptionId, fixture.proratedCents),
      ])

      const outcomes = []
      for (const result of [first, second]) {
        if (result.status === 'fulfilled') {
          outcomes.push(result.value)
          continue
        }

        if (isDeadlockError(result.reason)) {
          outcomes.push(
            await registerPaymentViaService(
              fixture.subscription.billingSubscriptionId,
              fixture.proratedCents
            )
          )
          continue
        }

        throw result.reason
      }

      const appliedCount = outcomes.filter((outcome) => outcome.appliedChange).length
      assert.equal(appliedCount, 1)

      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(subscription.billingSubscriptionContractedEmployees, 150)

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 2)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-4: pago insuficiente deja el cambio pending_payment', async ({ assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const result = await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        Math.min(fixture.proratedCents - 1, 50_000)
      )

      assert.isNull(result.appliedChange)

      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(subscription.billingSubscriptionContractedEmployees, 100)

      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(change.billingSubscriptionChangeStatus, 'pending_payment')
      assert.isNull(change.billingSubscriptionChangeAppliedAt)
      assert.isNull(change.billingSubscriptionChangeBillingPaymentId)

      const quotaService = new EmployeeQuotaService()
      const quota = await quotaService.resolveQuota(tenant.businessUnit.businessUnitId)
      assert.equal(quota.limit, 100)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-5: base desfasada marca not_applicable y avisa a GSTI', async ({ assert }) => {
    const fake = mail.fake()
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      subscription.billingSubscriptionContractedEmployees = 120
      await subscription.save()

      const result = await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents
      )

      assert.isNotNull(result.appliedChange)
      assert.equal(result.appliedChange!.billingSubscriptionChangeStatus, 'not_applicable')

      const refreshed = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(refreshed.billingSubscriptionContractedEmployees, 120)

      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(change.billingSubscriptionChangeNotApplicableReason, 'base-de-cantidad-desfasada')
      assert.equal(change.billingSubscriptionChangeBillingPaymentId, result.billingPaymentId)

      fake.mails.assertSent(SubscriptionChangeNotApplicableMail, () => true)
    } finally {
      mail.restore()
      await cleanupTenant(tenant)
    }
  })

  test('CA-6: pago sin cambio vivo se comporta como hoy', async ({ assert }) => {
    const tenant = await createTenant()
    const subscription = await createLiveSubscription(tenant.businessUnit, planId!, 80)

    try {
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      const result = await registerPaymentViaService(subscription.billingSubscriptionId, 50_000)

      assert.isNull(result.appliedChange)
      assert.equal(result.subscription.status, 'active')

      const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        after.billingSubscriptionContractedEmployees,
        before.billingSubscriptionContractedEmployees
      )
      assert.equal(
        toCalendarIsoDate(after.billingSubscriptionCurrentPeriodStart),
        toCalendarIsoDate(before.billingSubscriptionCurrentPeriodEnd)
      )
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-7: el aumento no altera la lógica de avance de periodo', async ({ assert }) => {
    const tenant = await createTenant()
    const withIncrease = await createPendingIncrease(planId!, tenant)
    const withoutIncreaseTenant = await createTenant()
    const withoutIncrease = await createLiveSubscription(
      withoutIncreaseTenant.businessUnit,
      planId!,
      100,
      { periodEndOffsetDays: 20 }
    )

    try {
      const baseline = await registerPaymentViaService(
        withoutIncrease.billingSubscriptionId,
        50_000
      )

      const applied = await registerPaymentViaService(
        withIncrease.subscription.billingSubscriptionId,
        withIncrease.proratedCents
      )

      assert.equal(applied.periodStart, baseline.periodStart)
      assert.equal(applied.periodEnd, baseline.periodEnd)
    } finally {
      await cleanupTenant(tenant)
      await cleanupTenant(withoutIncreaseTenant)
    }
  })

  test('CA-8: fallo al aplicar revierte pago y cambio (snapshot inconsistente)', async ({
    assert,
  }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      change.billingSubscriptionChangePreviousEmployees = 0
      await change.save()

      let caught: unknown = null
      try {
        await registerPaymentViaService(
          fixture.subscription.billingSubscriptionId,
          fixture.proratedCents
        )
      } catch (error) {
        caught = error
      }

      assert.isNotNull(caught)
      assert.equal(
        (caught as { errorCode?: string }).errorCode,
        BILLING_PAYMENT_ERROR_CODES.CHANGE_INCONSISTENT_SNAPSHOT
      )

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)

      const subscription = await BillingSubscription.findOrFail(
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(subscription.billingSubscriptionContractedEmployees, 100)

      const reloadedChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(reloadedChange.billingSubscriptionChangeStatus, 'pending_payment')
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-9: snapshot inconsistente es fail-closed (alias explícito del rollback)', async ({
    assert,
  }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const change = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      change.billingSubscriptionChangePreviousEmployees = 0
      await change.save()

      await assert.rejects(async () => {
        await registerPaymentViaService(
          fixture.subscription.billingSubscriptionId,
          fixture.proratedCents
        )
      })

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-10: suscripción cancelada rechaza el pago antes de aplicar', async ({ client, assert }) => {
    const tenant = await createTenant()
    const subscription = await createLiveSubscription(tenant.businessUnit, planId!, 100, {
      status: 'canceled',
    })

    try {
      const response = await registerPaymentViaHttp(
        client,
        platformAdmin!,
        subscription.billingSubscriptionId,
        50_000
      )

      response.assertStatus(422)
      response.assertBodyContains({
        code: BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
        key: 'suscripcion-cancelada',
      })

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-11: el pago solo aplica el cambio de su suscripción', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const fixtureA = await createPendingIncrease(planId!, tenantA)
    const fixtureB = await createPendingIncrease(planId!, tenantB)

    try {
      await registerPaymentViaService(
        fixtureA.subscription.billingSubscriptionId,
        fixtureA.proratedCents
      )

      const subscriptionA = await BillingSubscription.findOrFail(
        fixtureA.subscription.billingSubscriptionId
      )
      const subscriptionB = await BillingSubscription.findOrFail(
        fixtureB.subscription.billingSubscriptionId
      )
      const changeB = await BillingSubscriptionChange.findOrFail(fixtureB.changeId)

      assert.equal(subscriptionA.billingSubscriptionContractedEmployees, 150)
      assert.equal(subscriptionB.billingSubscriptionContractedEmployees, 100)
      assert.equal(changeB.billingSubscriptionChangeStatus, 'pending_payment')
    } finally {
      await cleanupTenant(tenantA)
      await cleanupTenant(tenantB)
    }
  })

  test('CA-12: el cupo sube al aplicar sin escritura adicional', async ({ assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      await seedActiveEmployees(tenant.businessUnit.businessUnitId, 100)

      await registerPaymentViaService(
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents
      )

      const quotaService = new EmployeeQuotaService()
      await assert.doesNotReject(async () => {
        await quotaService.assertWithinQuota(tenant.businessUnit.businessUnitId, 1)
      })

      const quota = await quotaService.resolveQuota(tenant.businessUnit.businessUnitId)
      assert.equal(quota.limit, 150)
    } finally {
      await cleanupTenant(tenant)
    }
  })

  test('CA-1 vía HTTP devuelve appliedChange en 201', async ({ client, assert }) => {
    const tenant = await createTenant()
    const fixture = await createPendingIncrease(planId!, tenant)

    try {
      const response = await registerPaymentViaHttp(
        client,
        platformAdmin!,
        fixture.subscription.billingSubscriptionId,
        fixture.proratedCents
      )

      response.assertStatus(201)
      response.assertBodyContains({ type: 'success' })
      assert.equal(response.body().data.appliedChange.billingSubscriptionChangeStatus, 'applied')
    } finally {
      await cleanupTenant(tenant)
    }
  })
})

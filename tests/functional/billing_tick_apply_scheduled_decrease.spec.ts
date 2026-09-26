import { test } from '@japa/runner'
import { execSync } from 'node:child_process'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import Employee from '#models/employee'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingSubscriptionClockService from '#services/billing_subscription_clock_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import { getBusinessTimeZone, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — `billing:tick-subscriptions` / `BillingSubscriptionClockService`
 * aplicando reducciones agendadas (USRH1786107870859, CA-1…CA-11).
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const PERIOD_START = '2026-08-01'
const PERIOD_END = '2026-09-01'
const BEFORE_EFFECTIVE = '2026-08-25'
const ON_EFFECTIVE = PERIOD_END
const AFTER_EFFECTIVE = '2026-09-02'

interface TenantFixture {
  businessUnit: BusinessUnit
  subscription: BillingSubscription
  changeId: number
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Tick Decrease Plan ${stamp}`,
    billingPlanDescription: 'Fixture aplicar reducción agendada',
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

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const stamp = `${label}-${STAMP}-${Math.floor(Math.random() * 10_000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Tick Decrease ${stamp}`
  businessUnit.businessUnitSlug = `tick-decrease-${stamp}`
  businessUnit.businessUnitLegalName = `Tick Decrease Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()
  return businessUnit
}

async function createSubscriptionWithPeriod(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number,
  options?: { status?: BillingSubscription['billingSubscriptionStatus'] }
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(PERIOD_START, {
    zone: getBusinessTimeZone(),
  })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(PERIOD_END, {
    zone: getBusinessTimeZone(),
  })
  if (options?.status) {
    subscription.billingSubscriptionStatus = options.status
  }
  await subscription.save()
  return subscription
}

async function seedActiveEmployees(businessUnitId: number, count: number): Promise<void> {
  const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()

  for (let i = 0; i < count; i++) {
    const person = new Person()
    person.personFirstname = 'TickDecrease'
    person.personLastname = 'Seed'
    person.personSecondLastname = `${businessUnitId}-${i}`
    person.personEmail = `tick-decrease-${businessUnitId}-${i}-${STAMP}@gsti-tests.local`
    await person.save()

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'TickDecrease'
    employee.employeeLastName = `Emp${i}`
    employee.employeeCode = `TDC-${businessUnitId}-${i}-${STAMP}`
    employee.employeePayrollNum = `TDC-${businessUnitId}-${i}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    await employee.save()
  }
}

async function scheduleDecreaseFixture(
  planId: number,
  options: {
    contractedEmployees: number
    newEmployees: number
    activeEmployeesAtSchedule: number
    status?: BillingSubscription['billingSubscriptionStatus']
  }
): Promise<TenantFixture> {
  const businessUnit = await createBusinessUnit('fixture')
  await seedActiveEmployees(businessUnit.businessUnitId, options.activeEmployeesAtSchedule)
  const subscription = await createSubscriptionWithPeriod(
    businessUnit,
    planId,
    options.contractedEmployees,
    { status: options.status }
  )

  const changeService = new BillingSubscriptionChangeService()
  const record = await changeService.scheduleDecrease(
    businessUnit.businessUnitId,
    options.newEmployees
  )

  return {
    businessUnit,
    subscription,
    changeId: record.billingSubscriptionChangeId,
  }
}

async function cleanupBusinessUnit(businessUnitId: number) {
  const subscriptions = await BillingSubscription.query()
    .where('business_unit_id', businessUnitId)
    .select('billing_subscription_id')
  const subscriptionIds = subscriptions.map((row) => row.billingSubscriptionId)

  if (subscriptionIds.length > 0) {
    await db
      .from('billing_subscription_transitions')
      .whereIn('billing_subscription_id', subscriptionIds)
      .delete()
  }

  await BillingSubscriptionChange.query().where('business_unit_id', businessUnitId).delete()
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await Employee.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return

  const subscriptions = await BillingSubscription.query()
    .where('billing_plan_id', planId)
    .select('billing_subscription_id')
  const subscriptionIds = subscriptions.map((row) => row.billingSubscriptionId)

  if (subscriptionIds.length > 0) {
    await db
      .from('billing_subscription_transitions')
      .whereIn('billing_subscription_id', subscriptionIds)
      .delete()
    await BillingSubscriptionChange.query()
      .whereIn('billing_subscription_id', subscriptionIds)
      .delete()
    await BillingSubscription.query().where('billing_plan_id', planId).delete()
  }

  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

function assertSubscriptionAmountsMatchChange(
  assert: { equal: (a: unknown, b: unknown) => void },
  subscription: BillingSubscription,
  change: BillingSubscriptionChange
) {
  assert.equal(
    subscription.billingSubscriptionContractedEmployees,
    change.billingSubscriptionChangeNewEmployees
  )
  assert.equal(
    Number(subscription.billingSubscriptionContractedUnitAmount),
    Number(change.billingSubscriptionChangeUnitAmount)
  )
  assert.equal(
    Number(subscription.billingSubscriptionDiscountPercent),
    Number(change.billingSubscriptionChangeDiscountPercent)
  )
  assert.equal(
    Number(subscription.billingSubscriptionContractedTaxRate),
    Number(change.billingSubscriptionChangeTaxRate)
  )
  assert.equal(
    Number(subscription.billingSubscriptionContractedSubtotal),
    Number(change.billingSubscriptionChangeSubtotal)
  )
  assert.equal(
    Number(subscription.billingSubscriptionContractedTaxAmount),
    Number(change.billingSubscriptionChangeTaxAmount)
  )
  assert.equal(
    Number(subscription.billingSubscriptionContractedTotal),
    Number(change.billingSubscriptionChangeTotal)
  )
}

function runTickSubscriptionsCommand(args: string): string {
  try {
    return execSync(`node ace billing:tick-subscriptions ${args}`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV ?? 'development',
      },
    })
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string }
    return String(execError.stdout ?? execError.stderr ?? '')
  }
}

test.group('BillingSubscriptionClockService — aplicar reducción agendada (0859)', (group) => {
  let planId: number | null = null
  const clock = new BillingSubscriptionClockService()

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('CA-1: aplicación exitosa de la reducción', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      const beforeSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const beforeChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      const periodStartBefore = toCalendarIsoDate(beforeSub.billingSubscriptionCurrentPeriodStart)
      const periodEndBefore = toCalendarIsoDate(beforeSub.billingSubscriptionCurrentPeriodEnd)

      const result = await clock.run(ON_EFFECTIVE)

      assert.isAtLeast(result.changesApplied, 1)
      const detail = result.changeDetails.find(
        (item) => item.billingSubscriptionChangeId === fixture.changeId
      )
      assert.isDefined(detail)
      assert.equal(detail!.outcome, 'applied')

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterChange.billingSubscriptionChangeStatus, 'applied')
      assert.isNotNull(afterChange.billingSubscriptionChangeAppliedAt)
      assert.isNull(afterChange.billingSubscriptionChangeNotApplicableReason)
      assertSubscriptionAmountsMatchChange(assert, afterSub, beforeChange)
      assert.equal(periodStartBefore, PERIOD_START)
      assert.equal(periodEndBefore, PERIOD_END)
      assert.equal(
        toCalendarIsoDate(afterSub.billingSubscriptionCurrentPeriodStart),
        PERIOD_START
      )
      assert.equal(toCalendarIsoDate(afterSub.billingSubscriptionCurrentPeriodEnd), PERIOD_END)
      assert.equal(toCalendarIsoDate(afterSub.billingSubscriptionContractedEffectiveFrom), ON_EFFECTIVE)
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-2: revalidación fallida por crecimiento de plantilla', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      await seedActiveEmployees(fixture.businessUnit.businessUnitId, 35)

      const beforeSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const beforeTotal = Number(beforeSub.billingSubscriptionContractedTotal)

      const result = await clock.run(ON_EFFECTIVE)

      assert.isAtLeast(result.changesNotApplicable, 1)

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterSub.billingSubscriptionContractedEmployees, 100)
      assert.equal(Number(afterSub.billingSubscriptionContractedTotal), beforeTotal)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'not_applicable')
      assert.equal(
        afterChange.billingSubscriptionChangeNotApplicableReason,
        'cantidad-menor-a-plantilla-activa'
      )
      assert.isNull(afterChange.billingSubscriptionChangeAppliedAt)
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-3: frontera exacta — 80 activos aplica', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 50,
    })

    try {
      await seedActiveEmployees(fixture.businessUnit.businessUnitId, 30)

      await clock.run(ON_EFFECTIVE)

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterSub.billingSubscriptionContractedEmployees, 80)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'applied')
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-3: frontera exacta — 81 activos no aplica', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 50,
    })

    try {
      await seedActiveEmployees(fixture.businessUnit.businessUnitId, 31)

      await clock.run(ON_EFFECTIVE)

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterSub.billingSubscriptionContractedEmployees, 100)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'not_applicable')
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-4: fecha de efecto no alcanzada', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      const beforeSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)

      await clock.run(BEFORE_EFFECTIVE)

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterChange.billingSubscriptionChangeStatus, 'scheduled')
      assert.isNull(afterChange.billingSubscriptionChangeAppliedAt)
      assert.isNull(afterChange.billingSubscriptionChangeNotApplicableReason)
      assert.equal(
        afterSub.billingSubscriptionContractedEmployees,
        beforeSub.billingSubscriptionContractedEmployees
      )
      assert.equal(
        Number(afterSub.billingSubscriptionContractedTotal),
        Number(beforeSub.billingSubscriptionContractedTotal)
      )
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-5: idempotencia en corridas repetidas', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      await clock.run(ON_EFFECTIVE)
      const firstSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const firstChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      const firstAppliedAt = firstChange.billingSubscriptionChangeAppliedAt?.toISO()

      await clock.run(ON_EFFECTIVE)
      await clock.run(AFTER_EFFECTIVE)
      await clock.run(ON_EFFECTIVE)

      const finalSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const finalChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      const changeRows = await BillingSubscriptionChange.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )

      assert.equal(finalSub.billingSubscriptionContractedEmployees, firstSub.billingSubscriptionContractedEmployees)
      assert.equal(
        Number(finalSub.billingSubscriptionContractedTotal),
        Number(firstSub.billingSubscriptionContractedTotal)
      )
      assert.equal(finalChange.billingSubscriptionChangeAppliedAt?.toISO(), firstAppliedAt)
      assert.lengthOf(changeRows, 1)
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-6: rastro consultable en applied y not_applicable', async ({ assert }) => {
    const appliedFixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })
    const blockedFixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      await seedActiveEmployees(blockedFixture.businessUnit.businessUnitId, 35)
      await clock.run(ON_EFFECTIVE)

      const appliedChange = await BillingSubscriptionChange.findOrFail(appliedFixture.changeId)
      const blockedChange = await BillingSubscriptionChange.findOrFail(blockedFixture.changeId)

      assert.equal(appliedChange.billingSubscriptionChangePreviousEmployees, 100)
      assert.equal(appliedChange.billingSubscriptionChangeNewEmployees, 80)
      assert.isNotNull(appliedChange.billingSubscriptionChangeAppliedAt)

      assert.equal(blockedChange.billingSubscriptionChangePreviousEmployees, 100)
      assert.equal(blockedChange.billingSubscriptionChangeNewEmployees, 80)
      assert.equal(
        blockedChange.billingSubscriptionChangeNotApplicableReason,
        'cantidad-menor-a-plantilla-activa'
      )
      assert.isNull(blockedChange.billingSubscriptionChangeAppliedAt)
      assert.isNotNull(blockedChange.billingSubscriptionChangeUpdatedAt)
    } finally {
      await cleanupBusinessUnit(appliedFixture.businessUnit.businessUnitId)
      await cleanupBusinessUnit(blockedFixture.businessUnit.businessUnitId)
    }
  })

  test('CA-7: suscripción past_due aplica la reducción agendada', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      const subscription = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      subscription.billingSubscriptionStatus = 'past_due'
      await subscription.save()

      await clock.run(ON_EFFECTIVE)

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterSub.billingSubscriptionStatus, 'past_due')
      assert.equal(afterSub.billingSubscriptionContractedEmployees, 80)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'applied')
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-8: aislamiento de fallos dentro del lote', async ({ assert }) => {
    const okA = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 40,
    })
    const failing = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 40,
    })
    const okB = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 40,
    })

    const failingSubId = failing.subscription.billingSubscriptionId
    const original = BillingSubscriptionChangeService.prototype.applyScheduledDecrease

    BillingSubscriptionChangeService.prototype.applyScheduledDecrease = async function (
      subscription,
      businessDate
    ) {
      if (subscription.billingSubscriptionId === failingSubId) {
        throw new Error('fallo simulado CA-8')
      }
      return original.call(this, subscription, businessDate)
    }

    try {
      const result = await clock.run(ON_EFFECTIVE)

      assert.isAtLeast(result.failed, 1)

      const failingChange = await BillingSubscriptionChange.findOrFail(failing.changeId)
      assert.equal(failingChange.billingSubscriptionChangeStatus, 'scheduled')

      const okAChange = await BillingSubscriptionChange.findOrFail(okA.changeId)
      const okBChange = await BillingSubscriptionChange.findOrFail(okB.changeId)
      assert.equal(okAChange.billingSubscriptionChangeStatus, 'applied')
      assert.equal(okBChange.billingSubscriptionChangeStatus, 'applied')
    } finally {
      BillingSubscriptionChangeService.prototype.applyScheduledDecrease = original
      await cleanupBusinessUnit(okA.businessUnit.businessUnitId)
      await cleanupBusinessUnit(failing.businessUnit.businessUnitId)
      await cleanupBusinessUnit(okB.businessUnit.businessUnitId)
    }
  })

  test('CA-9: aislamiento por empresa', async ({ assert }) => {
    const tenantA = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })
    const tenantB = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 120,
      newEmployees: 90,
      activeEmployeesAtSchedule: 50,
    })

    try {
      await clock.run(ON_EFFECTIVE)

      const subA = await BillingSubscription.findOrFail(tenantA.subscription.billingSubscriptionId)
      const subB = await BillingSubscription.findOrFail(tenantB.subscription.billingSubscriptionId)
      const changeA = await BillingSubscriptionChange.findOrFail(tenantA.changeId)
      const changeB = await BillingSubscriptionChange.findOrFail(tenantB.changeId)

      assert.equal(subA.billingSubscriptionContractedEmployees, 80)
      assert.equal(subB.billingSubscriptionContractedEmployees, 90)
      assert.equal(changeA.billingSubscriptionId, tenantA.subscription.billingSubscriptionId)
      assert.equal(changeB.billingSubscriptionId, tenantB.subscription.billingSubscriptionId)
      assert.equal(changeA.businessUnitId, tenantA.businessUnit.businessUnitId)
      assert.equal(changeB.businessUnitId, tenantB.businessUnit.businessUnitId)
    } finally {
      await cleanupBusinessUnit(tenantA.businessUnit.businessUnitId)
      await cleanupBusinessUnit(tenantB.businessUnit.businessUnitId)
    }
  })

  test('CA-10: suscripción cancelada no procesa la reducción', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      const subscription = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      subscription.billingSubscriptionStatus = 'canceled'
      await subscription.save()

      await clock.run(ON_EFFECTIVE)

      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'scheduled')
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-11: el cupo baja con la cantidad contratada', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      await clock.run(ON_EFFECTIVE)
      await seedActiveEmployees(fixture.businessUnit.businessUnitId, 20)

      const quotaService = new EmployeeQuotaService()
      const quota = await quotaService.resolveQuota(fixture.businessUnit.businessUnitId)

      assert.equal(quota.limit, 80)
      assert.equal(quota.source, 'subscription')

      await assert.rejects(async () => {
        await quotaService.assertWithinQuota(fixture.businessUnit.businessUnitId, 1)
      })
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })
})

test.group('billing:tick-subscriptions — comando ace (E7 / spec §7.1)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('sin --force fuera de producción el comando se omite', ({ assert }) => {
    const output = runTickSubscriptionsCommand('')
    assert.include(output, 'se omite')
    assert.notInclude(output, 'reducciones_aplicadas=')
  })

  test('CA-1 vía comando: --force --date aplica y loguea el desenlace', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      const beforeChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      const output = runTickSubscriptionsCommand(`--date=${ON_EFFECTIVE} --force`)

      assert.include(output, 'billing:tick-subscriptions — fin:')
      assert.include(output, 'reducciones_aplicadas=')
      assert.include(output, `[aplicada] sub#${fixture.subscription.billingSubscriptionId}`)
      assert.include(output, `change#${fixture.changeId}`)
      assert.include(output, '100 → 80')

      const afterSub = await BillingSubscription.findOrFail(fixture.subscription.billingSubscriptionId)
      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)

      assert.equal(afterChange.billingSubscriptionChangeStatus, 'applied')
      assertSubscriptionAmountsMatchChange(assert, afterSub, beforeChange)
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })

  test('CA-2 vía comando: loguea reducción no aplicable en el resumen', async ({ assert }) => {
    const fixture = await scheduleDecreaseFixture(planId!, {
      contractedEmployees: 100,
      newEmployees: 80,
      activeEmployeesAtSchedule: 60,
    })

    try {
      await seedActiveEmployees(fixture.businessUnit.businessUnitId, 35)

      const output = runTickSubscriptionsCommand(`--date=${ON_EFFECTIVE} --force`)

      assert.include(output, 'reducciones_no_aplicables=')
      assert.include(output, `[no-aplicable] sub#${fixture.subscription.billingSubscriptionId}`)
      assert.include(output, 'cantidad-menor-a-plantilla-activa')

      const afterChange = await BillingSubscriptionChange.findOrFail(fixture.changeId)
      assert.equal(afterChange.billingSubscriptionChangeStatus, 'not_applicable')
    } finally {
      await cleanupBusinessUnit(fixture.businessUnit.businessUnitId)
    }
  })
})

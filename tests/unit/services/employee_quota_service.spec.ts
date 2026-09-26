import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Employee from '#models/employee'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import { EmployeeQuotaError } from '../../../app/exceptions/employee_quota_error.js'
import { EMPLOYEE_QUOTA_ERROR_CODES } from '#constants/employee_quota_error_codes'

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Employee Quota Plan ${stamp}`,
    billingPlanDescription: 'Fixture de cupo de empleados',
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

async function createBusinessUnit(
  stamp: number,
  origin: 'self_service' | 'platform'
): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Employee Quota BU ${stamp}`
  businessUnit.businessUnitSlug = `employee-quota-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Employee Quota Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = origin
  await businessUnit.save()
  return businessUnit
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  return subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
  })
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await Employee.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number) {
  await BillingSubscription.query().where('billing_plan_id', planId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

async function createTestPerson(suffix: string): Promise<Person> {
  const person = new Person()
  person.personFirstname = 'Quota'
  person.personLastname = 'Race'
  person.personSecondLastname = suffix
  person.personEmail = `quota-race-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()
  return person
}

async function createMinimalActiveEmployee(
  template: Employee,
  businessUnitId: number,
  suffix: string
): Promise<{ employee: Employee; person: Person }> {
  const person = new Person()
  person.personFirstname = 'Quota'
  person.personLastname = 'Seed'
  person.personSecondLastname = suffix
  person.personEmail = `quota-seed-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()

  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnitId
  employee.companyId = template.companyId
  employee.departmentId = template.departmentId
  employee.positionId = template.positionId
  employee.employeeTypeId = template.employeeTypeId
  employee.employeeFirstName = 'Quota'
  employee.employeeLastName = suffix
  employee.employeeCode = `QUOTA-${suffix}-${STAMP}`
  employee.employeePayrollNum = `Q-${suffix}`
  employee.employeeHireDate = DateTime.fromISO('2024-01-15')
  await employee.save()

  return { employee, person }
}

test.group('EmployeeQuotaService.resolveQuota — matriz §6.1', (group) => {
  let planId: number
  const service = new EmployeeQuotaService()

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('self_service con contratación viva usa cantidad contratada', async ({ assert }) => {
    const stamp = Date.now()
    const businessUnit = await createBusinessUnit(stamp, 'self_service')

    try {
      await createLiveSubscription(businessUnit, planId, 30)
      const quota = await service.resolveQuota(businessUnit.businessUnitId)

      assert.equal(quota.source, 'subscription')
      assert.equal(quota.limit, 30)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('self_service sin contratación viva devuelve cupo cero (no_plan)', async ({ assert }) => {
    const stamp = Date.now() + 1
    const businessUnit = await createBusinessUnit(stamp, 'self_service')

    try {
      const quota = await service.resolveQuota(businessUnit.businessUnitId)
      assert.equal(quota.source, 'no_plan')
      assert.equal(quota.limit, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('self_service con suscripción cancelada devuelve no_plan', async ({ assert }) => {
    const stamp = Date.now() + 2
    const businessUnit = await createBusinessUnit(stamp, 'self_service')

    try {
      const subscription = await createLiveSubscription(businessUnit, planId, 20)
      subscription.billingSubscriptionStatus = 'canceled'
      subscription.billingSubscriptionLiveBusinessUnitId = null
      subscription.billingSubscriptionCanceledAt = DateTime.utc()
      await subscription.save()

      const quota = await service.resolveQuota(businessUnit.businessUnitId)
      assert.equal(quota.source, 'no_plan')
      assert.equal(quota.limit, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('platform con contratación viva manda sobre legacy', async ({ assert }) => {
    const stamp = Date.now() + 3
    const businessUnit = await createBusinessUnit(stamp, 'platform')

    try {
      await createLiveSubscription(businessUnit, planId, 50)
      const quota = await service.resolveQuota(businessUnit.businessUnitId)

      assert.equal(quota.source, 'subscription')
      assert.equal(quota.limit, 50)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('platform sin contratación ni legacy devuelve sin tope', async ({ assert }) => {
    const stamp = Date.now() + 4
    const businessUnit = await createBusinessUnit(stamp, 'platform')

    try {
      const quota = await service.resolveQuota(businessUnit.businessUnitId)
      assert.equal(quota.source, 'none')
      assert.isNull(quota.limit)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })
})

test.group('EmployeeQuotaService.assertWithinQuota y conteo', (group) => {
  let planId: number
  const service = new EmployeeQuotaService()

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now() + 100)
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('rechaza self_service sin plan con EMP.QUOTA.NO_PLAN', async ({ assert }) => {
    const stamp = Date.now() + 10
    const businessUnit = await createBusinessUnit(stamp, 'self_service')

    try {
      try {
        await service.assertWithinQuota(businessUnit.businessUnitId, 1)
        assert.fail('debió lanzar EmployeeQuotaError')
      } catch (error) {
        assert.instanceOf(error, EmployeeQuotaError)
        assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.NO_PLAN)
      }
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('countActiveEmployees excluye soft delete y baja laboral', async ({ assert }) => {
    const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const stamp = Date.now() + 11
    const businessUnit = await createBusinessUnit(stamp, 'platform')

    try {
      await createMinimalActiveEmployee(template, businessUnit.businessUnitId, 'active')
      const terminated = await createMinimalActiveEmployee(
        template,
        businessUnit.businessUnitId,
        'terminated'
      )

      await db
        .from('employees')
        .where('employee_id', terminated.employee.employeeId)
        .update({ employee_terminated_date: '2024-06-01' })

      const count = await service.countActiveEmployees(businessUnit.businessUnitId)
      assert.equal(count, 1)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })

  test('dos validaciones concurrentes con un cupo libre: una pasa y la otra falla', async ({
    assert,
  }) => {
    const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const stamp = Date.now() + 12
    const businessUnit = await createBusinessUnit(stamp, 'self_service')

    try {
      await createLiveSubscription(businessUnit, planId, 10)

      for (let i = 0; i < 9; i++) {
        await createMinimalActiveEmployee(template, businessUnit.businessUnitId, `race-${i}`)
      }

      const reserveSlot = () =>
        db.transaction(async (trx) => {
          await service.assertWithinQuota(businessUnit.businessUnitId, 1, trx)
          const person = await createTestPerson(`race-slot-${Math.random()}`)
          const employee = new Employee()
          employee.personId = person.personId
          employee.businessUnitId = businessUnit.businessUnitId
          employee.companyId = template.companyId
          employee.departmentId = template.departmentId
          employee.positionId = template.positionId
          employee.employeeTypeId = template.employeeTypeId
          employee.employeeFirstName = 'Race'
          employee.employeeLastName = 'Quota'
          employee.employeeCode = `RACE-${STAMP}-${Math.random()}`
          employee.employeePayrollNum = `RQ-${Math.random()}`
          employee.employeeHireDate = DateTime.fromISO('2024-01-15')
          employee.useTransaction(trx)
          await employee.save()
        })

      const results = await Promise.allSettled([reserveSlot(), reserveSlot()])
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')

      assert.lengthOf(fulfilled, 1)
      assert.lengthOf(rejected, 1)
      assert.instanceOf((rejected[0] as PromiseRejectedResult).reason, EmployeeQuotaError)
      assert.equal(
        ((rejected[0] as PromiseRejectedResult).reason as EmployeeQuotaError).errorCode,
        EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED
      )

      const totalRow = await db
        .from('employees')
        .where('business_unit_id', businessUnit.businessUnitId)
        .whereNull('employee_deleted_at')
        .whereNull('employee_terminated_date')
        .count('* as total')
        .first()

      assert.equal(Number((totalRow as { total: string | number }).total), 10)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })
})

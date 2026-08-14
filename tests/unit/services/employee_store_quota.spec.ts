import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Employee from '#models/employee'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import EmployeeService from '#services/employee_service'
import { EmployeeQuotaError } from '../../../app/exceptions/employee_quota_error.js'
import { EMPLOYEE_QUOTA_ERROR_CODES } from '#constants/employee_quota_error_codes'

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Employee Store Quota Plan ${stamp}`,
    billingPlanDescription: 'Fixture de alta con cupo',
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

async function createSelfServiceBusinessUnit(stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Employee Store Quota BU ${stamp}`
  businessUnit.businessUnitSlug = `employee-store-quota-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Employee Store Quota Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()
  return businessUnit
}

async function createTestPerson(suffix: string): Promise<Person> {
  const person = new Person()
  person.personFirstname = 'StoreQuota'
  person.personLastname = 'Test'
  person.personSecondLastname = suffix
  person.personEmail = `store-quota-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()
  return person
}

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de desarrollo no tiene empleados para usar de plantilla')
  }
  return template
}

function buildEmployeePayload(
  template: Employee,
  person: Person,
  businessUnitId: number,
  suffix: string
): Employee {
  return {
    employeeId: 0,
    employeeFirstName: 'StoreQuota',
    employeeLastName: 'Test',
    employeeSecondLastName: suffix,
    employeeCode: `STOREQ-${suffix}-${STAMP}`,
    employeePayrollNum: `SQ-${suffix}-${STAMP}`,
    employeeHireDate: '2024-01-15 00:00:00',
    companyId: template.companyId,
    departmentId: template.departmentId,
    positionId: template.positionId,
    personId: person.personId,
    businessUnitId,
    dailySalary: 0,
    payrollBusinessUnitId: template.payrollBusinessUnitId,
    employeeWorkSchedule: 'Onsite',
    employeeTypeId: template.employeeTypeId,
    employeeAssistDiscriminator: 0,
    employeeIgnoreConsecutiveAbsences: 0,
    employeeAuthorizeAnyZones: 0,
  } as unknown as Employee
}

async function createMinimalActiveEmployee(
  template: Employee,
  businessUnitId: number,
  suffix: string
): Promise<{ employee: Employee; person: Person }> {
  const person = await createTestPerson(`seed-${suffix}`)
  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnitId
  employee.companyId = template.companyId
  employee.departmentId = template.departmentId
  employee.positionId = template.positionId
  employee.employeeTypeId = template.employeeTypeId
  employee.employeeFirstName = 'StoreQuota'
  employee.employeeLastName = suffix
  employee.employeeCode = `STOREQ-SEED-${suffix}-${STAMP}`
  employee.employeePayrollNum = `SQ-SEED-${suffix}`
  employee.employeeHireDate = DateTime.fromISO('2024-01-15')
  await employee.save()
  return { employee, person }
}

async function cleanupPersons(personIds: number[]) {
  if (personIds.length === 0) {
    return
  }
  await Person.query().whereIn('person_id', personIds).delete()
}

async function cleanupBusinessUnitWithPersons(businessUnitId: number, personIds: number[]) {
  await cleanupBusinessUnit(businessUnitId)
  await cleanupPersons(personIds)
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

test.group('EmployeeService — cupo en alta individual (USRH1785441817258)', (group) => {
  let planId: number

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('rechaza alta en self_service sin plan con EMP.QUOTA.NO_PLAN', async ({ assert, cleanup }) => {
    const stamp = Date.now()
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const person = await createTestPerson('no-plan')
    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, [person.personId])
    })

    const template = await getTemplateEmployee()
    const payload = buildEmployeePayload(template, person, businessUnit.businessUnitId, 'no-plan')
    const service = getService()

    try {
      await service.create(payload, [])
      assert.fail('debió lanzar EmployeeQuotaError')
    } catch (error) {
      assert.instanceOf(error, EmployeeQuotaError)
      assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.NO_PLAN)
    }
  })

  test('rechaza el empleado 11 cuando el cupo contratado es 10', async ({ assert, cleanup }) => {
    const stamp = Date.now() + 1
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })

    const template = await getTemplateEmployee()
    const seededPersonIds: number[] = []

    for (let i = 0; i < 10; i++) {
      const seeded = await createMinimalActiveEmployee(template, businessUnit.businessUnitId, `full-${i}`)
      seededPersonIds.push(seeded.person.personId)
    }

    const person = await createTestPerson('overflow')
    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, [
        ...seededPersonIds,
        person.personId,
      ])
    })

    const payload = buildEmployeePayload(template, person, businessUnit.businessUnitId, 'overflow')
    const service = getService()

    try {
      await service.create(payload, [])
      assert.fail('debió lanzar EmployeeQuotaError')
    } catch (error) {
      assert.instanceOf(error, EmployeeQuotaError)
      assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED)
      assert.equal((error as EmployeeQuotaError).i18nData?.contracted, 10)
      assert.equal((error as EmployeeQuotaError).i18nData?.active, 10)
    }
  })

  test('permite alta dentro del cupo contratado', async ({ assert, cleanup }) => {
    const stamp = Date.now() + 2
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })

    const person = await createTestPerson('ok')
    const template = await getTemplateEmployee()
    const payload = buildEmployeePayload(template, person, businessUnit.businessUnitId, 'ok')
    const service = getService()

    const created = await service.create(payload, [])
    cleanup(async () => {
      await Employee.query().where('employee_id', created.employeeId).delete()
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, [person.personId])
    })

    assert.isTrue(created.employeeId > 0)
  })

  test('dos altas concurrentes con un solo lugar libre: una pasa y la otra falla', async ({
    assert,
    cleanup,
  }) => {
    const stamp = Date.now() + 3
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })

    const template = await getTemplateEmployee()
    const seededPersonIds: number[] = []

    for (let i = 0; i < 9; i++) {
      const seeded = await createMinimalActiveEmployee(template, businessUnit.businessUnitId, `race-${i}`)
      seededPersonIds.push(seeded.person.personId)
    }

    const personA = await createTestPerson('race-a')
    const personB = await createTestPerson('race-b')
    const payloadA = buildEmployeePayload(template, personA, businessUnit.businessUnitId, 'race-a')
    const payloadB = buildEmployeePayload(template, personB, businessUnit.businessUnitId, 'race-b')
    const service = getService()

    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, [
        ...seededPersonIds,
        personA.personId,
        personB.personId,
      ])
    })

    const results = await Promise.allSettled([
      service.create(payloadA, []),
      service.create(payloadB, []),
    ])

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
  })
})

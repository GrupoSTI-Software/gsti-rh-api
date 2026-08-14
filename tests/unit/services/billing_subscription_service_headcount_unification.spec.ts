import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de desarrollo no tiene empleados para usar de plantilla')
  }
  return template
}

async function createBusinessUnit(stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Headcount Unify BU ${stamp}`
  businessUnit.businessUnitSlug = `headcount-unify-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Headcount Unify Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()
  return businessUnit
}

async function createEmployee(
  template: Employee,
  businessUnitId: number,
  suffix: string,
  options?: { terminated?: boolean }
): Promise<{ employee: Employee; person: Person }> {
  const person = new Person()
  person.personFirstname = 'Headcount'
  person.personLastname = 'Unify'
  person.personSecondLastname = suffix
  person.personEmail = `headcount-unify-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()

  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnitId
  employee.companyId = template.companyId
  employee.departmentId = template.departmentId
  employee.positionId = template.positionId
  employee.employeeTypeId = template.employeeTypeId
  employee.employeeFirstName = 'Headcount'
  employee.employeeLastName = suffix
  employee.employeeCode = `HCU-${suffix}-${STAMP}`
  employee.employeePayrollNum = `HCU-${suffix}`
  employee.employeeHireDate = DateTime.fromISO('2024-01-15')
  if (options?.terminated) {
    employee.employeeTerminatedDate = DateTime.fromISO('2025-06-01').toISODate()
  }
  await employee.save()

  return { employee, person }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Headcount Unify Plan ${stamp}`,
    billingPlanDescription: 'Fixture conteo unificado',
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

test.group('BillingSubscriptionService — unificación conteo (USRH1786107870847)', () => {
  test('listBusinessUnits excluye empleados con baja laboral del conteo', async ({ assert, cleanup }) => {
    const stamp = Date.now()
    const businessUnit = await createBusinessUnit(stamp)
    const template = await getTemplateEmployee()
    const personIds: number[] = []

    for (let i = 0; i < 2; i++) {
      const seeded = await createEmployee(template, businessUnit.businessUnitId, `active-${i}`)
      personIds.push(seeded.person.personId)
    }
    for (let i = 0; i < 3; i++) {
      const seeded = await createEmployee(template, businessUnit.businessUnitId, `terminated-${i}`, {
        terminated: true,
      })
      personIds.push(seeded.person.personId)
    }

    cleanup(async () => {
      await Employee.query().where('business_unit_id', businessUnit.businessUnitId).delete()
      await Person.query().whereIn('person_id', personIds).delete()
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    })

    const service = new BillingSubscriptionService()
    const items = await service.listBusinessUnits()
    const item = items.find((row) => row.businessUnitPublicId === businessUnit.businessUnitPublicId)

    assert.isDefined(item)
    assert.equal(item!.activeEmployees, 2)
  })

  test('createSubscription sin contractedEmployees usa conteo canónico', async ({ assert, cleanup }) => {
    const stamp = Date.now() + 1
    const businessUnit = await createBusinessUnit(stamp)
    const template = await getTemplateEmployee()
    const personIds: number[] = []

    for (let i = 0; i < 2; i++) {
      const seeded = await createEmployee(template, businessUnit.businessUnitId, `sub-active-${i}`)
      personIds.push(seeded.person.personId)
    }
    const terminated = await createEmployee(
      template,
      businessUnit.businessUnitId,
      'sub-terminated',
      { terminated: true }
    )
    personIds.push(terminated.person.personId)

    const planId = await createPublishedPlan(stamp)
    let subscriptionId: number | null = null

    const service = new BillingSubscriptionService()
    const subscription = await service.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
    })
    subscriptionId = subscription.billingSubscriptionId

    assert.equal(subscription.billingSubscriptionContractedEmployees, 2)

    cleanup(async () => {
      if (subscriptionId) {
        await BillingSubscription.query()
          .where('billing_subscription_id', subscriptionId)
          .delete()
      }
      await Employee.query().where('business_unit_id', businessUnit.businessUnitId).delete()
      await Person.query().whereIn('person_id', personIds).delete()
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
      await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
      const plan = await BillingPlan.find(planId)
      if (plan) await plan.delete()
    })
  })
})

test.group('billing_subscription_service — higiene E7', () => {
  test('getCurrentPrice es público y listBusinessUnits filtra employee_terminated_date', ({
    assert,
  }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/billing_subscription_service.ts'),
      'utf-8'
    )

    assert.include(content, 'async getCurrentPrice(')
    assert.notInclude(content, 'private async getCurrentPrice(')
    assert.notInclude(content, 'private async countActiveEmployees(')
    assert.include(content, 'employeeQuotaService.countActiveEmployees')
    assert.include(content, ".whereNull('employee_terminated_date')")
  })

  test('billing_tenant_service usa EMPLOYEE_BLOCK_SIZE', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/billing_tenant_service.ts'),
      'utf-8'
    )

    assert.include(content, 'EMPLOYEE_BLOCK_SIZE')
    assert.notInclude(content, 'Math.ceil(activeEmployees / 10) * 10')
    assert.notInclude(content, 'employeeCount % 10 !== 0')
  })
})

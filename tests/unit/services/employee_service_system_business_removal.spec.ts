import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { TenantContext } from '#utils/tenant_context'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import EmployeeService from '#services/employee_service'
import { EmployeeQuotaError } from '../../../app/exceptions/employee_quota_error.js'
import { EMPLOYEE_QUOTA_ERROR_CODES } from '#constants/employee_quota_error_codes'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { DateTime } from 'luxon'

/**
 * USRH1783821206455 — retiro de las 3 últimas lecturas funcionales de
 * `SYSTEM_BUSINESS` en el servicio de empleados: límite de empleados,
 * identificador biométrico y color de exportes. Verificado contra BD real
 * (BU1=sae / BU6=cima ya tienen `system_settings` con colores distintos).
 */

const EMPLOYEE_SERVICE_FILE = join(process.cwd(), 'app/services/employee_service.ts')

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

test.group('employee_service.ts — sin lecturas funcionales de SYSTEM_BUSINESS', () => {
  test('el archivo no contiene ninguna lectura funcional de SYSTEM_BUSINESS', ({ assert }) => {
    const content = readFileSync(EMPLOYEE_SERVICE_FILE, 'utf-8')
    assert.notInclude(content, 'SYSTEM_BUSINESS')
  })
})

test.group('verifyEmployeeLimit — cupo contratado (BD real)', (group) => {
  let planId: number
  let businessUnitId: number
  let personIds: number[] = []

  group.setup(async () => {
    const stamp = Date.now()
    const catalog = new BillingCatalogService()
    const plan = await catalog.createPlan({
      billingPlanName: `Verify Limit Plan ${stamp}`,
      billingPlanDescription: 'Fixture verifyEmployeeLimit',
      billingPlanProvider: 'manual',
    })
    planId = plan.billingPlanId

    await BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: 65,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
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

    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Verify Limit BU ${stamp}`
    businessUnit.businessUnitSlug = `verify-limit-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Verify Limit Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    businessUnit.businessUnitOrigin = 'self_service'
    await businessUnit.save()
    businessUnitId = businessUnit.businessUnitId

    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 1,
    })

    const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const person = new Person()
    person.personFirstname = 'VerifyLimit'
    person.personLastname = 'Seed'
    person.personSecondLastname = 'One'
    person.personEmail = `verify-limit-${stamp}@gsti-tests.local`
    await person.save()
    personIds.push(person.personId)

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'VerifyLimit'
    employee.employeeLastName = 'Seed'
    employee.employeeCode = `VL-${stamp}`
    employee.employeePayrollNum = `VL-${stamp}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    await employee.save()
  })

  group.teardown(async () => {
    await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
    await Employee.query().where('business_unit_id', businessUnitId).delete()
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
    await BillingSubscription.query().where('billing_plan_id', planId).delete()
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }
  })

  test('con cupo lleno lanza EMP.QUOTA.EXCEEDED', async ({ assert }) => {
    const service = getService()
    try {
      await service.verifyEmployeeLimit(businessUnitId)
      assert.fail('debió lanzar EmployeeQuotaError')
    } catch (error) {
      assert.instanceOf(error, EmployeeQuotaError)
      assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED)
      assert.equal((error as EmployeeQuotaError).i18nData?.contracted, 1)
      assert.equal((error as EmployeeQuotaError).i18nData?.active, 1)
    }
  })

  test('BU6 (sin límite configurado para su setting) no se ve afectada por el límite de BU1', async ({
    assert,
  }) => {
    const service = getService()
    const result = await service.verifyEmployeeLimit(6)

    assert.equal(result.status, 200)
    assert.isNull(result.data.limit)
  })
})

test.group('getActiveBusinessUnitColor — de la unidad seleccionada, no de la lista global', () => {
  test('BU1 (sae) resuelve el color de su propio system_setting', async ({ assert }) => {
    const service = getService()
    const color = await TenantContext.run([1], () =>
      (service as any).getActiveBusinessUnitColor()
    )
    assert.equal(color, 'FF0A3057')
  })

  test('BU6 (cima) resuelve un color distinto al de BU1', async ({ assert }) => {
    const service = getService()
    const color = await TenantContext.run([6], () =>
      (service as any).getActiveBusinessUnitColor()
    )
    assert.equal(color, 'FF004E80')
  })

  test('sin unidad seleccionada, cae al color por defecto (nunca a la lista global)', async ({
    assert,
  }) => {
    const service = getService()
    const color = await (service as any).getActiveBusinessUnitColor()
    assert.equal(color, 'FFD6FFDC')
  })
})

test.group('mapEmployeeToBiometricFormat — payrollNum = unidad concreta del empleado', () => {
  test('empleado de BU1 se estampa con el slug de BU1 (sae), no con la lista global', async ({
    assert,
  }) => {
    const service = getService()
    const employee = await Employee.query()
      .where('employeeId', 678)
      .preload('businessUnit')
      .preload('person')
      .firstOrFail()

    const payload = (service as any).mapEmployeeToBiometricFormat(employee)
    assert.equal(payload.payrollNum, 'sae')
  })

  test('empleado de BU6 se estampa con el slug de BU6 (cima)', async ({ assert }) => {
    const service = getService()
    const employee = await Employee.query()
      .where('employeeId', 12)
      .preload('businessUnit')
      .preload('person')
      .firstOrFail()

    const payload = (service as any).mapEmployeeToBiometricFormat(employee)
    assert.equal(payload.payrollNum, 'cima')
  })

  test('el slug estampado sigue siendo detectable por inclusión (contrato del reverse-sync)', async ({
    assert,
  }) => {
    const bu1 = await BusinessUnit.findOrFail(1)
    const businessUnitsList = [bu1.businessUnitSlug]
    const payrollNum = 'sae'

    assert.isTrue(`${businessUnitsList}`.toLowerCase().includes(payrollNum.toLowerCase()))
  })
})

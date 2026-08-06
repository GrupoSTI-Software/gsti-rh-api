import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
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

const IMPORT_HEADERS = [
  'ID Empleado',
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
  'Apellido materno del empleado',
  'Fecha de contratación (yyyy/mm/dd)',
  'Departamento',
  'Posición',
  'Salario diario',
  'Fecha de nacimiento (dd/mm/yyyy)',
  'CURP',
  'RFC',
  'NSS',
  'Correo empresa',
  'Correo personal',
  'Teléfono Empresa',
  'Teléfono Personal',
  'Modalidad de trabajo',
  '% Teletrabajo',
  'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia',
  'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia',
  'Teléfono contacto emergencia',
] as const

type ImportRowInput = {
  employeeId?: number
  payrollNum: string
  businessUnitName: string
  firstName: string
  lastName: string
}

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

function buildImportRow(row: ImportRowInput): (string | number)[] {
  const values = new Array(IMPORT_HEADERS.length).fill('') as (string | number)[]
  values[0] = row.employeeId ?? ''
  values[1] = row.payrollNum
  values[2] = row.businessUnitName
  values[3] = row.businessUnitName
  values[4] = row.firstName
  values[5] = row.lastName
  return values
}

async function writeImportExcel(rows: ImportRowInput[]): Promise<{ tmpPath: string; dir: string }> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Empleados')
  worksheet.addRow([...IMPORT_HEADERS])
  for (const row of rows) {
    worksheet.addRow(buildImportRow(row))
  }

  const dir = await mkdtemp(join(tmpdir(), `employee-import-quota-${STAMP}-`))
  const tmpPath = join(dir, 'import.xlsx')
  await workbook.xlsx.writeFile(tmpPath)
  return { tmpPath, dir }
}

function asUploadFile(tmpPath: string) {
  return {
    tmpPath,
    clientName: 'import.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
  }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Employee Import Quota Plan ${stamp}`,
    billingPlanDescription: 'Fixture de importación con cupo',
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
  businessUnit.businessUnitName = `Employee Import Quota BU ${stamp}`
  businessUnit.businessUnitSlug = `employee-import-quota-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Employee Import Quota Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()
  return businessUnit
}

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de desarrollo no tiene empleados para usar de plantilla')
  }
  return template
}

async function createMinimalActiveEmployee(
  template: Employee,
  businessUnit: BusinessUnit,
  suffix: string,
  firstName = `Seed${suffix}`
): Promise<{ employee: Employee; person: Person }> {
  const person = new Person()
  person.personFirstname = firstName
  person.personLastname = 'ImportQuota'
  person.personSecondLastname = suffix
  person.personEmail = `import-quota-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()

  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.companyId = template.companyId
  employee.departmentId = template.departmentId
  employee.positionId = template.positionId
  employee.employeeTypeId = template.employeeTypeId
  employee.employeeFirstName = firstName
  employee.employeeLastName = 'ImportQuota'
  employee.employeeCode = `IMQ-SEED-${suffix}-${STAMP}`
  employee.employeePayrollNum = `IMQ-${suffix}`
  employee.employeeHireDate = DateTime.fromISO('2024-01-15')
  await employee.save()
  return { employee, person }
}

async function countActiveEmployees(businessUnitId: number): Promise<number> {
  const row = await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .whereNull('employee_deleted_at')
    .whereNull('employee_terminated_date')
    .count('* as total')
    .first()

  return Number((row as { total: string | number }).total)
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

test.group('EmployeeService.importFromExcel — cupo (USRH1785441818458)', (group) => {
  let planId: number

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('rechaza lote con altas que rebasan cupo — EMP.IMPORT.QUOTA_EXCEEDED y cero escrituras', async ({
    assert,
    cleanup,
  }) => {
    const stamp = Date.now()
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })

    const template = await getTemplateEmployee()
    const seededPersonIds: number[] = []
    let updateTarget: Employee | null = null

    for (let i = 0; i < 10; i++) {
      const seeded = await createMinimalActiveEmployee(
        template,
        businessUnit,
        `full-${i}`,
        `Original${i}`
      )
      seededPersonIds.push(seeded.person.personId)
      if (i === 0) {
        updateTarget = seeded.employee
      }
    }

    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, seededPersonIds)
    })

    const activeBefore = await countActiveEmployees(businessUnit.businessUnitId)
    assert.equal(activeBefore, 10)

    const { tmpPath, dir } = await writeImportExcel([
      {
        employeeId: updateTarget!.employeeId,
        payrollNum: updateTarget!.employeePayrollNum ?? 'IMQ-0',
        businessUnitName: businessUnit.businessUnitName,
        firstName: 'Actualizado',
        lastName: 'ImportQuota',
      },
      {
        payrollNum: `IMQ-NEW-${stamp}`,
        businessUnitName: businessUnit.businessUnitName,
        firstName: 'Nuevo',
        lastName: 'ImportQuota',
      },
    ])
    cleanup(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    const service = getService()

    try {
      await service.importFromExcel(asUploadFile(tmpPath), [businessUnit.businessUnitId])
      assert.fail('debió lanzar EmployeeQuotaError')
    } catch (error) {
      assert.instanceOf(error, EmployeeQuotaError)
      assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_EXCEEDED)
      assert.equal((error as EmployeeQuotaError).i18nData?.contracted, 10)
      assert.equal((error as EmployeeQuotaError).i18nData?.active, 10)
      assert.equal((error as EmployeeQuotaError).i18nData?.incoming, 1)
    }

    const activeAfter = await countActiveEmployees(businessUnit.businessUnitId)
    assert.equal(activeAfter, 10)

    await updateTarget!.refresh()
    assert.equal(updateTarget!.employeeFirstName, 'Original0')
  })

  test('rechaza import self_service sin plan — EMP.IMPORT.NO_PLAN', async ({ assert, cleanup }) => {
    const stamp = Date.now() + 1
    const businessUnit = await createSelfServiceBusinessUnit(stamp)

    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, [])
    })

    const { tmpPath, dir } = await writeImportExcel([
      {
        payrollNum: `IMQ-NOPLAN-${stamp}`,
        businessUnitName: businessUnit.businessUnitName,
        firstName: 'Nuevo',
        lastName: 'SinPlan',
      },
    ])
    cleanup(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    const service = getService()

    try {
      await service.importFromExcel(asUploadFile(tmpPath), [businessUnit.businessUnitId])
      assert.fail('debió lanzar EmployeeQuotaError')
    } catch (error) {
      assert.instanceOf(error, EmployeeQuotaError)
      assert.equal((error as EmployeeQuotaError).errorCode, EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_NO_PLAN)
      assert.equal((error as EmployeeQuotaError).i18nData?.incoming, 1)
    }

    assert.equal(await countActiveEmployees(businessUnit.businessUnitId), 0)
  })

  test('archivo solo correcciones no evalúa cupo aunque la empresa esté llena', async ({
    assert,
    cleanup,
  }) => {
    const stamp = Date.now() + 2
    const businessUnit = await createSelfServiceBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })

    const template = await getTemplateEmployee()
    const seededPersonIds: number[] = []
    let updateTarget: Employee | null = null

    for (let i = 0; i < 10; i++) {
      const seeded = await createMinimalActiveEmployee(
        template,
        businessUnit,
        `updates-${i}`,
        `Antes${i}`
      )
      seededPersonIds.push(seeded.person.personId)
      if (i === 0) {
        updateTarget = seeded.employee
      }
    }

    cleanup(async () => {
      await cleanupBusinessUnitWithPersons(businessUnit.businessUnitId, seededPersonIds)
    })

    const { tmpPath, dir } = await writeImportExcel([
      {
        employeeId: updateTarget!.employeeId,
        payrollNum: updateTarget!.employeePayrollNum ?? 'IMQ-updates-0',
        businessUnitName: businessUnit.businessUnitName,
        firstName: 'Despues',
        lastName: 'ImportQuota',
      },
    ])
    cleanup(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    const service = getService()
    const result = await service.importFromExcel(asUploadFile(tmpPath), [businessUnit.businessUnitId])

    assert.equal(result.summary.created, 0)
    assert.equal(result.summary.updated, 1)
    assert.isFalse(result.summary.limitReached)

    await updateTarget!.refresh()
    assert.equal(updateTarget!.employeeFirstName, 'Despues')
    assert.equal(await countActiveEmployees(businessUnit.businessUnitId), 10)
  })
})

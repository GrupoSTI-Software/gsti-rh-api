import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Employee from '#models/employee'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — POST /api/billing/subscription (USRH1785441822058).
 */

const TEST_PASSWORD = 'BillingContractSubTest123!'
const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function ensureRhManagerRole(): Promise<Role> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'rh-manager')
    .first()
  if (!role) {
    throw new Error('Se requiere el rol rh-manager en BD para probar scope limitado.')
  }
  return role
}

async function createScopedTenantActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await ensureRhManagerRole()

  const person = new Person()
  person.personFirstname = 'BillingContract'
  person.personLastname = 'Scoped'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Billing Contract Scoped ${stamp}`
  businessUnit.businessUnitSlug = `billing-contract-scoped-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Contract Scoped Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function ensureRootRole(): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').first()
  if (!role) {
    throw new Error('Se requiere el rol root en BD para probar re-contratación tenant.')
  }
  return role
}

async function createTenantActor(options: {
  emailPrefix: string
  origin: 'platform' | 'self_service'
}): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${options.emailPrefix}-${stamp}@gsti-tests.local`
  const role = await ensureRootRole()

  const person = new Person()
  person.personFirstname = 'BillingContract'
  person.personLastname = 'Sub'
  person.personSecondLastname = options.emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Billing Contract Sub ${stamp}`
  businessUnit.businessUnitSlug = `billing-contract-sub-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Contract Sub Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = options.origin
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Contract Sub Plan ${stamp}`,
    billingPlanDescription: 'Fixture de re-contratación tenant',
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

async function seedActiveEmployees(businessUnitId: number, count: number): Promise<void> {
  const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()

  for (let i = 0; i < count; i++) {
    const person = new Person()
    person.personFirstname = 'Contract'
    person.personLastname = 'Seed'
    person.personSecondLastname = `${i}`
    person.personEmail = `contract-seed-${businessUnitId}-${i}-${STAMP}@gsti-tests.local`
    await person.save()

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'Contract'
    employee.employeeLastName = `Emp${i}`
    employee.employeeCode = `CONTRACT-${businessUnitId}-${i}-${STAMP}`
    employee.employeePayrollNum = `CS-${businessUnitId}-${i}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    await employee.save()
  }
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

async function cleanupTenantActor(actor: TenantActor | null) {
  if (!actor) return
  await BillingSubscription.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await Employee.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

function contractPayload(planId: number, contractedEmployees: number) {
  return {
    billingPlanId: planId,
    contractedEmployees,
  }
}

test.group('POST /api/billing/subscription — autenticación y scope', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client.post('/api/billing/subscription').json({
      billingPlanId: 1,
      contractedEmployees: 10,
    })
    response.assertStatus(401)
  })

  test('responde 400 sin header X-Business-Unit-Id', async ({ client }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-no-header',
      origin: 'self_service',
    })

    try {
      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .json({ billingPlanId: 1, contractedEmployees: 10 })

      response.assertStatus(400)
      response.assertBodyContains({ key: 'BU.VAL.000' })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('responde 404 con empresa fuera de scope', async ({ client }) => {
    const actor = await createScopedTenantActor('contract-scope')
    const foreignUnit = new BusinessUnit()
    foreignUnit.businessUnitName = `Foreign Contract ${Date.now()}`
    foreignUnit.businessUnitSlug = `foreign-contract-${Date.now()}`
    foreignUnit.businessUnitLegalName = 'Foreign Contract Legal'
    foreignUnit.businessUnitActive = 1
    await foreignUnit.save()

    try {
      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', foreignUnit.businessUnitPublicId)
        .json({ billingPlanId: 1, contractedEmployees: 10 })

      response.assertStatus(404)
      response.assertBodyContains({ key: 'BU.NOT.001' })
    } finally {
      await BusinessUnit.query().where('business_unit_id', foreignUnit.businessUnitId).delete()
      await cleanupTenantActor(actor)
    }
  })
})

test.group('POST /api/billing/subscription — re-contratación self-service', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('self_service sin suscripción viva contrata en active sin periodo de prueba', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-success',
      origin: 'self_service',
    })
    const today = toBusinessDateString()

    try {
      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 10))

      response.assertStatus(201)
      const data = response.body().data
      assert.equal(data.billingSubscriptionStatus, 'active')
      assert.equal(data.billingSubscriptionContractedEmployees, 10)
      assert.equal(data.billingSubscriptionContractedTrialDays, 0)
      assert.isNull(data.billingSubscriptionTrialEndsAt)
      assert.equal(data.firstPaymentDate, today)

      const persisted = await BillingSubscription.query()
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .whereIn('billing_subscription_status', ['active'])
        .firstOrFail()

      assert.equal(toCalendarIsoDate(persisted.billingSubscriptionCurrentPeriodEnd), today)
      assert.notProperty(data, 'businessUnitId')
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('rechaza cantidad por debajo del mínimo por plantilla activa con data', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-below-min',
      origin: 'self_service',
    })

    try {
      await seedActiveEmployees(actor.businessUnit.businessUnitId, 47)

      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 40))

      response.assertStatus(422)
      assert.equal(
        response.body().code,
        BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT
      )
      assert.deepEqual(response.body().data, { active: 47, minimum: 50 })

      const live = await BillingSubscription.query()
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .whereIn('billing_subscription_status', ['trialing', 'active', 'past_due'])
        .first()
      assert.isNull(live)
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('acepta contratar exactamente el mínimo con 50 empleados activos', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-fifty-active',
      origin: 'self_service',
    })

    try {
      await seedActiveEmployees(actor.businessUnit.businessUnitId, 50)

      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 50))

      response.assertStatus(201)
      assert.equal(response.body().data.billingSubscriptionContractedEmployees, 50)
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('rechaza empresa platform con ORIGIN_NOT_SELF_SERVICE', async ({ client, assert }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-platform',
      origin: 'platform',
    })

    try {
      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 10))

      response.assertStatus(422)
      assert.equal(
        response.body().code,
        BILLING_SUBSCRIPTION_ERROR_CODES.ORIGIN_NOT_SELF_SERVICE
      )
      assert.notProperty(response.body(), 'data')
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('rechaza cuando ya hay una suscripción viva', async ({ client, assert }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-already-live',
      origin: 'self_service',
    })
    const subscriptionService = new BillingSubscriptionService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: actor.businessUnit.businessUnitPublicId,
        billingPlanId: planId!,
        contractedEmployees: 20,
      })

      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 20))

      response.assertStatus(409)
      assert.equal(response.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE)
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('permite re-contratar tras cancelar la suscripción anterior', async ({ client, assert }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-after-cancel',
      origin: 'self_service',
    })
    const subscriptionService = new BillingSubscriptionService()

    try {
      const previous = await subscriptionService.createSubscription({
        businessUnitPublicId: actor.businessUnit.businessUnitPublicId,
        billingPlanId: planId!,
        contractedEmployees: 20,
      })
      await subscriptionService.cancel(previous.billingSubscriptionId)

      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json(contractPayload(planId!, 10))

      response.assertStatus(201)
      assert.equal(response.body().data.billingSubscriptionStatus, 'active')

      const subscriptions = await BillingSubscription.query()
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .orderBy('billing_subscription_id', 'asc')

      assert.lengthOf(subscriptions, 2)
      assert.equal(subscriptions[0].billingSubscriptionStatus, 'canceled')
      assert.isNull(subscriptions[0].billingSubscriptionLiveBusinessUnitId)
      assert.equal(subscriptions[1].billingSubscriptionStatus, 'active')
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('rechaza body sin contractedEmployees con VAL_INPUT', async ({ client, assert }) => {
    const actor = await createTenantActor({
      emailPrefix: 'contract-no-employees',
      origin: 'self_service',
    })

    try {
      const response = await client
        .post('/api/billing/subscription')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .json({ billingPlanId: planId! })

      response.assertStatus(422)
      assert.equal(response.body().code, BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT)
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

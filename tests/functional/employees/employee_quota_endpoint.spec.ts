import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'

/**
 * Tests funcionales — GET /api/employees/quota (USRH1785441819658).
 */

const TEST_PASSWORD = 'EmployeeQuotaEndpoint123!'

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
  person.personFirstname = 'EmployeeQuota'
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
  businessUnit.businessUnitName = `Employee Quota Scoped ${stamp}`
  businessUnit.businessUnitSlug = `employee-quota-scoped-${stamp}`
  businessUnit.businessUnitLegalName = `Employee Quota Scoped Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createTenantActor(options: {
  emailPrefix: string
  origin: 'platform' | 'self_service'
}): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${options.emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').first()
  if (!role) {
    throw new Error('Se requiere el rol root en BD para los tests de /api/employees/quota.')
  }

  const person = new Person()
  person.personFirstname = 'EmployeeQuota'
  person.personLastname = 'Test'
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
  businessUnit.businessUnitName = `Employee Quota ${stamp}`
  businessUnit.businessUnitSlug = `employee-quota-${stamp}`
  businessUnit.businessUnitLegalName = `Employee Quota Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = options.origin
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Employee Quota Endpoint Plan ${stamp}`,
    billingPlanDescription: 'Fixture de GET /api/employees/quota',
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

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingSubscription.query().where('billing_plan_id', planId).delete()
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
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

test.group('GET /api/employees/quota — autenticación y scope', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client.get('/api/employees/quota')
    response.assertStatus(401)
  })

  test('responde 400 sin header X-Business-Unit-Id', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'quota-no-header', origin: 'platform' })

    try {
      const response = await client.get('/api/employees/quota').loginAs(actor.user)
      response.assertStatus(400)
      response.assertBodyContains({ key: 'BU.VAL.000' })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('responde 404 con empresa fuera de scope', async ({ client }) => {
    const actor = await createScopedTenantActor('quota-scope')
    const foreignUnit = new BusinessUnit()
    foreignUnit.businessUnitName = `Foreign Quota ${Date.now()}`
    foreignUnit.businessUnitSlug = `foreign-quota-${Date.now()}`
    foreignUnit.businessUnitLegalName = 'Foreign Quota Legal'
    foreignUnit.businessUnitActive = 1
    await foreignUnit.save()

    try {
      const response = await client
        .get('/api/employees/quota')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', foreignUnit.businessUnitPublicId)

      response.assertStatus(404)
      response.assertBodyContains({ key: 'BU.NOT.001' })
    } finally {
      await BusinessUnit.query().where('business_unit_id', foreignUnit.businessUnitId).delete()
      await cleanupTenantActor(actor)
    }
  })
})

test.group('GET /api/employees/quota — contrato de datos', (group) => {
  let platformActor: TenantActor | null = null
  let selfServiceNoPlanActor: TenantActor | null = null
  let selfServiceWithPlanActor: TenantActor | null = null
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
    platformActor = await createTenantActor({ emailPrefix: 'quota-platform', origin: 'platform' })
    selfServiceNoPlanActor = await createTenantActor({
      emailPrefix: 'quota-no-plan',
      origin: 'self_service',
    })
    selfServiceWithPlanActor = await createTenantActor({
      emailPrefix: 'quota-with-plan',
      origin: 'self_service',
    })

    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: selfServiceWithPlanActor.businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 20,
    })
  })

  group.teardown(async () => {
    await cleanupTenantActor(selfServiceWithPlanActor)
    await cleanupTenantActor(selfServiceNoPlanActor)
    await cleanupTenantActor(platformActor)
    await cleanupPlan(planId)
  })

  test('empresa platform sin tope devuelve limit null y hasPlan true', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/quota')
      .loginAs(platformActor!.user)
      .header('X-Business-Unit-Id', platformActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(body.data.limit, null)
    assert.equal(body.data.remaining, null)
    assert.equal(body.data.hasPlan, true)
    assert.isNumber(body.data.active)
  })

  test('self_service sin plan vigente devuelve limit 0 y hasPlan false', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/quota')
      .loginAs(selfServiceNoPlanActor!.user)
      .header('X-Business-Unit-Id', selfServiceNoPlanActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.data.limit, 0)
    assert.equal(body.data.remaining, 0)
    assert.equal(body.data.hasPlan, false)
  })

  test('self_service con contratación viva devuelve cupo y remaining', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/quota')
      .loginAs(selfServiceWithPlanActor!.user)
      .header('X-Business-Unit-Id', selfServiceWithPlanActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.data.limit, 20)
    assert.equal(body.data.active, 0)
    assert.equal(body.data.remaining, 20)
    assert.equal(body.data.hasPlan, true)
  })
})

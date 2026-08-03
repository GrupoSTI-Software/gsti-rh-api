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
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — GET /api/billing/subscription/me (USRH1785441817226).
 *
 * Cubre CA-6 y CA-7. El origen `self_service` se siembra directamente porque
 * la escritura en signup es responsabilidad de USRH1785441820858.
 */

const TEST_PASSWORD = 'BillingSubMeTest123!'

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
  person.personFirstname = 'BillingSubMe'
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
  businessUnit.businessUnitName = `Billing Sub Me Scoped ${stamp}`
  businessUnit.businessUnitSlug = `billing-sub-me-scoped-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Sub Me Scoped Legal ${stamp}`
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
    throw new Error('Se requiere el rol root en BD para los tests de billing/subscription/me.')
  }

  const person = new Person()
  person.personFirstname = 'BillingSubMe'
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
  businessUnit.businessUnitName = `Billing Sub Me ${stamp}`
  businessUnit.businessUnitSlug = `billing-sub-me-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Sub Me Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = options.origin
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Sub Me Plan ${stamp}`,
    billingPlanDescription: 'Fixture de suscripción viva',
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

async function cleanupSubscription(subscriptionId: number | null) {
  if (!subscriptionId) return
  await BillingSubscription.query().where('billing_subscription_id', subscriptionId).delete()
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
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

test.group('GET /api/billing/subscription/me — autenticación y scope (CA-7)', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client.get('/api/billing/subscription/me')
    response.assertStatus(401)
  })

  test('responde 400 sin header X-Business-Unit-Id', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'sub-me-no-header', origin: 'platform' })

    try {
      const response = await client.get('/api/billing/subscription/me').loginAs(actor.user)
      response.assertStatus(400)
      response.assertBodyContains({ key: 'BU.VAL.000' })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('responde 404 con empresa fuera de scope', async ({ client }) => {
    const actor = await createScopedTenantActor('sub-me-scope')
    const foreignUnit = new BusinessUnit()
    foreignUnit.businessUnitName = `Foreign ${Date.now()}`
    foreignUnit.businessUnitSlug = `foreign-${Date.now()}`
    foreignUnit.businessUnitLegalName = 'Foreign Legal'
    foreignUnit.businessUnitActive = 1
    await foreignUnit.save()

    try {
      const response = await client
        .get('/api/billing/subscription/me')
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

test.group('GET /api/billing/subscription/me — contrato de datos (CA-6)', (group) => {
  let selfServiceActor: TenantActor | null = null
  let platformActor: TenantActor | null = null
  let canceledActor: TenantActor | null = null
  let planId: number | null = null
  let liveSubscriptionId: number | null = null
  let canceledSubscriptionId: number | null = null

  group.setup(async () => {
    const stamp = Date.now()
    planId = await createPublishedPlan(stamp)

    selfServiceActor = await createTenantActor({
      emailPrefix: 'sub-me-live',
      origin: 'self_service',
    })

    const subscriptionService = new BillingSubscriptionService()
    const liveSubscription = await subscriptionService.createSubscription({
      businessUnitPublicId: selfServiceActor.businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 30,
    })
    liveSubscriptionId = liveSubscription.billingSubscriptionId

    platformActor = await createTenantActor({
      emailPrefix: 'sub-me-null',
      origin: 'platform',
    })

    canceledActor = await createTenantActor({
      emailPrefix: 'sub-me-canceled',
      origin: 'platform',
    })

    const canceledSubscription = await subscriptionService.createSubscription({
      businessUnitPublicId: canceledActor.businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 20,
    })
    canceledSubscriptionId = canceledSubscription.billingSubscriptionId
    canceledSubscription.billingSubscriptionStatus = 'canceled'
    canceledSubscription.billingSubscriptionLiveBusinessUnitId = null
    canceledSubscription.billingSubscriptionCanceledAt = DateTime.utc()
    await canceledSubscription.save()
  })

  group.teardown(async () => {
    await cleanupSubscription(liveSubscriptionId)
    await cleanupSubscription(canceledSubscriptionId)
    await cleanupPlan(planId)
    await cleanupTenantActor(selfServiceActor)
    await cleanupTenantActor(platformActor)
    await cleanupTenantActor(canceledActor)
  })

  test('devuelve origen y suscripción viva para empresa self_service', async ({ client, assert }) => {
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(selfServiceActor!.user)
      .header('X-Business-Unit-Id', selfServiceActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const data = response.body().data

    assert.equal(data.businessUnitOrigin, 'self_service')
    assert.isObject(data.subscription)
    assert.equal(data.subscription.billingSubscriptionContractedEmployees, 30)
    assert.property(data.subscription, 'billingPlanName')
    assert.property(data.subscription, 'firstPaymentDate')
    assert.notProperty(data.subscription, 'businessUnitId')
  })

  test('devuelve subscription null para empresa platform sin contratación viva', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(platformActor!.user)
      .header('X-Business-Unit-Id', platformActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.businessUnitOrigin, 'platform')
    assert.isNull(response.body().data.subscription)
  })

  test('trata suscripción cancelada como ausencia de contratación viva', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(canceledActor!.user)
      .header('X-Business-Unit-Id', canceledActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.businessUnitOrigin, 'platform')
    assert.isNull(response.body().data.subscription)
  })

  test('firstPaymentDate coincide con trialEndsAt en suscripción viva', async ({ client, assert }) => {
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(selfServiceActor!.user)
      .header('X-Business-Unit-Id', selfServiceActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const subscription = response.body().data.subscription
    const trialEndsAt = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    assert.equal(subscription.firstPaymentDate, trialEndsAt)
  })
})

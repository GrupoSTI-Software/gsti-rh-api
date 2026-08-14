import { test } from '@japa/runner'
import { DateTime } from 'luxon'
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
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — GET /api/billing/subscription/me (USRH1785441817226,
 * USRH1786107870865, USRH1786107870871).
 *
 * Cubre CA-5, CA-6 y CA-7. El origen `self_service` se siembra directamente porque
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

async function ensureEmployeeRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'empleado').first()
  if (!role) {
    throw new Error('Se requiere el rol empleado en BD para los tests de billing/subscription/me.')
  }
  return role
}

async function createTenantActor(options: {
  emailPrefix: string
  origin: 'platform' | 'self_service'
  roleSlug?: 'root' | 'empleado'
}): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${options.emailPrefix}-${stamp}@gsti-tests.local`
  const roleSlug = options.roleSlug ?? 'root'
  const role =
    roleSlug === 'empleado'
      ? await ensureEmployeeRole()
      : await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').first()
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

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
  await subscription.save()

  return subscription
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
  await BillingSubscriptionChange.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
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
    assert.property(data.subscription, 'billingSubscriptionCurrentPeriodStart')
    assert.property(data.subscription, 'billingSubscriptionCurrentPeriodEnd')
    assert.isString(data.subscription.billingSubscriptionCurrentPeriodStart)
    assert.isString(data.subscription.billingSubscriptionCurrentPeriodEnd)
    assert.property(data.subscription, 'liveChange')
    assert.isNull(data.subscription.liveChange)
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

  test('expone el periodo vigente alineado con la suscripción persistida (USRH1786107870865)', async ({
    client,
    assert,
  }) => {
    const persisted = await BillingSubscription.findOrFail(liveSubscriptionId!)
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(selfServiceActor!.user)
      .header('X-Business-Unit-Id', selfServiceActor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const subscription = response.body().data.subscription
    assert.equal(
      subscription.billingSubscriptionCurrentPeriodStart,
      toCalendarIsoDate(persisted.billingSubscriptionCurrentPeriodStart)
    )
    assert.equal(
      subscription.billingSubscriptionCurrentPeriodEnd,
      toCalendarIsoDate(persisted.billingSubscriptionCurrentPeriodEnd)
    )
    assert.equal(
      subscription.billingSubscriptionCurrentPeriodEnd,
      toCalendarIsoDate(persisted.billingSubscriptionTrialEndsAt)
    )
  })
})

test.group(
  'GET /api/billing/subscription/me — regresión muro (CA-5, USRH1786107870865)',
  () => {
    test('un usuario empleado recibe 200 sin gate de rol', async ({ client, assert }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-employee',
        origin: 'self_service',
        roleSlug: 'empleado',
      })

      try {
        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.equal(response.body().data.businessUnitOrigin, 'self_service')
        assert.isNull(response.body().data.subscription)
        assert.equal(response.body().data.minimumContractedEmployees, 10)
      } finally {
        await cleanupTenantActor(actor)
      }
    })
  }
)

test.group(
  'GET /api/billing/subscription/me — minimumContractedEmployees (USRH1785441822058)',
  () => {
    test('devuelve el mínimo para self_service sin suscripción viva', async ({
      client,
      assert,
    }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-minimum',
        origin: 'self_service',
      })

      try {
        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        const data = response.body().data
        assert.equal(data.businessUnitOrigin, 'self_service')
        assert.isNull(data.subscription)
        assert.equal(data.minimumContractedEmployees, 10)
      } finally {
        await cleanupTenantActor(actor)
      }
    })

    test('devuelve el mínimo también con suscripción viva self_service (USRH1786107870865)', async ({
      client,
      assert,
    }) => {
      const stamp = Date.now()
      const planId = await createPublishedPlan(stamp)
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-min-live',
        origin: 'self_service',
      })

      const subscriptionService = new BillingSubscriptionService()
      let subscriptionId: number | null = null

      try {
        const live = await subscriptionService.createSubscription({
          businessUnitPublicId: actor.businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 20,
        })
        subscriptionId = live.billingSubscriptionId

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.isObject(response.body().data.subscription)
        assert.equal(response.body().data.minimumContractedEmployees, 10)
      } finally {
        await cleanupSubscription(subscriptionId)
        await cleanupPlan(planId)
        await cleanupTenantActor(actor)
      }
    })

    test('devuelve null para empresa platform sin suscripción viva', async ({ client, assert }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-min-platform',
        origin: 'platform',
      })

      try {
        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.equal(response.body().data.businessUnitOrigin, 'platform')
        assert.isNull(response.body().data.subscription)
        assert.isNull(response.body().data.minimumContractedEmployees)
      } finally {
        await cleanupTenantActor(actor)
      }
    })
  }
)

test.group(
  'GET /api/billing/subscription/me — liveChange (USRH1786107870871)',
  (group) => {
    let planId: number | null = null

    group.setup(async () => {
      planId = await createPublishedPlan(Date.now())
    })

    group.teardown(async () => {
      await cleanupPlan(planId)
    })

    test('devuelve liveChange null cuando no hay movimiento en curso', async ({ client, assert }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-no-live-change',
        origin: 'self_service',
      })

      try {
        await createLiveSubscription(actor.businessUnit, planId!, 100)

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.isObject(response.body().data.subscription)
        assert.isNull(response.body().data.subscription.liveChange)
        assert.equal(response.body().data.subscription.billingSubscriptionContractedEmployees, 100)
      } finally {
        await cleanupTenantActor(actor)
      }
    })

    test('expone aumento pending_payment con prorrateo y sin effectiveAt', async ({
      client,
      assert,
    }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-live-increase',
        origin: 'self_service',
      })

      try {
        await createLiveSubscription(actor.businessUnit, planId!, 100)

        const increase = await client
          .post('/api/billing/subscription/changes/increase')
          .json({ employees: 150 })
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        increase.assertStatus(201)
        const change = await BillingSubscriptionChange.findOrFail(
          increase.body().data.billingSubscriptionChangeId
        )

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        const subscription = response.body().data.subscription
        assert.equal(subscription.billingSubscriptionContractedEmployees, 100)
        assert.isObject(subscription.liveChange)
        assert.equal(
          subscription.liveChange.billingSubscriptionChangeId,
          change.billingSubscriptionChangeId
        )
        assert.equal(subscription.liveChange.type, 'increase')
        assert.equal(subscription.liveChange.status, 'pending_payment')
        assert.equal(subscription.liveChange.previousEmployees, 100)
        assert.equal(subscription.liveChange.newEmployees, 150)
        assert.equal(
          subscription.liveChange.newAmounts.total,
          Number(change.billingSubscriptionChangeTotal)
        )
        assert.isObject(subscription.liveChange.proration)
        assert.equal(
          subscription.liveChange.proration.amountCents,
          change.billingSubscriptionChangeProratedAmountCents
        )
        assert.equal(
          subscription.liveChange.proration.amountPesos,
          change.billingSubscriptionChangeProratedAmountCents / 100
        )
        assert.isNull(subscription.liveChange.effectiveAt)
        assert.isString(subscription.liveChange.requestedAt)
      } finally {
        await cleanupTenantActor(actor)
      }
    })

    test('expone reducción scheduled con effectiveAt y sin proration', async ({
      client,
      assert,
    }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-live-decrease',
        origin: 'self_service',
      })

      try {
        const subscription = await createLiveSubscription(actor.businessUnit, planId!, 120)
        const expectedEffectiveAt = toCalendarIsoDate(
          subscription.billingSubscriptionCurrentPeriodEnd
        )

        const decrease = await client
          .post('/api/billing/subscription/changes/decrease')
          .json({ employees: 80 })
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        decrease.assertStatus(201)
        const change = await BillingSubscriptionChange.findOrFail(
          decrease.body().data.billingSubscriptionChangeId
        )

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        const body = response.body().data.subscription
        assert.equal(body.billingSubscriptionContractedEmployees, 120)
        assert.isObject(body.liveChange)
        assert.equal(body.liveChange.type, 'decrease')
        assert.equal(body.liveChange.status, 'scheduled')
        assert.equal(body.liveChange.previousEmployees, 120)
        assert.equal(body.liveChange.newEmployees, 80)
        assert.equal(body.liveChange.effectiveAt, expectedEffectiveAt)
        assert.isNull(body.liveChange.proration)
        assert.equal(body.liveChange.newAmounts.total, Number(change.billingSubscriptionChangeTotal))
      } finally {
        await cleanupTenantActor(actor)
      }
    })

    test('no expone cambios en estado terminal', async ({ client, assert }) => {
      const actor = await createTenantActor({
        emailPrefix: 'sub-me-terminal-change',
        origin: 'self_service',
      })

      try {
        await createLiveSubscription(actor.businessUnit, planId!, 100)

        const increase = await client
          .post('/api/billing/subscription/changes/increase')
          .json({ employees: 150 })
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        increase.assertStatus(201)
        const change = await BillingSubscriptionChange.findOrFail(
          increase.body().data.billingSubscriptionChangeId
        )
        change.billingSubscriptionChangeStatus = 'canceled'
        await change.save()

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.isNull(response.body().data.subscription.liveChange)
      } finally {
        await cleanupTenantActor(actor)
      }
    })

    test('un usuario empleado recibe liveChange en 200 sin gate de rol', async ({
      client,
      assert,
    }) => {
      const ownerActor = await createTenantActor({
        emailPrefix: 'sub-me-live-owner',
        origin: 'self_service',
      })
      const employeeRole = await ensureEmployeeRole()
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
      const employeeEmail = `sub-me-live-employee-${stamp}@gsti-tests.local`

      const employeePerson = new Person()
      employeePerson.personFirstname = 'BillingSubMe'
      employeePerson.personLastname = 'Employee'
      employeePerson.personSecondLastname = 'LiveChange'
      employeePerson.personEmail = employeeEmail
      await employeePerson.save()

      const employeeUser = new User()
      employeeUser.userEmail = employeeEmail
      employeeUser.userPassword = TEST_PASSWORD
      employeeUser.userActive = 1
      employeeUser.roleId = employeeRole.roleId
      employeeUser.personId = employeePerson.personId
      employeeUser.userEmailType = 'institutional'
      await employeeUser.save()
      await employeeUser
        .related('businessUnits')
        .attach([ownerActor.businessUnit.businessUnitId])

      try {
        await createLiveSubscription(ownerActor.businessUnit, planId!, 100)

        const increase = await client
          .post('/api/billing/subscription/changes/increase')
          .json({ employees: 150 })
          .loginAs(ownerActor.user)
          .header('X-Business-Unit-Id', ownerActor.businessUnit.businessUnitPublicId)

        increase.assertStatus(201)

        const response = await client
          .get('/api/billing/subscription/me')
          .loginAs(employeeUser)
          .header('X-Business-Unit-Id', ownerActor.businessUnit.businessUnitPublicId)

        response.assertStatus(200)
        assert.isObject(response.body().data.subscription.liveChange)
        assert.equal(response.body().data.subscription.liveChange.type, 'increase')
        assert.equal(response.body().data.subscription.liveChange.status, 'pending_payment')
      } finally {
        await BusinessUnitUser.query().where('user_id', employeeUser.userId).delete()
        await User.query().where('user_id', employeeUser.userId).delete()
        await Person.query().where('person_id', employeePerson.personId).delete()
        await cleanupTenantActor(ownerActor)
      }
    })
  }
)

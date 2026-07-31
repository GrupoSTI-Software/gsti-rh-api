import { test } from '@japa/runner'
import SignupDraft from '#models/signup_draft'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Role from '#models/role'
import SystemSetting from '#models/system_setting'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * Test funcional — flujo completo de signup self-service (USRH1783712837561 +
 * USRH1785441820858: contratación dentro de complete).
 *
 * Un solo test cubre las 3 llamadas (start, verify-otp, complete) para respetar
 * el rate limit de 5 req/min por IP configurado en `auth_signup_routes.ts`.
 */

test.group('Signup self-service (start → verify-otp → complete) — rol owner', (group) => {
  let createdBusinessUnitId: number | null = null
  let createdUserId: number | null = null
  let createdPersonId: number | null = null
  let signupEmail: string
  let publishedPlanId: number | null = null

  group.setup(async () => {
    signupEmail = `owner-signup-${Date.now()}@gsti-tests.local`

    const catalog = new BillingCatalogService()
    const stamp = Date.now()
    const plan = await catalog.createPlan({
      billingPlanName: `Signup Complete Plan ${stamp}`,
      billingPlanDescription: 'Fixture de registro con contratación',
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
    publishedPlanId = plan.billingPlanId
  })

  group.teardown(async () => {
    if (createdBusinessUnitId !== null) {
      await BillingSubscription.query()
        .where('business_unit_id', createdBusinessUnitId)
        .delete()
    }
    if (createdUserId !== null) {
      await BusinessUnitUser.query().where('user_id', createdUserId).delete()
      await User.query().where('user_id', createdUserId).delete()
    }
    if (createdPersonId !== null) {
      await Person.query().where('person_id', createdPersonId).delete()
    }
    if (createdBusinessUnitId !== null) {
      await SystemSetting.query()
        .withTrashed()
        .where('business_unit_id', createdBusinessUnitId)
        .delete()
      await BusinessUnit.query().where('business_unit_id', createdBusinessUnitId).delete()
    }
    await SignupDraft.query().where('signup_draft_email', signupEmail).delete()

    if (publishedPlanId !== null) {
      await BillingVolumeTier.query().where('billing_plan_id', publishedPlanId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', publishedPlanId).delete()
      const plan = await BillingPlan.find(publishedPlanId)
      if (plan) {
        await plan.delete()
      }
    }
  })

  test('el usuario nace con rol owner y recibe su par de tokens', async ({ client, assert }) => {
    const startResponse = await client.post('/api/auth/signup/start').json({
      firstName: 'Owner',
      lastName: 'SelfService',
      businessUnitName: `Owner Signup BU ${Date.now()}`,
      email: signupEmail,
      billingPlanId: publishedPlanId,
      contractedEmployees: 30,
    })

    startResponse.assertStatus(200)
    const signupDraftId = startResponse.body().data?.signupDraftId
    assert.exists(signupDraftId, 'start debe retornar signupDraftId')

    const draft = await SignupDraft.query().where('signup_draft_id', signupDraftId).firstOrFail()
    assert.equal(draft.signupDraftBillingPlanId, publishedPlanId)
    assert.equal(draft.signupDraftContractedEmployees, 30)
    assert.exists(draft.signupDraftPinCode, 'El draft debe tener un pinCode generado')

    const verifyResponse = await client.post('/api/auth/signup/verify-otp').json({
      signupDraftId,
      pinCode: draft.signupDraftPinCode,
    })

    verifyResponse.assertStatus(200)
    const signupToken = verifyResponse.body().data?.signupToken
    assert.exists(signupToken, 'verify-otp debe retornar signupToken')

    const password = 'OwnerSignupTest123!'
    const completeResponse = await client.post('/api/auth/signup/complete').json({
      signupDraftId,
      signupToken,
      password,
      passwordConfirm: password,
    })

    completeResponse.assertStatus(200)
    const body = completeResponse.body()
    assert.equal(body.type, 'success')
    assert.exists(body.data?.token, 'complete debe emitir un access token')
    assert.exists(body.data?.refreshToken, 'complete debe emitir un refresh token')

    const newUserId = Number(body.data.user.userId)
    createdUserId = newUserId
    createdPersonId = Number(body.data.user.personId)

    const persistedUser = await User.query().where('user_id', newUserId).firstOrFail()
    const role = await Role.query().where('role_id', persistedUser.roleId).firstOrFail()

    const attachedBusinessUnits = await persistedUser
      .related('businessUnits')
      .query()
      .select('business_units.business_unit_id')
    assert.lengthOf(attachedBusinessUnits, 1, 'El usuario debe quedar asociado a su propia empresa')
    createdBusinessUnitId = attachedBusinessUnits[0].businessUnitId

    assert.equal(role.roleSlug, 'owner', 'El usuario creado por self-service debe nacer con rol owner')
    assert.notEqual(persistedUser.roleId, 1, 'No debe quedar con el roleId interno hardcodeado (1)')

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', createdBusinessUnitId)
      .firstOrFail()
    assert.equal(businessUnit.businessUnitOrigin, 'self_service')

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', createdBusinessUnitId)
      .first()
    assert.isNotNull(subscription)
    assert.equal(subscription!.billingSubscriptionStatus, 'trialing')
    assert.equal(subscription!.billingSubscriptionContractedEmployees, 30)

    const draftAfterComplete = await SignupDraft.query()
      .where('signup_draft_id', signupDraftId)
      .first()
    assert.isNull(draftAfterComplete, 'El draft debe eliminarse tras completar el registro')
  })
})

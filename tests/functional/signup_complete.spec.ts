import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
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
import SelfServiceSubscriptionCreatedMail from '#mails/self_service_subscription_created_mail'
import Tolerance from '#models/tolerance'
import RoleSystemPermission from '#models/role_system_permission'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole } from '#tests/helpers/ensure_role'

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
  let mailFake: ReturnType<typeof mail.fake> | null = null

  group.setup(async () => {
    // El alta self-service asigna owner por slug y 0006 ya no lo siembra.
    await ensureRole('owner')
    mailFake = mail.fake()
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
    await TenantContext.runUnscoped(async () => {
      if (createdBusinessUnitId !== null) {
        await BillingSubscription.query()
          .where('business_unit_id', createdBusinessUnitId)
          .delete()

        const tenantSettings = await SystemSetting.query()
          .withTrashed()
          .where('business_unit_id', createdBusinessUnitId)
        if (tenantSettings.length > 0) {
          await Tolerance.query()
            .whereIn(
              'system_setting_id',
              tenantSettings.map((setting) => setting.systemSettingId)
            )
            .delete()
        }
        await SystemSetting.query()
          .withTrashed()
          .where('business_unit_id', createdBusinessUnitId)
          .delete()

        if (createdUserId !== null) {
          await BusinessUnitUser.query().where('user_id', createdUserId).delete()
          await User.query().where('user_id', createdUserId).delete()
        }

        const tenantRoles = await Role.query()
          .withTrashed()
          .where('business_unit_id', createdBusinessUnitId)
        if (tenantRoles.length > 0) {
          await RoleSystemPermission.query()
            .whereIn(
              'role_id',
              tenantRoles.map((role) => role.roleId)
            )
            .delete()
          await Role.query()
            .withTrashed()
            .where('business_unit_id', createdBusinessUnitId)
            .delete()
        }

        await Person.query().where('business_unit_id', createdBusinessUnitId).delete()
        await BusinessUnit.query().where('business_unit_id', createdBusinessUnitId).delete()
      } else if (createdPersonId !== null) {
        await Person.query().where('person_id', createdPersonId).delete()
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
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)

    mail.restore()
    mailFake = null
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
    const newPersonId = Number(body.data.user.personId)
    createdUserId = newUserId
    createdPersonId = newPersonId

    const persistedUser = await User.query().where('user_id', newUserId).firstOrFail()
    const role = await Role.query().where('role_id', persistedUser.roleId).firstOrFail()

    const attachedBusinessUnits = await persistedUser
      .related('businessUnits')
      .query()
      .select('business_units.business_unit_id')
    assert.lengthOf(attachedBusinessUnits, 1, 'El usuario debe quedar asociado a su propia empresa')
    const businessUnitId = attachedBusinessUnits[0].businessUnitId
    createdBusinessUnitId = businessUnitId

    assert.equal(role.roleSlug, 'owner', 'El usuario creado por self-service debe nacer con rol owner')
    assert.notEqual(persistedUser.roleId, 1, 'No debe quedar con el roleId interno hardcodeado (1)')

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .firstOrFail()
    assert.equal(businessUnit.businessUnitOrigin, 'self_service')

    // USRH1789698261609 (CA-4): el dueño de la cuenta nueva nace marcado con su
    // empresa. Sin esto quedaría invisible dentro de la cuenta que acaba de crear.
    const ownerPerson = await TenantContext.run([businessUnitId], () =>
      Person.query().where('person_id', newPersonId).firstOrFail()
    )
    assert.equal(
      ownerPerson.businessUnitId,
      createdBusinessUnitId,
      'el expediente del dueño debe quedar marcado con la empresa recién creada'
    )

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .first()
    assert.isNotNull(subscription)
    assert.equal(subscription!.billingSubscriptionStatus, 'trialing')
    assert.equal(subscription!.billingSubscriptionContractedEmployees, 30)

    const draftAfterComplete = await SignupDraft.query()
      .where('signup_draft_id', signupDraftId)
      .first()
    assert.isNull(draftAfterComplete, 'El draft debe eliminarse tras completar el registro')

    mailFake!.mails.assertSent(SelfServiceSubscriptionCreatedMail, ({ message }) => {
      message.assertHtmlIncludes(businessUnit.businessUnitName)
      message.assertHtmlIncludes('Nueva contratación')
      return true
    })
  })
})

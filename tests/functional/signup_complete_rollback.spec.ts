import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import SignupDraft from '#models/signup_draft'
import User from '#models/user'
import Person from '#models/person'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingCatalogService from '#services/billing_catalog_service'
import SignupDraftService from '#services/signup_draft_service'

/**
 * Errores tipados y rollback en `complete()`. Los casos que no prueban el
 * contrato HTTP de `start`/`verify-otp` evitan esas rutas: el limitador
 * `signup` (5 req/min por IP) aplica a las tres (`auth_signup_routes.ts`).
 */

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Signup Rollback Plan ${stamp}`,
    billingPlanDescription: 'Fixture de rollback en complete',
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

async function cleanupPlan(planId: number) {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('SignupDraftService.complete() — rollback y errores tipados (CA-5, CA-6, CA-7, CA-8)', () => {
  test('rechaza borrador sin plan con PLT.SUB.PLAN_NOT_SELECTED', async ({ assert }) => {
    const email = `signup-no-plan-${Date.now()}@gsti-tests.local`
    const signupToken = randomUUID()
    const service = new SignupDraftService(getI18nStub())

    const draft = await SignupDraft.create({
      signupDraftEmail: email,
      signupDraftFirstName: 'NoPlan',
      signupDraftLastName: 'Draft',
      signupDraftBusinessUnitName: 'No Plan BU',
      signupDraftBillingPlanId: null,
      signupDraftContractedEmployees: null,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: signupToken,
    })

    try {
      const result = await service.complete({
        signupDraftId: draft.signupDraftId,
        signupToken,
        password: 'NoPlanDraftTest123!',
        passwordConfirm: 'NoPlanDraftTest123!',
      })

      assert.equal(result.status, 422)
      assert.equal(result.code, 'PLT.SUB.PLAN_NOT_SELECTED')
      assert.equal(result.key, 'plan-no-seleccionado')
      assert.isNull(await User.query().where('user_email', email).first())
    } finally {
      await SignupDraft.query().where('signup_draft_id', draft.signupDraftId).delete()
    }
  })

  test('rechaza cantidad inválida en complete con PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN', async ({
    assert,
  }) => {
    const email = `signup-invalid-qty-${Date.now()}@gsti-tests.local`
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const signupToken = randomUUID()
    const service = new SignupDraftService(getI18nStub())

    const draft = await SignupDraft.create({
      signupDraftEmail: email,
      signupDraftFirstName: 'Invalid',
      signupDraftLastName: 'Qty',
      signupDraftBusinessUnitName: 'Invalid Qty BU',
      signupDraftBillingPlanId: planId,
      signupDraftContractedEmployees: 25,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: signupToken,
    })

    try {
      const result = await service.complete({
        signupDraftId: draft.signupDraftId,
        signupToken,
        password: 'InvalidQtyTest123!',
        passwordConfirm: 'InvalidQtyTest123!',
      })

      assert.equal(result.status, 422)
      assert.equal(result.code, 'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN')
      assert.isNull(await User.query().where('user_email', email).first())
    } finally {
      await SignupDraft.query().where('signup_draft_id', draft.signupDraftId).delete()
      await cleanupPlan(planId)
    }
  })

  test('revierte todo si el plan dejó de estar a la venta y conserva el borrador', async ({
    assert,
  }) => {
    const email = `signup-rollback-plan-${Date.now()}@gsti-tests.local`
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const signupToken = randomUUID()
    const service = new SignupDraftService(getI18nStub())

    const draft = await SignupDraft.create({
      signupDraftEmail: email,
      signupDraftFirstName: 'Rollback',
      signupDraftLastName: 'Plan',
      signupDraftBusinessUnitName: `Rollback BU ${stamp}`,
      signupDraftBillingPlanId: planId,
      signupDraftContractedEmployees: 30,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: signupToken,
    })

    try {
      const plan = await BillingPlan.findOrFail(planId)
      plan.billingPlanActive = 0
      await plan.save()

      const password = 'RollbackPlanTest123!'
      const result = await service.complete({
        signupDraftId: draft.signupDraftId,
        signupToken,
        password,
        passwordConfirm: password,
      })

      assert.equal(result.status, 422)
      assert.equal(result.code, 'PLT.SUB.PLAN_NOT_PUBLISHED')
      assert.equal(result.key, 'plan-no-publicado')
      assert.notEqual(result.errorCode, 'SIGNUP.SYS_UNHANDLED')

      assert.isNull(await User.query().where('user_email', email).first())
      assert.isNull(await Person.query().where('person_email', email).first())

      const survivingDraft = await SignupDraft.query()
        .where('signup_draft_id', draft.signupDraftId)
        .first()
      assert.isNotNull(survivingDraft)
      assert.equal(survivingDraft!.signupDraftToken, signupToken)
    } finally {
      await SignupDraft.query().where('signup_draft_email', email).delete()
      await cleanupPlan(planId)
    }
  })

  test('actualiza plan y cantidad al reintentar start con el mismo correo', async ({ assert }) => {
    const email = `signup-upsert-${Date.now()}@gsti-tests.local`
    const stamp = Date.now()
    const firstPlanId = await createPublishedPlan(stamp)
    const secondPlanId = await createPublishedPlan(stamp + 1)
    const service = new SignupDraftService(getI18nStub())

    try {
      const first = await service.start({
        firstName: 'Upsert',
        lastName: 'Branch',
        businessUnitName: `Upsert BU ${stamp}`,
        email,
        billingPlanId: firstPlanId,
        contractedEmployees: 20,
      })
      assert.equal(first.status, 200)
      const signupDraftId = first.data?.signupDraftId as number

      const second = await service.start({
        firstName: 'Upsert',
        lastName: 'Branch',
        businessUnitName: `Upsert BU ${stamp}`,
        email,
        billingPlanId: secondPlanId,
        contractedEmployees: 40,
      })
      assert.equal(second.status, 200)

      const draft = await SignupDraft.query().where('signup_draft_id', signupDraftId).firstOrFail()
      assert.equal(draft.signupDraftBillingPlanId, secondPlanId)
      assert.equal(draft.signupDraftContractedEmployees, 40)
      assert.isNull(draft.signupDraftEmailVerifiedAt, 'Un nuevo start debe invalidar la verificación previa')
      assert.isNull(draft.signupDraftToken)
    } finally {
      await SignupDraft.query().where('signup_draft_email', email).delete()
      await cleanupPlan(firstPlanId)
      await cleanupPlan(secondPlanId)
    }
  })
})

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import SignupDraft from '#models/signup_draft'
import Person from '#models/person'
import User from '#models/user'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import SignupDraftService from '#services/signup_draft_service'
import SystemSettingService from '#services/system_setting_service'
import BillingCatalogService from '#services/billing_catalog_service'
import { SignupServiceError } from '#exceptions/signup_service_error'
import { SIGNUP_ERROR_CODES } from '#constants/signup_error_codes'

/**
 * Tests de `SignupDraftService.complete()` — creación transaccional del
 * `system_settings` del tenant al completar el registro (USRH1783712837572).
 *
 * Se invoca el servicio directamente (no vía HTTP) por dos razones:
 *  1. `/api/auth/signup/*` tiene un rate-limit de 5 req/min por IP
 *     (`start/routes/auth_signup_routes.ts`) compartido entre `start`,
 *     `verify-otp` y `complete`; probar por HTTP haría al suite frágil/lento.
 *  2. Lo que estos ACs verifican es el comportamiento transaccional del
 *     servicio (rollback, idempotencia), no el contrato HTTP en sí — ya
 *     cubierto por los bloques `@swagger` del controller.
 *
 * Convenciones: sin transacción de test, identificadores únicos por
 * timestamp, cleanup explícito en `group.teardown`.
 */

const PASSWORD = 'PivotSettings123!'

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Signup Settings Plan ${stamp}`,
    billingPlanDescription: 'Fixture de complete() con system_settings',
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

async function createVerifiedDraft(
  stamp: number,
  billingPlanId: number
): Promise<{ draft: SignupDraft; token: string }> {
  const token = randomUUID()
  const draft = await SignupDraft.create({
    signupDraftEmail: `signup-settings-${stamp}@gsti-tests.local`,
    signupDraftFirstName: 'Settings',
    signupDraftLastName: 'Test',
    signupDraftSecondLastName: 'Tenant',
    signupDraftBusinessUnitName: `Signup Settings Tenant ${stamp}`,
    signupDraftBillingPlanId: billingPlanId,
    signupDraftContractedEmployees: 30,
    signupDraftPinCode: '123456',
    signupDraftPinExpiresAt: DateTime.now().plus({ minutes: 10 }),
    signupDraftEmailVerifiedAt: DateTime.now(),
    signupDraftToken: token,
  })
  return { draft, token }
}

async function cleanupTenant(businessUnitName: string, email: string) {
  const businessUnit = await BusinessUnit.query().where('business_unit_name', businessUnitName).first()
  if (businessUnit) {
    await BillingSubscription.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .delete()
    await SystemSetting.query()
      .withTrashed()
      .where('business_unit_id', businessUnit.businessUnitId)
      .delete()
  }
  const user = await User.query().where('user_email', email).first()
  if (user) {
    await BusinessUnitUser.query().where('user_id', user.userId).delete()
    await User.query().where('user_id', user.userId).delete()
  }
  const person = await Person.query().where('person_email', email).first()
  if (person) {
    await Person.query().where('person_id', person.personId).delete()
  }
  if (businessUnit) {
    await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
  }
  await SignupDraft.query().withTrashed().where('signup_draft_email', email).delete()
}

test.group('SignupDraftService.complete() - creación de system_settings del tenant', (group) => {
  let stamp: number
  let draft: SignupDraft
  let token: string
  let businessUnitName: string
  let email: string
  let publishedPlanId: number | null = null

  group.each.setup(async () => {
    stamp = Date.now() + Math.floor(Math.random() * 1000)
    publishedPlanId = await createPublishedPlan(stamp)
  })

  group.each.teardown(async () => {
    if (businessUnitName && email) {
      await cleanupTenant(businessUnitName, email)
    }
    if (publishedPlanId !== null) {
      await BillingVolumeTier.query().where('billing_plan_id', publishedPlanId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', publishedPlanId).delete()
      const plan = await BillingPlan.find(publishedPlanId)
      if (plan) {
        await plan.delete()
      }
    }
  })

  test('alta feliz: crea 1 fila de system_settings ligada por business_unit_id, con los defaults de la empresa', async ({
    assert,
  }) => {
    ;({ draft, token } = await createVerifiedDraft(stamp, publishedPlanId!))
    businessUnitName = draft.signupDraftBusinessUnitName
    email = draft.signupDraftEmail

    const service = new SignupDraftService(getI18nStub())
    const result = await service.complete({
      signupDraftId: draft.signupDraftId,
      signupToken: token,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    })

    assert.equal(result.type, 'success', JSON.stringify(result))
    assert.equal(result.status, 200)

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_name', businessUnitName)
      .firstOrFail()

    const settingsRows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(settingsRows, 1, 'Debe crearse exactamente una fila de system_settings para el tenant nuevo')

    const settings = settingsRows[0]
    // Identidad propia de la empresa, no la del registro base (GrupoSTI)
    assert.equal(settings.systemSettingTradeName, businessUnit.businessUnitName)
    assert.isNull(settings.systemSettingLogo)
    assert.isNull(settings.systemSettingBanner)
    assert.isNull(settings.systemSettingFavicon)
    assert.isNull(settings.systemSettingEmployeeAplicationIcon)
    assert.equal(settings.systemSettingSidebarColor, 'FFFFFF')
    assert.equal(settings.systemSettingActive, 1)
    assert.equal(settings.systemSettingToleranceCountPerAbsence, 3)
    assert.equal(settings.systemSettingRestrictFutureVacation, 1)
    assert.equal(settings.systemSettingBirthdayEmails, 0)
    assert.equal(settings.systemSettingAnniversaryEmails, 0)
    assert.equal(settings.systemSettingAttendanceFaultHrEmails, 0)
    assert.isNull(settings.systemSettingMaxAbsencesBeforeAttendanceLock)
    assert.isNull(settings.systemSettingMaxLateArrivalsBeforeAttendanceLock)
    assert.equal(settings.systemSettingPeriodAbsencesBeforeAttendanceLock, 'monthly')
    assert.equal(settings.systemSettingPeriodLateArrivalsBeforeAttendanceLock, 'monthly')
    assert.equal(Number(settings.systemSettingMonthlyConversionFactor), 30.42)
    assert.equal(settings.systemSettingBusinessUnits, businessUnit.businessUnitSlug)
    assert.notEqual(settings.businessUnitId, null)
  })

  test('reintento idempotente: no duplica la configuración del mismo tenant', async ({ assert }) => {
    ;({ draft, token } = await createVerifiedDraft(stamp, publishedPlanId!))
    businessUnitName = draft.signupDraftBusinessUnitName
    email = draft.signupDraftEmail

    const systemSettingService = new SystemSettingService()
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = businessUnitName
    businessUnit.businessUnitSlug = `signup-settings-retry-${stamp}`
    businessUnit.businessUnitLegalName = businessUnitName
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    await db.transaction(async (trx) => {
      await systemSettingService.createForTenant(
        {
          businessUnitId: businessUnit.businessUnitId,
          businessUnitSlug: businessUnit.businessUnitSlug,
          businessUnitName: businessUnit.businessUnitName,
        },
        trx
      )
    })
    await db.transaction(async (trx) => {
      await systemSettingService.createForTenant(
        {
          businessUnitId: businessUnit.businessUnitId,
          businessUnitSlug: businessUnit.businessUnitSlug,
          businessUnitName: businessUnit.businessUnitName,
        },
        trx
      )
    })

    const rows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Reintentar la provisión para el mismo tenant no debe duplicar la fila')
  })

  test('rollback: si falla la provisión de settings, no quedan Person/BusinessUnit/User huérfanos', async ({
    assert,
  }) => {
    ;({ draft, token } = await createVerifiedDraft(stamp, publishedPlanId!))
    businessUnitName = draft.signupDraftBusinessUnitName
    email = draft.signupDraftEmail

    const originalCreateForTenant = SystemSettingService.prototype.createForTenant
    SystemSettingService.prototype.createForTenant = async () => {
      throw new SignupServiceError(
        'Fallo forzado de provisión de system_settings (test de rollback)',
        SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED,
        500,
        'signup-settings-provisioning-failed',
        'No fue posible crear la configuración base de la empresa nueva'
      )
    }

    try {
      const service = new SignupDraftService(getI18nStub())
      const result = await service.complete({
        signupDraftId: draft.signupDraftId,
        signupToken: token,
        password: PASSWORD,
        passwordConfirm: PASSWORD,
      })

      assert.equal(result.type, 'error')
      assert.equal(result.status, 500)
      assert.equal(result.key, 'signup-settings-provisioning-failed')
      assert.equal(result.errorCode, SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED)

      const orphanPerson = await Person.query().where('person_email', email).first()
      assert.isNull(orphanPerson, 'No debe quedar un Person huérfano tras el rollback')

      const orphanUser = await User.query().where('user_email', email).first()
      assert.isNull(orphanUser, 'No debe quedar un User huérfano tras el rollback')

      const orphanBusinessUnit = await BusinessUnit.query()
        .where('business_unit_name', businessUnitName)
        .first()
      assert.isNull(orphanBusinessUnit, 'No debe quedar un BusinessUnit huérfano tras el rollback')

      const stillPendingDraft = await SignupDraft.query()
        .where('signup_draft_id', draft.signupDraftId)
        .first()
      assert.exists(
        stillPendingDraft,
        'El borrador no debe eliminarse si el alta completa se revierte (permite reintentar)'
      )
    } finally {
      SystemSettingService.prototype.createForTenant = originalCreateForTenant
    }
  })
})

import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import SignupDraft from '#models/signup_draft'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import User from '#models/user'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BranchOffice from '#models/branch_office'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import SignupDraftService from '#services/signup_draft_service'
import BranchOfficeProvisioningService from '#services/branch_office_provisioning_service'
import BillingCatalogService from '#services/billing_catalog_service'
import AdditionalBusinessUnitService from '#services/additional_business_unit_service'
import { DEFAULT_BRANCH_OFFICE_NAME } from '#constants/branch_office'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Sucursal default del tenant — siembra en el alta y unicidad en la base.
 *
 * La invariante que sostiene todo el módulo es "toda empresa tiene exactamente
 * una sucursal default viva", y vive en el motor: columna generada VIRTUAL
 * `branch_office_default_bu` + UNIQUE. Estos tests prueban el efecto
 * observable del alta y el candado de la base, no la implementación.
 *
 * Se invoca `SignupDraftService.complete()` directo y no por HTTP por el
 * rate-limit de `/api/auth/signup/*`, mismo criterio que
 * `signup_system_settings.spec.ts`.
 */

const PASSWORD = 'BranchDefault123!'

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Branch Default Plan ${stamp}`,
    billingPlanDescription: 'Fixture de siembra de sucursal default',
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
    signupDraftEmail: `branch-default-${stamp}@gsti-tests.local`,
    signupDraftFirstName: 'Branch',
    signupDraftLastName: 'Default',
    signupDraftSecondLastName: 'Tenant',
    signupDraftBusinessUnitName: `Branch Default Tenant ${stamp}`,
    signupDraftBillingPlanId: billingPlanId,
    signupDraftContractedEmployees: 30,
    signupDraftPinCode: '123456',
    signupDraftPinExpiresAt: DateTime.now().plus({ minutes: 10 }),
    signupDraftEmailVerifiedAt: DateTime.now(),
    signupDraftToken: token,
  })
  return { draft, token }
}

async function createBareBusinessUnit(stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Branch Default Bare ${stamp}`
  businessUnit.businessUnitSlug = `branch-default-bare-${stamp}`
  businessUnit.businessUnitLegalName = businessUnit.businessUnitName
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function purgeBranchOffices(businessUnitId: number) {
  await db.from('branch_offices').where('business_unit_id', businessUnitId).delete()
}

async function cleanupTenant(businessUnitName: string, email: string) {
  const businessUnit = await BusinessUnit.query()
    .where('business_unit_name', businessUnitName)
    .first()
  if (businessUnit) {
    await purgeBranchOffices(businessUnit.businessUnitId)
    await BillingSubscription.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .delete()
    const tenantSettings = await SystemSetting.query()
      .withTrashed()
      .where('business_unit_id', businessUnit.businessUnitId)
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
    const tenantRoles = await Role.query()
      .withTrashed()
      .where('business_unit_id', businessUnit.businessUnitId)
    if (tenantRoles.length > 0) {
      await RoleSystemPermission.query()
        .whereIn(
          'role_id',
          tenantRoles.map((role) => role.roleId)
        )
        .delete()
      await Role.query()
        .withTrashed()
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
  }
  await SignupDraft.query().withTrashed().where('signup_draft_email', email).delete()
}

test.group('Sucursal default del tenant — siembra en el alta', (group) => {
  let stamp: number
  let draft: SignupDraft
  let token: string
  let businessUnitName: string
  let email: string
  let publishedPlanId: number | null = null

  group.each.setup(async () => {
    await ensureRole('owner')
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

  test('el alta del tenant siembra "Oficina principal" marcada como sucursal default', async ({
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

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_name', businessUnitName)
      .firstOrFail()

    const branches = await BranchOffice.query().where('business_unit_id', businessUnit.businessUnitId)

    assert.lengthOf(branches, 1, 'el tenant nuevo nace con exactamente una sucursal')
    assert.equal(branches[0].branchOfficeName, DEFAULT_BRANCH_OFFICE_NAME)
    assert.equal(branches[0].branchOfficeIsDefault, 1, 'la sucursal sembrada es la default')
    assert.isNull(
      branches[0].branchOfficeLocationAddress,
      'la geocerca nace vacía: no es un dato que el alta pueda conocer'
    )
  })
})

test.group('Sucursal default del tenant — alta de empresa adicional', (group) => {
  let planId = 0
  let ownerUser: User
  let ownerPerson: Person
  let createdBuId: number | null = null
  let mailFake: ReturnType<typeof mail.fake> | null = null

  group.setup(async () => {
    mailFake = mail.fake()
    await ensureRole('owner')
    const stamp = Date.now() + Math.floor(Math.random() * 1000)
    planId = await createPublishedPlan(stamp)
    const ownerRole = await ensureRole('owner')

    ownerPerson = new Person()
    ownerPerson.personFirstname = 'Branch'
    ownerPerson.personLastname = 'Adicional'
    ownerPerson.personSecondLastname = String(stamp)
    ownerPerson.personEmail = `branch-default-add-${stamp}@gsti-tests.local`
    await ownerPerson.save()

    ownerUser = new User()
    ownerUser.userEmail = ownerPerson.personEmail
    ownerUser.userPassword = PASSWORD
    ownerUser.userActive = 1
    ownerUser.roleId = ownerRole.roleId
    ownerUser.personId = ownerPerson.personId
    ownerUser.userEmailType = 'personal'
    await ownerUser.save()
  })

  group.teardown(async () => {
    if (mailFake) mail.restore()
    if (createdBuId !== null) {
      await purgeBranchOffices(createdBuId)
      await BillingSubscription.query().where('business_unit_id', createdBuId).delete()
      await SystemSetting.query().where('business_unit_id', createdBuId).delete()
      await BusinessUnitUser.query().where('business_unit_id', createdBuId).delete()
      const tenantRoles = await Role.query().withTrashed().where('business_unit_id', createdBuId)
      if (tenantRoles.length > 0) {
        await RoleSystemPermission.query()
          .whereIn(
            'role_id',
            tenantRoles.map((role) => role.roleId)
          )
          .delete()
        await Role.query().withTrashed().where('business_unit_id', createdBuId).delete()
      }
      await BusinessUnit.query().where('business_unit_id', createdBuId).delete()
    }
    await BusinessUnitUser.query().where('user_id', ownerUser.userId).delete()
    await User.query().where('user_id', ownerUser.userId).delete()
    await Person.query().where('person_id', ownerPerson.personId).delete()
    await BillingSubscription.query().where('billing_plan_id', planId).delete()
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }
  })

  test('la empresa adicional también nace con su sucursal default', async ({ assert }) => {
    const service = new AdditionalBusinessUnitService()
    const result = await service.createAdditionalBusinessUnit({
      businessUnitName: `Branch Default Adicional ${Date.now()}`,
      billingPlanId: planId,
      contractedEmployees: 10,
      user: ownerUser,
    })

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_public_id', result.businessUnit.businessUnitPublicId)
      .firstOrFail()
    createdBuId = businessUnit.businessUnitId

    const branches = await BranchOffice.query().where('business_unit_id', createdBuId)

    assert.lengthOf(branches, 1, 'la empresa adicional nace con exactamente una sucursal')
    assert.equal(branches[0].branchOfficeName, DEFAULT_BRANCH_OFFICE_NAME)
    assert.equal(branches[0].branchOfficeIsDefault, 1)
  })
})

test.group('Sucursal default del tenant — ensureDefault y unicidad', (group) => {
  let stamp: number
  let businessUnit: BusinessUnit

  group.each.setup(async () => {
    stamp = Date.now() + Math.floor(Math.random() * 1000)
    businessUnit = await createBareBusinessUnit(stamp)
  })

  group.each.teardown(async () => {
    await purgeBranchOffices(businessUnit.businessUnitId)
    await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
  })

  test('ensureDefault crea la sucursal default cuando la empresa no la tiene', async ({
    assert,
  }) => {
    const created = await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)

    assert.equal(created.branchOfficeName, DEFAULT_BRANCH_OFFICE_NAME)
    assert.equal(created.branchOfficeIsDefault, 1)
    assert.equal(created.businessUnitId, businessUnit.businessUnitId)
  })

  test('ensureDefault es idempotente: la segunda invocación devuelve la misma sucursal', async ({
    assert,
  }) => {
    const first = await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)
    const second = await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)

    assert.equal(second.branchOfficeId, first.branchOfficeId)

    const rows = await BranchOffice.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'reintentar la provisión no duplica la sucursal')
  })

  test('ensureDefault adopta como default la sucursal que ya existía sola, sin crear otra', async ({
    assert,
  }) => {
    const existing = await BranchOffice.create({
      businessUnitId: businessUnit.businessUnitId,
      branchOfficeName: 'Matriz Monterrey',
      branchOfficeSlug: `matriz-monterrey-${stamp}`,
      branchOfficeLocationAddress: null,
      branchOfficeIdealTemplateCount: null,
      branchOfficeMinActiveEmployeesPerShift: null,
      empresaContratanteId: null,
    })

    const resolved = await BranchOfficeProvisioningService.ensureDefault(
      businessUnit.businessUnitId
    )

    assert.equal(
      resolved.branchOfficeId,
      existing.branchOfficeId,
      'una empresa con una sola sucursal la promueve en vez de estrenar "Oficina principal"'
    )
    assert.equal(resolved.branchOfficeIsDefault, 1)

    const rows = await BranchOffice.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1)
  })

  test('la base rechaza una segunda sucursal default viva en la misma empresa', async ({
    assert,
  }) => {
    await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)

    let dbError: { code?: string } | null = null
    try {
      await db.table('branch_offices').insert({
        business_unit_id: businessUnit.businessUnitId,
        branch_office_name: 'Segunda default ilegal',
        branch_office_slug: `segunda-default-${stamp}`,
        branch_office_is_default: 1,
        branch_office_created_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        branch_office_updated_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
      })
    } catch (error) {
      dbError = error as { code?: string }
    }

    assert.exists(dbError, 'la segunda default viva debe reventar contra el UNIQUE')
    assert.equal(
      dbError?.code,
      'ER_DUP_ENTRY',
      'el rechazo lo hace el motor, no el código de aplicación'
    )
  })

  test('una sucursal default borrada libera el lugar para la siguiente', async ({ assert }) => {
    const first = await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)
    await first.delete()

    const second = await BranchOfficeProvisioningService.ensureDefault(businessUnit.businessUnitId)

    assert.notEqual(
      second.branchOfficeId,
      first.branchOfficeId,
      'la borrada no ocupa el slot: el UNIQUE vive sobre la columna generada, que es NULL en borradas'
    )
    assert.equal(second.branchOfficeIsDefault, 1)
  })
})

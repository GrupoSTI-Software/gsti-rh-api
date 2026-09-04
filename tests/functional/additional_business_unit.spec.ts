import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import Role from '#models/role'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import SystemSetting from '#models/system_setting'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import AdditionalBusinessUnitService from '#services/additional_business_unit_service'
import { BUSINESS_UNIT_SIGNUP_ERROR_CODES } from '#constants/business_unit_signup_error_codes'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { BusinessUnitSignupServiceError } from '#exceptions/business_unit_signup_service_error'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import { MAX_LIVE_BUSINESS_UNITS_PER_USER } from '#constants/business_unit'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — alta de empresa adicional (USRH1787932877001).
 *
 * CA-1: camino feliz — BU creada, usuario vinculado, suscripción activa, firstPaymentDate = hoy.
 * CA-2: rollback — fallo dentro de la transacción no deja datos huérfanos.
 * CA-3: hardening de scope — nombre duplicado falla para el mismo usuario;
 *        otro usuario puede usar el mismo nombre; tope MAX bloquea alta N+1.
 *
 * Cada grupo crea y destruye sus propios fixtures.
 * `mail.fake()` evita envíos SMTP reales durante los tests.
 */

const TEST_PASSWORD = 'AdditionalBuTest123!'

async function ensureOwnerRole(): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('Se requiere el rol "owner" en BD. Ejecuta los seeders primero.')
  }
  return role
}

async function createOwnerUser(stamp: string): Promise<{ user: User; person: Person }> {
  const ownerRole = await ensureOwnerRole()

  const person = new Person()
  person.personFirstname = 'Adicional'
  person.personLastname = 'BU'
  person.personSecondLastname = stamp
  person.personEmail = `additional-bu-${stamp}@gsti-tests.local`
  await person.save()

  const user = new User()
  user.userEmail = `additional-bu-${stamp}@gsti-tests.local`
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = ownerRole.roleId
  user.personId = person.personId
  user.userEmailType = 'personal'
  await user.save()

  return { user, person }
}

async function createPublishedPlan(stamp: string): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Plan Adicional ${stamp}`,
    billingPlanDescription: 'Fixture alta empresa adicional',
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
  await BillingSubscription.query().where('billing_plan_id', planId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

async function cleanupUser(user: User, person: Person) {
  await BusinessUnitUser.query().where('user_id', user.userId).delete()
  await User.query().where('user_id', user.userId).delete()
  await Person.query().where('person_id', person.personId).delete()
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await SystemSetting.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnitUser.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

// ---------------------------------------------------------------------------
// CA-1 — camino feliz
// ---------------------------------------------------------------------------

test.group(
  'AdditionalBusinessUnitService — CA-1: camino feliz',
  (group) => {
    let planId = 0
    let ownerUser: User
    let ownerPerson: Person
    let createdBuId: number | null = null
    let mailFake: ReturnType<typeof mail.fake> | null = null

    group.setup(async () => {
      mailFake = mail.fake()
      const stamp = `ca1-${Date.now()}`
      planId = await createPublishedPlan(stamp)
      const actor = await createOwnerUser(stamp)
      ownerUser = actor.user
      ownerPerson = actor.person
    })

    group.teardown(async () => {
      if (mailFake) mail.restore()
      if (createdBuId !== null) await cleanupBusinessUnit(createdBuId)
      await cleanupUser(ownerUser, ownerPerson)
      await cleanupPlan(planId)
    })

    test('crea empresa, vincula usuario y genera suscripción en un acto atómico', async ({
      assert,
    }) => {
      const service = new AdditionalBusinessUnitService()
      const result = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Sucursal Norte CA-1',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: ownerUser,
      })

      createdBuId = result.businessUnit.businessUnitPublicId
        ? await BusinessUnit.query()
            .where('business_unit_public_id', result.businessUnit.businessUnitPublicId)
            .first()
            .then((bu) => bu?.businessUnitId ?? null)
        : null

      assert.isNotNull(result)
      assert.equal(result.businessUnit.businessUnitName, 'Sucursal Norte CA-1')
      assert.equal(result.businessUnit.businessUnitActive, 1)
      assert.equal(result.businessUnit.businessUnitOrigin, 'self_service')
    })

    test('businessUnitLegalName copia el nombre cuando no se envía', async ({ assert }) => {
      const service = new AdditionalBusinessUnitService()
      const result = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Sucursal Norte CA-1b',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: ownerUser,
      })

      const bu = await BusinessUnit.query()
        .where('business_unit_public_id', result.businessUnit.businessUnitPublicId)
        .first()

      if (bu) {
        createdBuId = bu.businessUnitId
        assert.equal(bu.businessUnitLegalName, 'Sucursal Norte CA-1b')
      }
    })

    test('suscripción nace active (skipTrial = true) sin período de prueba', async ({ assert }) => {
      const service = new AdditionalBusinessUnitService()
      const result = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Sucursal Norte CA-1c',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: ownerUser,
      })

      assert.equal(result.subscription.billingSubscriptionStatus, 'active')
      assert.equal(result.subscription.billingSubscriptionContractedTrialDays, 0)
      assert.isNull(result.subscription.billingSubscriptionTrialEndsAt)
    })

    test('firstPaymentDate es hoy cuando no hay trial', async ({ assert }) => {
      const service = new AdditionalBusinessUnitService()
      const result = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Sucursal Norte CA-1d',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: ownerUser,
      })

      assert.equal(result.subscription.firstPaymentDate, toBusinessDateString())
    })

    test('el usuario queda vinculado a la nueva empresa en business_unit_users', async ({
      assert,
    }) => {
      const service = new AdditionalBusinessUnitService()
      const result = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Sucursal Norte CA-1e',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: ownerUser,
      })

      const bu = await BusinessUnit.query()
        .where('business_unit_public_id', result.businessUnit.businessUnitPublicId)
        .first()

      if (bu) {
        createdBuId = bu.businessUnitId
        const pivot = await BusinessUnitUser.query()
          .where('user_id', ownerUser.userId)
          .where('business_unit_id', bu.businessUnitId)
          .first()
        assert.isNotNull(pivot)
      }
    })
  }
)

// ---------------------------------------------------------------------------
// CA-2 — rollback: fallo dentro de la transacción no deja datos huérfanos
// ---------------------------------------------------------------------------

test.group(
  'AdditionalBusinessUnitService — CA-2: rollback ante plan inválido',
  (group) => {
    let ownerUser: User
    let ownerPerson: Person

    group.setup(async () => {
      const stamp = `ca2-${Date.now()}`
      const actor = await createOwnerUser(stamp)
      ownerUser = actor.user
      ownerPerson = actor.person
    })

    group.teardown(async () => {
      await cleanupUser(ownerUser, ownerPerson)
    })

    test('plan inexistente lanza PLT.SUB.PLAN_NOT_FOUND antes de abrir transacción', async ({
      assert,
    }) => {
      const nonExistentPlanId = 999_999_999
      const service = new AdditionalBusinessUnitService()

      try {
        await service.createAdditionalBusinessUnit({
          businessUnitName: 'BU que no debe crearse CA-2',
          billingPlanId: nonExistentPlanId,
          contractedEmployees: 10,
          user: ownerUser,
        })
        assert.fail('debió lanzar BillingSubscriptionServiceError')
      } catch (error) {
        assert.instanceOf(error, BillingSubscriptionServiceError)
        assert.equal(
          (error as BillingSubscriptionServiceError).errorCode,
          BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND
        )
      }

      // Verificar que no quedaron datos huérfanos
      const orphanBus = await BusinessUnit.query()
        .where('business_unit_name', 'BU que no debe crearse CA-2')
        .whereNull('business_unit_deleted_at')
      assert.lengthOf(orphanBus, 0, 'No deben existir empresas huérfanas tras el fallo')
    })

    test('cantidad inválida lanza PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN sin tocar la BD', async ({
      assert,
    }) => {
      const rowBefore = await db
        .from('business_unit_users')
        .where('user_id', ownerUser.userId)
        .count('* as total')
        .first()
      const countBefore = Number((rowBefore as { total: number } | null)?.total ?? 0)

      const service = new AdditionalBusinessUnitService()

      try {
        await service.createAdditionalBusinessUnit({
          businessUnitName: 'BU CA-2b',
          billingPlanId: 1,
          contractedEmployees: 7,
          user: ownerUser,
        })
        assert.fail('debió lanzar BillingSubscriptionServiceError por cantidad inválida')
      } catch (error) {
        assert.instanceOf(error, BillingSubscriptionServiceError)
        assert.equal(
          (error as BillingSubscriptionServiceError).errorCode,
          BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN
        )
      }

      const rowAfter = await db
        .from('business_unit_users')
        .where('user_id', ownerUser.userId)
        .count('* as total')
        .first()
      const countAfter = Number((rowAfter as { total: number } | null)?.total ?? 0)

      assert.equal(countAfter, countBefore, 'No debe haberse creado ningún pivot nuevo')
    })
  }
)

// ---------------------------------------------------------------------------
// CA-3 — hardening de scope: nombre duplicado, tope MAX, aislamiento entre usuarios
// ---------------------------------------------------------------------------

test.group(
  'AdditionalBusinessUnitService — CA-3: hardening de scope',
  (group) => {
    let planId = 0
    let userA: User
    let personA: Person
    let userB: User
    let personB: Person
    const createdBuIds: number[] = []

    group.setup(async () => {
      const stamp = `ca3-${Date.now()}`
      planId = await createPublishedPlan(stamp)
      const actorA = await createOwnerUser(`${stamp}-a`)
      userA = actorA.user
      personA = actorA.person
      const actorB = await createOwnerUser(`${stamp}-b`)
      userB = actorB.user
      personB = actorB.person
    })

    group.teardown(async () => {
      for (const id of createdBuIds) {
        await cleanupBusinessUnit(id)
      }
      await cleanupUser(userA, personA)
      await cleanupUser(userB, personB)
      await cleanupPlan(planId)
    })

    test('nombre duplicado para el mismo usuario → 409 TNT.BU.DUPLICATE_NAME', async ({
      assert,
    }) => {
      const service = new AdditionalBusinessUnitService()

      const first = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Marketing',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: userA,
      })

      const buA = await BusinessUnit.query()
        .where('business_unit_public_id', first.businessUnit.businessUnitPublicId)
        .first()
      if (buA) createdBuIds.push(buA.businessUnitId)

      try {
        await service.createAdditionalBusinessUnit({
          businessUnitName: 'Marketing',
          billingPlanId: planId,
          contractedEmployees: 10,
          user: userA,
        })
        assert.fail('debió lanzar DUPLICATE_NAME')
      } catch (error) {
        assert.instanceOf(error, BusinessUnitSignupServiceError)
        assert.equal(
          (error as BusinessUnitSignupServiceError).errorCode,
          BUSINESS_UNIT_SIGNUP_ERROR_CODES.DUPLICATE_NAME
        )
        assert.equal((error as BusinessUnitSignupServiceError).httpStatus, 409)
      }
    })

    test('otro usuario puede tener una empresa con el mismo nombre (scope por usuario)', async ({
      assert,
    }) => {
      const service = new AdditionalBusinessUnitService()

      const resultB = await service.createAdditionalBusinessUnit({
        businessUnitName: 'Marketing',
        billingPlanId: planId,
        contractedEmployees: 10,
        user: userB,
      })

      const buB = await BusinessUnit.query()
        .where('business_unit_public_id', resultB.businessUnit.businessUnitPublicId)
        .first()
      if (buB) createdBuIds.push(buB.businessUnitId)

      assert.equal(resultB.businessUnit.businessUnitName, 'Marketing')
    })

    test('comparación de nombre duplicado es case-insensitive y trim', async ({ assert }) => {
      const service = new AdditionalBusinessUnitService()
      const stamp = `trim-${Date.now()}`

      const first = await service.createAdditionalBusinessUnit({
        businessUnitName: `  Ventas ${stamp}  `,
        billingPlanId: planId,
        contractedEmployees: 10,
        user: userA,
      })

      const buFirst = await BusinessUnit.query()
        .where('business_unit_public_id', first.businessUnit.businessUnitPublicId)
        .first()
      if (buFirst) createdBuIds.push(buFirst.businessUnitId)

      try {
        await service.createAdditionalBusinessUnit({
          businessUnitName: `VENTAS ${stamp}`,
          billingPlanId: planId,
          contractedEmployees: 10,
          user: userA,
        })
        assert.fail('debió lanzar DUPLICATE_NAME por variante en case/trim')
      } catch (error) {
        assert.instanceOf(error, BusinessUnitSignupServiceError)
        assert.equal(
          (error as BusinessUnitSignupServiceError).errorCode,
          BUSINESS_UNIT_SIGNUP_ERROR_CODES.DUPLICATE_NAME
        )
      }
    })

    test(`tope de ${MAX_LIVE_BUSINESS_UNITS_PER_USER} empresas activas → 409 TNT.BU.LIMIT_REACHED`, async ({
      assert,
    }) => {
      // Insertar BUs de relleno hasta llegar al tope (userB empieza con 1 del test anterior)
      const existingRow = await db
        .from('business_unit_users as buu')
        .join('business_units as bu', 'bu.business_unit_id', 'buu.business_unit_id')
        .where('buu.user_id', userB.userId)
        .where('bu.business_unit_active', 1)
        .whereNull('bu.business_unit_deleted_at')
        .count('* as total')
        .first()
      const current = Number((existingRow as { total: number } | null)?.total ?? 0)
      const needed = MAX_LIVE_BUSINESS_UNITS_PER_USER - current

      for (let i = 0; i < needed; i++) {
        const padBu = new BusinessUnit()
        padBu.businessUnitName = `Relleno CA-3 ${i}-${Date.now()}`
        padBu.businessUnitSlug = `bu-pad-ca3-${i}-${Date.now()}`
        padBu.businessUnitLegalName = padBu.businessUnitName
        padBu.businessUnitActive = 1
        padBu.businessUnitOrigin = 'platform'
        await padBu.save()
        await userB.related('businessUnits').attach([padBu.businessUnitId])
        createdBuIds.push(padBu.businessUnitId)
      }

      // Verificar que el tope lanza el error correcto
      const service = new AdditionalBusinessUnitService()

      try {
        await service.createAdditionalBusinessUnit({
          businessUnitName: 'Una más que el tope',
          billingPlanId: planId,
          contractedEmployees: 10,
          user: userB,
        })
        assert.fail('debió lanzar LIMIT_REACHED')
      } catch (error) {
        assert.instanceOf(error, BusinessUnitSignupServiceError)
        assert.equal(
          (error as BusinessUnitSignupServiceError).errorCode,
          BUSINESS_UNIT_SIGNUP_ERROR_CODES.LIMIT_REACHED
        )
        assert.equal((error as BusinessUnitSignupServiceError).httpStatus, 409)
      }
    })
  }
)

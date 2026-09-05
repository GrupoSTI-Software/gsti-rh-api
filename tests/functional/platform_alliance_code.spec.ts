import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingCatalogService from '#services/billing_catalog_service'
import AllianceService from '#services/alliance_service'
import db from '@adonisjs/lucid/services/db'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import {
  ALLIANCE_CODE_ALPHABET,
  replaceAllianceCodeTextGenerator,
} from '#helpers/alliance_code_generator'

/**
 * Tests funcionales — el código de la alianza nace con el alta
 * (USRH1788505941894).
 */

const TEST_PASSWORD = 'AllianceCodeTest123!'
const BASE = '/api/platform/alliances'
const QUOTE = '/api/platform/billing/discount-codes'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Alliance',
    personLastname: 'Code',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Alliance Code BU ${stamp}`,
    businessUnitSlug: `alliance-code-bu-${stamp}`,
    businessUnitLegalName: `Alliance Code Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function cleanupAlliances(ids: number[]) {
  if (ids.length === 0) return
  await DiscountCode.query().whereIn('discount_code_alliance_id', ids).delete()
  await Alliance.query().whereIn('alliance_id', ids).delete()
}

function assertDictableCode(
  assert: {
    equal: (actual: unknown, expected: unknown) => void
    include: (haystack: string, needle: string) => void
    notMatch: (actual: string, regexp: RegExp) => void
  },
  text: string
) {
  assert.equal(text.length, 10)
  for (const char of text) {
    assert.include(ALLIANCE_CODE_ALPHABET, char)
  }
  assert.notMatch(text, /[IO01]/)
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance Code Plan ${stamp}`,
    billingPlanDescription: 'Fixture de canje del código de alianza',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 14,
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

test.group('POST /api/platform/alliances — acuñación del código', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []
  const extraCodeIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-code-admin', true)
  })

  group.teardown(async () => {
    replaceAllianceCodeTextGenerator(null)
    if (extraCodeIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_id', extraCodeIds).delete()
    }
    await cleanupAlliances(allianceIds)
    await cleanupActor(admin)
  })

  test('1. el alta responde 201 con código percent/0 y lo persiste como suyo', async ({
    client,
    assert,
  }) => {
    const name = `Código nace ${Date.now()}`
    const response = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: name,
      allianceDefaultCommissionPercent: 8,
    })

    response.assertStatus(201)
    const data = response.body().data
    allianceIds.push(data.allianceId)

    const code = data.allianceDiscountCode
    assert.exists(code)
    assert.equal(code.discountCodeKind, 'percent')
    assert.equal(Number(code.discountCodeValue), 0)
    assert.equal(code.discountCodeActive, 1)
    assertDictableCode(assert, code.discountCodeText)

    const persisted = await DiscountCode.query()
      .where('discount_code_id', code.discountCodeId)
      .firstOrFail()
    assert.equal(persisted.allianceId, data.allianceId)
    assert.equal(persisted.discountCodeCode, code.discountCodeText)

    const listed = await client.get(BASE).qs({ search: name }).loginAs(admin!.user)
    listed.assertStatus(200)
    assert.notProperty(listed.body().data[0], 'allianceDiscountCode')

    const detail = await client.get(`${BASE}/${data.allianceId}`).loginAs(admin!.user)
    detail.assertStatus(200)
    assert.equal(detail.body().data.allianceDiscountCode.discountCodeText, code.discountCodeText)
  })

  test('2. si la acuñación se agota, responde 500 y no queda la alianza', async ({
    client,
    assert,
  }) => {
    const occupied = await DiscountCode.create({
      discountCodeCode: 'BLOCKEDXXX',
      discountCodeName: 'Bloqueado para agotar mint',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
    })
    extraCodeIds.push(occupied.discountCodeId)
    replaceAllianceCodeTextGenerator(() => 'BLOCKEDXXX')

    try {
      const name = `No debe nacer ${Date.now()}`
      const response = await client
        .post(BASE)
        .loginAs(admin!.user)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json({
          allianceName: name,
          allianceDefaultCommissionPercent: 5,
        })

      response.assertStatus(500)
      response.assertBodyContains({
        key: 'generacion-de-codigo-agotada',
        code: ALLIANCE_ERROR_CODES.CODE_GENERATION_EXHAUSTED,
      })
      assert.notInclude(JSON.stringify(response.body()), 'BLOCKEDXXX')

      const leftover = await Alliance.query().where('alliance_name', name)
      assert.equal(leftover.length, 0)

      const listed = await client.get(BASE).qs({ search: name }).loginAs(admin!.user)
      assert.equal(listed.body().data.length, 0)
    } finally {
      replaceAllianceCodeTextGenerator(null)
    }
  })

  test('3. el UNIQUE impide un segundo código; el servicio responde CODE_ALREADY_EXISTS', async ({
    assert,
  }) => {
    const alliance = await Alliance.create({
      allianceName: `Un solo código ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 6,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    allianceIds.push(alliance.allianceId)

    const first = await DiscountCode.create({
      discountCodeCode: 'ONLYONEXXX',
      discountCodeName: 'Primero',
      discountCodeKind: 'percent',
      discountCodeValue: 0,
      discountCodeRedeemedCount: 0,
      discountCodeActive: 1,
      allianceId: alliance.allianceId,
    })

    try {
      await DiscountCode.create({
        discountCodeCode: 'SECONDXXXX',
        discountCodeName: 'Segundo',
        discountCodeKind: 'percent',
        discountCodeValue: 0,
        discountCodeRedeemedCount: 0,
        discountCodeActive: 1,
        allianceId: alliance.allianceId,
      })
      assert.fail('El UNIQUE debió rechazar el segundo código')
    } catch (error) {
      const dbError = error as { code?: string; sqlMessage?: string }
      assert.equal(dbError.code, 'ER_DUP_ENTRY')
      assert.include(dbError.sqlMessage ?? '', 'uq_discount_code_alliance_id')
    }

    try {
      await db.transaction((trx) =>
        new AllianceService().mintAllianceDiscountCode(alliance, trx)
      )
      assert.fail('El mint debió rechazar el segundo código')
    } catch (error) {
      assert.instanceOf(error, AllianceServiceError)
      assert.equal((error as AllianceServiceError).errorCode, ALLIANCE_ERROR_CODES.CODE_ALREADY_EXISTS)
      assert.equal((error as AllianceServiceError).httpStatus, 409)
    }

    const rows = await DiscountCode.query().where('discount_code_alliance_id', alliance.allianceId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].discountCodeId, first.discountCodeId)
  })
})

test.group('GET /api/platform/alliances/:id/code', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-code-get', true)
  })

  group.teardown(async () => {
    await cleanupAlliances(allianceIds)
    await cleanupActor(admin)
  })

  test('4. distingue código presente, alianza sin código y alianza inexistente', async ({
    client,
    assert,
  }) => {
    const created = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `Con código ${Date.now()}`,
      allianceDefaultCommissionPercent: 4,
    })
    created.assertStatus(201)
    const allianceId = created.body().data.allianceId
    allianceIds.push(allianceId)
    const expectedText = created.body().data.allianceDiscountCode.discountCodeText

    const withCode = await client.get(`${BASE}/${allianceId}/code`).loginAs(admin!.user)
    withCode.assertStatus(200)
    assert.equal(withCode.headers()['cache-control'], 'no-store')
    assert.equal(withCode.body().data.discountCodeText, expectedText)
    assert.equal(withCode.body().data.discountCodeKind, 'percent')
    assert.equal(Number(withCode.body().data.discountCodeValue), 0)
    assert.equal(withCode.body().data.qrUrlPath, `/platform/alliances/${allianceId}/code/qr-url`)
    assert.property(withCode.body().data, 'allianceQrReady')

    const bare = await Alliance.create({
      allianceName: `Sin código ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 3,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    allianceIds.push(bare.allianceId)

    const missing = await client.get(`${BASE}/${bare.allianceId}/code`).loginAs(admin!.user)
    missing.assertStatus(404)
    missing.assertBodyContains({
      key: 'codigo-no-encontrado',
      code: ALLIANCE_ERROR_CODES.CODE_NOT_FOUND,
    })

    const detail = await client.get(`${BASE}/${bare.allianceId}`).loginAs(admin!.user)
    detail.assertStatus(200)
    assert.isNull(detail.body().data.allianceDiscountCode)

    const unknown = await client.get(`${BASE}/999999992/code`).loginAs(admin!.user)
    unknown.assertStatus(404)
    unknown.assertBodyContains({
      key: 'alianza-no-encontrada',
      code: ALLIANCE_ERROR_CODES.NOT_FOUND,
    })

    const garbage = await client.get(`${BASE}/abc/code`).loginAs(admin!.user)
    garbage.assertStatus(404)
    garbage.assertBodyContains({
      key: 'alianza-no-encontrada',
      code: ALLIANCE_ERROR_CODES.NOT_FOUND,
    })
  })
})

test.group('Cascada de estado alianza → código', (group) => {
  let admin: TestActor | null = null
  let planId = 0
  const allianceIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-code-cascade', true)
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupAlliances(allianceIds)
    await cleanupActor(admin)
  })

  test('5. desactivar apaga el código y activar lo reenciende (mismo acto, canjeable)', async ({
    client,
    assert,
  }) => {
    const created = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `Cascada ${Date.now()}`,
      allianceDefaultCommissionPercent: 9,
    })
    created.assertStatus(201)
    const allianceId = created.body().data.allianceId
    allianceIds.push(allianceId)
    const text = created.body().data.allianceDiscountCode.discountCodeText

    const quoteLive = await client
      .get(`${QUOTE}/${text}/quote`)
      .qs({ billingPlanId: planId, employeeCount: 10 })
      .loginAs(admin!.user)
    quoteLive.assertStatus(200)

    const deactivated = await client.post(`${BASE}/${allianceId}/deactivate`).loginAs(admin!.user)
    deactivated.assertStatus(200)
    assert.equal(deactivated.body().data.allianceActive, 0)
    assert.equal(deactivated.body().data.allianceDiscountCode.discountCodeActive, 0)

    const persistedOff = await DiscountCode.query().where('discount_code_alliance_id', allianceId).firstOrFail()
    assert.equal(persistedOff.discountCodeActive, 0)

    const quoteOff = await client
      .get(`${QUOTE}/${text}/quote`)
      .qs({ billingPlanId: planId, employeeCount: 10 })
      .loginAs(admin!.user)
    quoteOff.assertStatus(422)
    quoteOff.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE })

    const activated = await client.post(`${BASE}/${allianceId}/activate`).loginAs(admin!.user)
    activated.assertStatus(200)
    assert.equal(activated.body().data.allianceActive, 1)
    assert.equal(activated.body().data.allianceDiscountCode.discountCodeActive, 1)

    const quoteOn = await client
      .get(`${QUOTE}/${text}/quote`)
      .qs({ billingPlanId: planId, employeeCount: 10 })
      .loginAs(admin!.user)
    quoteOn.assertStatus(200)
  })

  test('6. la cascada no truena si el código ya está en el estado destino', async ({
    client,
    assert,
  }) => {
    const created = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `Cascada tolerante ${Date.now()}`,
      allianceDefaultCommissionPercent: 2,
    })
    created.assertStatus(201)
    const allianceId = created.body().data.allianceId
    allianceIds.push(allianceId)
    const codeId = created.body().data.allianceDiscountCode.discountCodeId

    await DiscountCode.query().where('discount_code_id', codeId).update({ discount_code_active: 0 })

    const deactivated = await client.post(`${BASE}/${allianceId}/deactivate`).loginAs(admin!.user)
    deactivated.assertStatus(200)
    assert.equal(deactivated.body().data.allianceActive, 0)

    await DiscountCode.query().where('discount_code_id', codeId).update({ discount_code_active: 1 })

    const activated = await client.post(`${BASE}/${allianceId}/activate`).loginAs(admin!.user)
    activated.assertStatus(200)
    assert.equal(activated.body().data.allianceActive, 1)
    assert.equal(activated.body().data.allianceDiscountCode.discountCodeActive, 1)
  })
})

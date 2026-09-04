import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import DiscountCode from '#models/discount_code'
import BillingCatalogService from '#services/billing_catalog_service'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'

/**
 * Tests funcionales — GET /api/platform/billing/discount-codes/:discountCodeText/quote
 * (USRH1787714804400). Cubre autenticación/rol, las razones específicas de
 * no-redimibilidad, el orden de acumulación (volumen → código), el tope de
 * subtotal no negativo, la idempotencia (nunca escribe) y los tres tipos
 * de descuento contra un plan real en BD.
 */

const TEST_PASSWORD = 'DiscountCodeQuoteTest123!'

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
    personFirstname: 'DiscountQuote',
    personLastname: 'Test',
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
    businessUnitName: `Discount Quote BU ${stamp}`,
    businessUnitSlug: `discount-quote-bu-${stamp}`,
    businessUnitLegalName: `Discount Quote Legal ${stamp}`,
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

/** Plan publicado y vigente: 79/empleado, IVA 16 %, tramo 10 % desde 101 empleados. */
async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Discount Quote Plan ${stamp}`,
    billingPlanDescription: 'Fixture de cotización con código de descuento',
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
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 101,
    billingVolumeTierDiscountPercent: 10,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

/** Plan en borrador: nunca publicado. */
async function createDraftPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Discount Quote Draft ${stamp}`,
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
  return plan.billingPlanId
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

async function cleanupCode(codeId: number | null) {
  if (!codeId) return
  await DiscountCode.query().where('discount_code_id', codeId).delete()
}

test.group('GET .../discount-codes/:discountCodeText/quote — autenticación y rol', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client.get(
      '/api/platform/billing/discount-codes/CUALQUIERA/quote?billingPlanId=1&employeeCount=10'
    )
    response.assertStatus(401)
  })

  test('usuario no platformAdmin recibe 403', async ({ client }) => {
    const tenant = await createActor('quote-tenant', false)
    try {
      const response = await client
        .get('/api/platform/billing/discount-codes/CUALQUIERA/quote?billingPlanId=1&employeeCount=10')
        .loginAs(tenant.user)
      response.assertStatus(403)
    } finally {
      await cleanupActor(tenant)
    }
  })
})

test.group('GET .../discount-codes/:discountCodeText/quote — razones de no-redimibilidad', (group) => {
  let admin: TestActor | null = null
  let planId: number | null = null

  group.setup(async () => {
    admin = await createActor('quote-reasons-admin', true)
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupPlan(planId)
  })

  test('código inexistente responde 404 NOT_FOUND (no un mensaje genérico)', async ({ client }) => {
    const response = await client
      .get(`/api/platform/billing/discount-codes/NOEXISTE-${Date.now()}/quote?billingPlanId=${planId}&employeeCount=120`)
      .loginAs(admin!.user)

    response.assertStatus(404)
    response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.NOT_FOUND })
  })

  test('código apagado responde 422 CODE_INACTIVE', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `INACTIVO-${Date.now()}`,
      discountCodeName: 'Apagado',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 0,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código con vigencia futura responde 422 CODE_NOT_YET_VALID', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `FUTURO-${Date.now()}`,
      discountCodeName: 'Aún no vigente',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: '2099-01-01',
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.CODE_NOT_YET_VALID })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código vencido responde 422 CODE_EXPIRED', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `VENCIDO-${Date.now()}`,
      discountCodeName: 'Vencido',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: '2020-01-01',
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código con cupo de canjes agotado responde 422 CODE_EXHAUSTED', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `AGOTADO-${Date.now()}`,
      discountCodeName: 'Agotado',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: 5,
      discountCodeRedeemedCount: 5,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código válido pero plan inexistente responde 404 QUOTE_PLAN_NOT_FOUND', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `PLANFANTASMA-${Date.now()}`,
      discountCodeName: 'Plan inexistente',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=999999999&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(404)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_FOUND })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código válido pero plan en borrador responde 422 QUOTE_PLAN_NOT_QUOTABLE', async ({
    client,
  }) => {
    const draftPlanId = await createDraftPlan(Date.now())
    const code = await DiscountCode.create({
      discountCodeCode: `PLANBORRADOR-${Date.now()}`,
      discountCodeName: 'Plan borrador',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${draftPlanId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_QUOTABLE })
    } finally {
      await cleanupCode(code.discountCodeId)
      await cleanupPlan(draftPlanId)
    }
  })

  test('el texto del código no distingue mayúsculas/minúsculas', async ({ client }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `MAYUS-${Date.now()}`,
      discountCodeName: 'Sensibilidad de mayúsculas',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode.toLowerCase()}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      response.assertStatus(200)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })
})

test.group('GET .../discount-codes/:discountCodeText/quote — cálculo (120 empleados, 79/empleado, tramo 10 %)', (group) => {
  let admin: TestActor | null = null
  let planId: number | null = null

  group.setup(async () => {
    admin = await createActor('quote-calc-admin', true)
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupPlan(planId)
  })

  test('percent 15 %: acumula después del volumen, isContractable true', async ({
    client,
    assert,
  }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `PERCENT15-${Date.now()}`,
      discountCodeName: 'Percent 15',
      discountCodeKind: 'percent',
      discountCodeValue: 15,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.currency, 'MXN')
      assert.equal(data.trialDays, 14)
      assert.equal(data.effectiveFrom, '2025-01-01', 'effectiveFrom debe normalizarse a YYYY-MM-DD')

      assert.equal(data.undiscounted.subtotal, 8532)
      assert.equal(data.undiscounted.total, 9897.12)

      assert.equal(data.discounted.subtotal, 7252.2)
      assert.equal(data.discounted.taxAmount, 1160.35)
      assert.equal(data.discounted.total, 8412.55)
      assert.equal(data.discounted.codeDiscountAmount, 1279.8)

      assert.isTrue(data.isContractable)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('fixed_amount 1200: resta después del volumen', async ({ client, assert }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `FIXED1200-${Date.now()}`,
      discountCodeName: 'Fixed 1200',
      discountCodeKind: 'fixed_amount',
      discountCodeValue: 1200,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.discounted.subtotal, 7332)
      assert.equal(data.discounted.taxAmount, 1173.12)
      assert.equal(data.discounted.total, 8505.12)
      assert.equal(data.discounted.codeDiscountAmount, 1200)
      assert.isTrue(data.isContractable)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('unit_price 65: sustituye el precio antes del bruto, el tramo se recalcula sobre el nuevo bruto', async ({
    client,
    assert,
  }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `UNITPRICE65-${Date.now()}`,
      discountCodeName: 'Unit price 65',
      discountCodeKind: 'unit_price',
      discountCodeValue: 65,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      // Bloque sin código: siempre con el precio de lista y el tramo real (948).
      assert.equal(data.undiscounted.subtotal, 8532)
      assert.equal(data.undiscounted.discountAmount, 948)

      // Bloque con código: precio sustituido, tramo recalculado sobre el nuevo bruto (780).
      assert.equal(data.discounted.pricePerEmployee, 65)
      assert.equal(data.discounted.discountAmount, 780)
      assert.equal(data.discounted.subtotal, 7020)
      assert.equal(data.discounted.taxAmount, 1123.2)
      assert.equal(data.discounted.total, 8143.2)
      assert.equal(data.discounted.codeDiscountAmount, 1512)
      assert.isTrue(data.isContractable)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('subtotal no negativo: fixed_amount mayor al subtotal deja todo en cero e isContractable=false', async ({
    client,
    assert,
  }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `SOBRECOSTO-${Date.now()}`,
      discountCodeName: 'Descuento mayor al subtotal',
      discountCodeKind: 'fixed_amount',
      discountCodeValue: 100000,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.discounted.subtotal, 0)
      assert.equal(data.discounted.taxAmount, 0)
      assert.equal(data.discounted.total, 0)
      // El ahorro reportado es el efectivamente aplicado (todo el subtotal disponible), no el nominal.
      assert.equal(data.discounted.codeDiscountAmount, data.undiscounted.subtotal)
      assert.isFalse(data.isContractable)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('idempotencia: consultar la cotización no toca discountCodeRedeemedCount ni el plan', async ({
    client,
    assert,
  }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `IDEMPOTENTE-${Date.now()}`,
      discountCodeName: 'Idempotencia',
      discountCodeKind: 'percent',
      discountCodeValue: 20,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: 3,
      discountCodeRedeemedCount: 1,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)
      await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=120`)
        .loginAs(admin!.user)

      const reloaded = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloaded.discountCodeRedeemedCount, 1)
      assert.equal(reloaded.discountCodeActive, 1)

      const plan = await BillingPlan.findOrFail(planId!)
      assert.equal(plan.billingPlanActive, 1)
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })

  test('cantidad de empleados o plan inválidos (Vine) responden 422 VAL_INPUT', async ({
    client,
  }) => {
    const code = await DiscountCode.create({
      discountCodeCode: `VALINPUT-${Date.now()}`,
      discountCodeName: 'Validación',
      discountCodeKind: 'percent',
      discountCodeValue: 10,
      discountCodeValidFrom: null,
      discountCodeValidTo: null,
      discountCodeMaxRedemptions: null,
      discountCodeRedeemedCount: 0,
      discountCodeBenefitPeriods: null,
      discountCodeActive: 1,
    })
    try {
      const response = await client
        .get(`/api/platform/billing/discount-codes/${code.discountCodeCode}/quote?billingPlanId=${planId}&employeeCount=-5`)
        .loginAs(admin!.user)
      response.assertStatus(422)
      response.assertBodyContains({ code: DISCOUNT_CODE_ERROR_CODES.VAL_INPUT })
    } finally {
      await cleanupCode(code.discountCodeId)
    }
  })
})

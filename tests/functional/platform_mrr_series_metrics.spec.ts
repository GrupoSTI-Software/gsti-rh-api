import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * USRH1788052455654 — contrato de `GET /api/platform/metrics/mrr-series`.
 *
 * Las reglas del cálculo viven en las pruebas del servicio. Aquí se prueba lo
 * que solo el transporte puede romper: que la ruta exista dentro del grupo con
 * los dos guards, la forma exacta del payload, el 422 de la ventana y los
 * rechazos de perímetro.
 *
 * El grupo siembra una suscripción con un cobro que cubre el mes en curso para
 * que la serie nunca salga vacía en estas pruebas: la base es compartida y no se
 * puede garantizar qué cobros traen los demás fixtures.
 */

const TEST_PASSWORD = 'MrrSeriesTest123!'
const BASE_URL = '/api/platform/metrics/mrr-series'

/** Llaves exactas del payload. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_DATA_KEYS = ['criterio', 'pagosSinPeriodoExcluidos', 'puntos', 'ventana']
const EXPECTED_POINT_KEYS = [
  'confiabilidad',
  'mes',
  'motivoBajaConfiabilidad',
  'mrrCobradoNetoCents',
  'pagosConsiderados',
]

const MES_EN_CURSO = DateTime.now().toFormat('yyyy-MM')

interface TestActor {
  user: User
  person: Person
}

interface SeriesPoint {
  mes: string
  mrrCobradoNetoCents: number
  pagosConsiderados: number
  confiabilidad: string
  motivoBajaConfiabilidad: string | null
}

interface SeriesBody {
  ventana: { desde: string | null; hasta: string | null }
  criterio: string
  pagosSinPeriodoExcluidos: number
  puntos: SeriesPoint[]
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Mrr',
    personLastname: 'Series',
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

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/** Siembra plan, empresa, suscripción y un cobro que cubre el mes en curso. */
async function seedPaidMonth(): Promise<{ buId: number; planId: number }> {
  const stamp = Date.now()
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Series Http Plan ${stamp}`,
    billingPlanDescription: 'Fixture HTTP de USRH1788052455654',
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

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Mrr Series Http BU ${stamp}`
  businessUnit.businessUnitSlug = `mrr-series-http-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Mrr Series Http Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', plan.billingPlanId)
    .firstOrFail()
  const now = DateTime.utc()

  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: plan.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: 650,
    billingSubscriptionContractedTaxAmount: 104,
    billingSubscriptionContractedTotal: 754,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })

  await BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: 65_000,
    billingPaymentPeriodAmountCents: 65_000,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 65_000,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 65_000,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 65_000,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `MRR-SERIES-HTTP-${stamp}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now(),
    billingPaymentPeriodStart: DateTime.now().startOf('month'),
    billingPaymentPeriodEnd: DateTime.now().startOf('month').plus({ months: 1 }),
  })

  return { buId: businessUnit.businessUnitId, planId: plan.billingPlanId }
}

async function cleanupSeed(buId: number, planId: number): Promise<void> {
  const subscriptions = await BillingSubscription.query().withTrashed().where('business_unit_id', buId)
  for (const subscription of subscriptions) {
    await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await subscription.forceDelete()
  }
  await BusinessUnit.query().withTrashed().where('business_unit_id', buId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

test.group('GET /api/platform/metrics/mrr-series', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null
  let seed: { buId: number; planId: number } | null = null

  group.setup(async () => {
    admin = await createActor('mrr-series-admin', true)
    outsider = await createActor('mrr-series-outsider', false)
    seed = await seedPaidMonth()
  })

  group.teardown(async () => {
    if (seed) await cleanupSeed(seed.buId, seed.planId)
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('la ruta existe y responde el envelope del área con las llaves exactas', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(Object.keys(response.body().data).sort(), EXPECTED_DATA_KEYS)
    assert.isUndefined(response.body().meta)
  })

  test('CA-9 — el payload declara criterio pagos y no trae los campos de la franja', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    assert.equal(data.criterio, 'pagos')
    assert.notInclude(JSON.stringify(data), 'mrrActualNeto')
    assert.notInclude(JSON.stringify(data), 'mrrProyectadoTrial')
  })

  test('cada punto trae sus cinco campos, con enteros y mes YYYY-MM', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    assert.isNotEmpty(data.puntos)
    for (const punto of data.puntos) {
      assert.deepEqual(Object.keys(punto).sort(), EXPECTED_POINT_KEYS)
      assert.match(punto.mes, /^\d{4}-\d{2}$/)
      assert.isTrue(Number.isInteger(punto.mrrCobradoNetoCents))
      assert.isTrue(Number.isInteger(punto.pagosConsiderados))
      assert.include(['alta', 'baja'], punto.confiabilidad)
    }
    assert.isTrue(Number.isInteger(data.pagosSinPeriodoExcluidos))
    assert.isAtLeast(data.pagosSinPeriodoExcluidos, 0)
  })

  test('los puntos van en orden cronológico y la ventana termina en el mes en curso', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody
    const meses = data.puntos.map((punto) => punto.mes)

    assert.deepEqual(meses, [...meses].sort())
    assert.equal(data.ventana.hasta, MES_EN_CURSO)
    assert.equal(meses.at(-1), MES_EN_CURSO)
    assert.equal(data.ventana.desde, meses[0])
    assert.isAtMost(meses.length, 12)
  })

  test('CA-3 — el punto del mes en curso siempre viene de baja confiabilidad', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody
    const enCurso = data.puntos.at(-1)!

    assert.equal(enCurso.mes, MES_EN_CURSO)
    assert.equal(enCurso.confiabilidad, 'baja')
    assert.equal(enCurso.motivoBajaConfiabilidad, 'mes-en-curso')
  })

  test('meses = 3 recorta la ventana a tres puntos', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).qs({ meses: 3 }).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    response.assertStatus(200)
    assert.isAtMost(data.puntos.length, 3)
    assert.equal(data.ventana.hasta, MES_EN_CURSO)
  })

  test('CA-7 — meses = 40 responde 422 con el cuerpo exacto y sin ningún punto', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).qs({ meses: 40 }).loginAs(admin!.user)

    response.assertStatus(422)
    assert.equal(response.body().title, 'No fue posible obtener la serie mensual de MRR')
    assert.equal(response.body().detail, 'El número de meses debe estar entre 1 y 24.')
    assert.equal(response.body().code, 'PLT.MET.VAL_INPUT')
    assert.equal(response.body().key, 'no-fue-posible-obtener-la-serie-mensual-de-mrr')
    assert.isUndefined(response.body().data)
  })

  test('meses = 0 y meses no entero también responden 422', async ({ client, assert }) => {
    const cero = await client.get(BASE_URL).qs({ meses: 0 }).loginAs(admin!.user)
    const texto = await client.get(BASE_URL).qs({ meses: 'doce' }).loginAs(admin!.user)

    cero.assertStatus(422)
    texto.assertStatus(422)
    assert.equal(cero.body().code, 'PLT.MET.VAL_INPUT')
    assert.equal(texto.body().code, 'PLT.MET.VAL_INPUT')
  })

  test('CA-8 — sin is_platform_admin responde 403 sin campo code', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(outsider!.user)

    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isUndefined(response.body().code)
    assert.isUndefined(response.body().data)
  })

  test('sin sesión responde 401', async ({ client }) => {
    const response = await client.get(BASE_URL)
    response.assertStatus(401)
  })

  test('el agregado no publica identidad de clientes', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const raw = JSON.stringify(response.body())

    for (const prohibido of [
      'businessUnitPublicId',
      'business_unit_id',
      'billingSubscriptionId',
      'billingPaymentId',
      'rfc',
      'billingEmail',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })
})

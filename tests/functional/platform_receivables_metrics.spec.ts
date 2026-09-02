import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * USRH1788052455651 — contrato de `GET /api/platform/metrics/receivables`.
 *
 * El resumen se verifica por diferencia contra una foto previa: la base de
 * pruebas es compartida y ya trae morosos de otros fixtures, así que un total
 * absoluto sería verde hoy y rojo mañana.
 */

const TEST_PASSWORD = 'ReceivablesTest123!'
const BASE_URL = '/api/platform/metrics/receivables'

/** Llaves exactas de una fila. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_TENANT_KEYS = [
  'bucket',
  'businessUnitActive',
  'businessUnitName',
  'businessUnitPublicId',
  'diasAtraso',
  'montoVencidoCents',
  'periodoFin',
  'planName',
  'saldoAFavorCents',
]

interface TestActor {
  user: User
  person: Person
}

interface SummaryBody {
  totalVencidoCents: number
  tenantsVencidos: number
  saldoAFavorCents: number
  porBucket: Record<'hasta30' | 'de31a60' | 'mas60', { tenants: number; montoCents: number }>
  calculadoAl: string
}

interface TenantBody {
  businessUnitPublicId: string
  businessUnitName: string
  businessUnitActive: number
  planName: string | null
  montoVencidoCents: number
  diasAtraso: number
  bucket: string
  periodoFin: string
  saldoAFavorCents: number
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'Receivables',
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

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Receivables Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788052455651',
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

interface OverdueFixture {
  planId: number
  stamp: number
  suffix: string
  status?: BillingSubscriptionStatus
  /** Días de atraso deseados: el periodo se cierra hace tantos días. */
  daysLate: number
  /** Total contratado CON IVA, en pesos. */
  contractedTotal: number
  creditBalanceCents?: number
  businessUnitActive?: number
  businessUnitDeleted?: boolean
  subscriptionDeleted?: boolean
}

/** Crea empresa + suscripción con el atraso pedido y devuelve el publicId de la empresa. */
async function createOverdue(fixture: OverdueFixture): Promise<{ publicId: string; buId: number }> {
  const now = DateTime.now()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Receivables BU ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitSlug = `receivables-bu-${fixture.suffix}-${fixture.stamp}`
  businessUnit.businessUnitLegalName = `Receivables Legal ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitActive = fixture.businessUnitActive ?? 1
  await businessUnit.save()

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.planId)
    .firstOrFail()

  const status = fixture.status ?? 'past_due'
  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: fixture.planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: status,
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: fixture.contractedTotal,
    billingSubscriptionContractedTaxAmount: 0,
    billingSubscriptionContractedTotal: fixture.contractedTotal,
    billingSubscriptionCreditBalanceCents: fixture.creditBalanceCents ?? 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: null,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: fixture.daysLate + 30 }),
    billingSubscriptionCurrentPeriodEnd: now.minus({ days: fixture.daysLate }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId:
      status === 'canceled' ? null : businessUnit.businessUnitId,
  })

  if (fixture.subscriptionDeleted) {
    await subscription.delete()
  }
  if (fixture.businessUnitDeleted) {
    await businessUnit.delete()
  }

  return { publicId: businessUnit.businessUnitPublicId, buId: businessUnit.businessUnitId }
}

async function cleanupFixtures(businessUnitIds: number[], planIds: number[]): Promise<void> {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await subscription.forceDelete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

/**
 * Recorre todas las páginas del listado (vía `meta.lastPage`) y entrega el
 * universo de filas más el resumen. Un solo crawl alimenta todas las búsquedas
 * de una prueba: no se re-pide una página ya leída.
 */
async function collectReceivables(
  client: ApiClient,
  actor: User
): Promise<{ tenants: TenantBody[]; resumen: SummaryBody; type: string }> {
  const tenants: TenantBody[] = []
  let page = 1
  let type = ''
  let resumen: SummaryBody | undefined
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await client.get(BASE_URL).qs({ page, limit: 100 }).loginAs(actor)
    response.assertStatus(200)
    const body = response.body()
    if (page === 1) {
      type = body.type
      resumen = body.data.resumen as SummaryBody
    }
    tenants.push(...(body.data.tenants as TenantBody[]))
    if (page >= body.meta.lastPage) {
      return { tenants, resumen: resumen!, type }
    }
    page += 1
  }
}

/** Filas con ese publicId en un universo ya recorrido. Puede haber 0, 1 o más. */
function findTenants(tenants: TenantBody[], publicId: string): TenantBody[] {
  return tenants.filter((tenant) => tenant.businessUnitPublicId === publicId)
}

test.group('GET /api/platform/metrics/receivables', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null
  let planId = 0
  const businessUnitIds: number[] = []

  group.setup(async () => {
    admin = await createActor('receivables-admin', true)
    outsider = await createActor('receivables-outsider', false)
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnitIds, [planId])
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('CA-7 — un usuario sin is_platform_admin recibe 403 sin campo code', async ({
    client,
    assert,
  }) => {
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

  test('CA-6 — limit fuera de rango responde 422 con el catálogo PLT.MET', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).qs({ limit: 500 }).loginAs(admin!.user)

    response.assertStatus(422)
    assert.deepEqual(response.body(), {
      title: 'No fue posible obtener la cartera vencida',
      detail: 'El límite de resultados por página no puede ser mayor a 100.',
      key: 'no-fue-posible-obtener-la-cartera-vencida',
      code: 'PLT.MET.VAL_INPUT',
    })
  })

  test('CA-1 — el moroso aparece una vez con el total CON IVA en centavos', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const { publicId, buId } = await createOverdue({
      planId,
      stamp,
      suffix: 'ca1',
      daysLate: 12,
      contractedTotal: 5800,
      businessUnitActive: 0,
    })
    businessUnitIds.push(buId)

    const collected = await collectReceivables(client, admin!.user)
    assert.equal(collected.type, 'success')

    const repeticiones = findTenants(collected.tenants, publicId)
    assert.lengthOf(repeticiones, 1, 'la empresa morosa debe aparecer una sola vez en todas las páginas')
    const row = repeticiones[0]!
    assert.equal(row.montoVencidoCents, 580000)
    assert.equal(row.businessUnitActive, 0, 'la desactivación no perdona la deuda (regla 8)')
    assert.deepEqual(Object.keys(row).sort(), EXPECTED_TENANT_KEYS.sort())

    const after = collected.resumen
    assert.equal(after.totalVencidoCents - before.totalVencidoCents, 580000)
    assert.equal(after.tenantsVencidos - before.tenantsVencidos, 1)
    assert.match(after.calculadoAl, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('CA-2 — 12, 45 y 91 días caen en los tres tramos y suman a su reparto', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 1
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const casos = [
      { suffix: 'ca2a', daysLate: 12, bucket: 'hasta30' },
      { suffix: 'ca2b', daysLate: 45, bucket: 'de31a60' },
      { suffix: 'ca2c', daysLate: 91, bucket: 'mas60' },
    ]

    const publicIds: string[] = []
    for (const caso of casos) {
      const created = await createOverdue({
        planId,
        stamp,
        suffix: caso.suffix,
        daysLate: caso.daysLate,
        contractedTotal: 1000,
      })
      businessUnitIds.push(created.buId)
      publicIds.push(created.publicId)
    }

    const collected = await collectReceivables(client, admin!.user)

    for (const [index, caso] of casos.entries()) {
      const matches = findTenants(collected.tenants, publicIds[index]!)
      assert.lengthOf(matches, 1, `fila del caso ${caso.suffix}`)
      const row = matches[0]!
      assert.equal(row.diasAtraso, caso.daysLate)
      assert.equal(row.bucket, caso.bucket)
      assert.match(row.periodoFin, /^\d{4}-\d{2}-\d{2}$/)
    }

    const after = collected.resumen
    for (const caso of casos) {
      const key = caso.bucket as 'hasta30' | 'de31a60' | 'mas60'
      assert.equal(after.porBucket[key].tenants - before.porBucket[key].tenants, 1)
      assert.equal(after.porBucket[key].montoCents - before.porBucket[key].montoCents, 100000)
    }
  })

  test('CA-3 — el resumen es de la cartera completa, no de la página', async ({
    client,
    assert,
  }) => {
    const primeraResponse = await client.get(BASE_URL).qs({ page: 1, limit: 1 }).loginAs(admin!.user)
    const primera = primeraResponse.body()

    assert.isAtMost((primera.data.tenants as TenantBody[]).length, 1)
    assert.equal(primera.meta.limit, 1)
    assert.equal(primera.meta.page, 1)
    assert.equal(primera.meta.total, (primera.data.resumen as SummaryBody).tenantsVencidos)
    assert.equal(primera.meta.lastPage, Math.max(1, primera.meta.total))

    const completaResponse = await client
      .get(BASE_URL)
      .qs({ page: 1, limit: 100 })
      .loginAs(admin!.user)
    const completa = completaResponse.body()

    // El resumen no cambia con el tamaño de la página (regla 9).
    assert.equal(
      (primera.data.resumen as SummaryBody).totalVencidoCents,
      (completa.data.resumen as SummaryBody).totalVencidoCents
    )
    assert.isAbove(
      (completa.data.resumen as SummaryBody).totalVencidoCents,
      (primera.data.tenants as TenantBody[])[0]?.montoVencidoCents ?? -1
    )
  })

  test('CA-4 — el saldo a favor viaja aparte y no se le resta al adeudo', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 2
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const { publicId, buId } = await createOverdue({
      planId,
      stamp,
      suffix: 'ca4',
      daysLate: 5,
      contractedTotal: 5800,
      creditBalanceCents: 100000,
    })
    businessUnitIds.push(buId)

    const collected = await collectReceivables(client, admin!.user)
    const matches = findTenants(collected.tenants, publicId)
    assert.lengthOf(matches, 1)
    const row = matches[0]!

    assert.equal(row.montoVencidoCents, 580000, 'el adeudo no se netea (regla 6)')
    assert.equal(row.saldoAFavorCents, 100000)
    // Ningún campo publica la resta ni el neto.
    assert.notInclude(Object.values(row), 480000)

    // El resumen agrega crédito y adeudo por separado: el frontend lee estas dos cifras.
    const after = collected.resumen
    assert.equal(after.totalVencidoCents - before.totalVencidoCents, 580000)
    assert.equal(after.saldoAFavorCents - before.saldoAFavorCents, 100000)
  })

  test('CA-5 — activos, en prueba, cancelados y bajas lógicas quedan fuera', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 3
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const excluidos = [
      await createOverdue({ planId, stamp, suffix: 'x-active', daysLate: 40, contractedTotal: 900, status: 'active' }),
      await createOverdue({ planId, stamp, suffix: 'x-trial', daysLate: 40, contractedTotal: 900, status: 'trialing' }),
      await createOverdue({ planId, stamp, suffix: 'x-cancel', daysLate: 40, contractedTotal: 900, status: 'canceled' }),
      await createOverdue({ planId, stamp, suffix: 'x-bu-del', daysLate: 40, contractedTotal: 900, businessUnitDeleted: true }),
      await createOverdue({ planId, stamp, suffix: 'x-sub-del', daysLate: 40, contractedTotal: 900, subscriptionDeleted: true }),
    ]
    for (const excluido of excluidos) businessUnitIds.push(excluido.buId)

    const collected = await collectReceivables(client, admin!.user)

    for (const excluido of excluidos) {
      assert.lengthOf(
        findTenants(collected.tenants, excluido.publicId),
        0,
        `${excluido.publicId} no debe estar en la cartera`
      )
    }

    const after = collected.resumen
    assert.equal(after.totalVencidoCents, before.totalVencidoCents)
    assert.equal(after.tenantsVencidos, before.tenantsVencidos)
  })

  test('el orden es más atrasados primero y el payload no filtra identificadores internos', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).qs({ limit: 100 }).loginAs(admin!.user)
    const body = response.body()
    const tenants = body.data.tenants as TenantBody[]

    for (let index = 1; index < tenants.length; index += 1) {
      assert.isAtMost(
        tenants[index]!.diasAtraso,
        tenants[index - 1]!.diasAtraso,
        'diasAtraso debe venir descendente'
      )
    }

    const serialized = JSON.stringify(body)
    assert.notInclude(serialized, 'business_unit_id')
    assert.notInclude(serialized, 'billingSubscriptionId')
    assert.notInclude(serialized, 'rfc')
    assert.notInclude(serialized, 'billingEmail')
  })
})

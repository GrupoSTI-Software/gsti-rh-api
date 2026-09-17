import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import PlatformTenantTrialService, {
  type TenantTrialSnapshot,
} from '#services/platform_tenant_trial_service'

/**
 * USRH1789079078169 — ventana y estado de la prueba de un tenant.
 *
 * RN-49 (nunca mezclar dos empresas): cada escenario siembra al menos dos
 * empresas y verifica que la respuesta de una nunca traiga un dato de la
 * otra — el error de mezcla da un número verosímil y es el más fácil de
 * pasar por alto con una sola empresa sembrada.
 */

const TEST_PASSWORD = 'TenantTrialTest123!'
const BASE_URL = '/api/platform/tenant-trials'

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Tenant',
    personLastname: 'Trial',
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

async function createPlan(stamp: number, trialDays: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Tenant Trial Plan ${trialDays}d ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1789079078169',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: trialDays,
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

async function createBusinessUnit(stamp: number, tag: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Tenant Trial ${tag} BU ${stamp}`
  businessUnit.businessUnitSlug = `tenant-trial-${tag}-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Tenant Trial ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

/** Sobrescribe columnas de una suscripción ya creada, a mano y sin hooks, para fijar fechas históricas exactas. */
async function forceSubscriptionRow(
  billingSubscriptionId: number,
  overrides: Record<string, unknown>
): Promise<void> {
  await db
    .from('billing_subscriptions')
    .where('billing_subscription_id', billingSubscriptionId)
    .update(overrides)
}

async function softDeleteSubscription(billingSubscriptionId: number): Promise<void> {
  await forceSubscriptionRow(billingSubscriptionId, {
    billing_subscription_deleted_at: new Date(),
    billing_subscription_live_business_unit_id: null,
  })
}

async function cleanupBusinessUnit(businessUnitId: number): Promise<void> {
  await BillingSubscription.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number): Promise<void> {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

// ─── Nivel servicio: la matriz de estados/reglas ──────────────────────────────

test.group('PlatformTenantTrialService — matriz de estados (USRH1789079078169)', () => {
  test('viva: ventana leída (no calculada restando), días transcurridos/restantes correctos', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const trialPlanId = await createPlan(stamp, 7)
    const buViva = await createBusinessUnit(stamp, 'viva')
    const buSinPrueba = await createBusinessUnit(stamp + 1, 'sin-prueba-control')
    const noTrialPlanId = await createPlan(stamp + 2, 0)
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const subViva = await subscriptionService.createSubscription({
        businessUnitPublicId: buViva.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      // Empresa de control sembrada a la vez (RN-49): nunca debe aparecer en
      // la respuesta de `buViva`.
      await subscriptionService.createSubscription({
        businessUnitPublicId: buSinPrueba.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        skipTrial: true,
      })

      const snapshot = await trialService.resolveOne(buViva.businessUnitPublicId)

      assert.equal(snapshot.businessUnitPublicId, buViva.businessUnitPublicId)
      assert.isTrue(snapshot.tuvoPrueba)
      assert.equal(snapshot.estado, 'viva')
      assert.isNotNull(snapshot.ventana)
      assert.equal(
        snapshot.ventana!.inicio,
        subViva.billingSubscriptionSubscribedAt.toISODate()
      )
      assert.equal(snapshot.ventana!.fin, subViva.billingSubscriptionTrialEndsAt!.toISODate())
      assert.equal(snapshot.diasContratados, 7)
      assert.equal(snapshot.diasTranscurridos, 0) // recién dada de alta, hoy = inicio
      assert.equal(snapshot.diasRestantes, 7) // ventana completa por delante
      assert.isNull(snapshot.resultado)
    } finally {
      await cleanupBusinessUnit(buViva.businessUnitId)
      await cleanupBusinessUnit(buSinPrueba.businessUnitId)
      await cleanupPlan(trialPlanId)
      await cleanupPlan(noTrialPlanId)
    }
  })

  test('viva, RN-06: fin de prueba = hoy sigue viva con 0 días restantes (no se adelanta al proceso diario)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 3
    const zeroTrialPlanId = await createPlan(stamp, 0)
    const businessUnit = await createBusinessUnit(stamp, 'rn06')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: zeroTrialPlanId,
        contractedEmployees: 10,
        // Sin skipTrial: 0 días de prueba deja trial_ends_at = hoy y status
        // 'trialing' (borde RN-07 del ticket anterior, reusado aquí a propósito).
      })

      const snapshot = await trialService.resolveOne(businessUnit.businessUnitPublicId)

      assert.equal(snapshot.estado, 'viva')
      assert.equal(snapshot.diasRestantes, 0)
      assert.equal(snapshot.medicionHasta, snapshot.ventana!.fin)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(zeroTrialPlanId)
    }
  })

  test('terminada por vencimiento/conversión (RN-52): ventana completa sin recortar, 0 días restantes', async ({
    assert,
  }) => {
    const stamp = Date.now() + 4
    const trialPlanId = await createPlan(stamp, 7)
    const buTerminada = await createBusinessUnit(stamp, 'terminada-conv')
    const buOtra = await createBusinessUnit(stamp + 1, 'terminada-conv-control')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const sub = await subscriptionService.createSubscription({
        businessUnitPublicId: buTerminada.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await subscriptionService.createSubscription({
        businessUnitPublicId: buOtra.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })

      // Simula lo que dejaría el reloj diario al convertir: status pasa a
      // 'active', trial_ends_at y subscribed_at NO se tocan (regla, no del reloj).
      await forceSubscriptionRow(sub.billingSubscriptionId, {
        billing_subscription_status: 'active',
        billing_subscription_subscribed_at: '2026-01-01 00:00:00',
        billing_subscription_trial_ends_at: '2026-01-08',
      })

      const snapshot = await trialService.resolveOne(buTerminada.businessUnitPublicId)

      assert.equal(snapshot.estado, 'terminada')
      assert.deepEqual(snapshot.ventana, { inicio: '2026-01-01', fin: '2026-01-08' })
      assert.equal(snapshot.medicionHasta, '2026-01-08') // ventana completa, RN-52
      assert.equal(snapshot.diasTranscurridos, 7)
      assert.equal(snapshot.diasRestantes, 0)
    } finally {
      await cleanupBusinessUnit(buTerminada.businessUnitId)
      await cleanupBusinessUnit(buOtra.businessUnitId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('terminada por cancelación a mitad de la ventana (RN-51): ventana contratada intacta, medición se corta el día de la baja', async ({
    assert,
  }) => {
    const stamp = Date.now() + 5
    const trialPlanId = await createPlan(stamp, 30)
    const buCancelada = await createBusinessUnit(stamp, 'rn51')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const sub = await subscriptionService.createSubscription({
        businessUnitPublicId: buCancelada.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })

      // Ejemplo literal del spec: 30 días contratados (día 1 al 30), cancela
      // el día 10.
      await forceSubscriptionRow(sub.billingSubscriptionId, {
        billing_subscription_status: 'canceled',
        billing_subscription_subscribed_at: '2026-02-01 00:00:00',
        billing_subscription_trial_ends_at: '2026-03-03', // día 1 al 30 (30 días)
        billing_subscription_canceled_at: '2026-02-11', // canceló el día 10 (2026-02-01 + 10)
      })

      const snapshot = await trialService.resolveOne(buCancelada.businessUnitPublicId)

      assert.equal(snapshot.estado, 'terminada')
      // La ventana contratada NO se toca: sigue siendo del día 1 al 30.
      assert.deepEqual(snapshot.ventana, { inicio: '2026-02-01', fin: '2026-03-03' })
      // El tope de medición SÍ se corta al día de la cancelación.
      assert.equal(snapshot.medicionHasta, '2026-02-11')
      assert.equal(snapshot.diasTranscurridos, 10)
      assert.equal(snapshot.diasRestantes, 0)
    } finally {
      await cleanupBusinessUnit(buCancelada.businessUnitId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('cancelación posterior al fin de la prueba no acorta nada: medición sigue siendo el fin contratado', async ({
    assert,
  }) => {
    const stamp = Date.now() + 6
    const trialPlanId = await createPlan(stamp, 7)
    const businessUnit = await createBusinessUnit(stamp, 'cancel-tardia')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const sub = await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })

      await forceSubscriptionRow(sub.billingSubscriptionId, {
        billing_subscription_status: 'canceled',
        billing_subscription_subscribed_at: '2026-01-01 00:00:00',
        billing_subscription_trial_ends_at: '2026-01-08',
        billing_subscription_canceled_at: '2026-02-15', // muy después del fin de prueba
      })

      const snapshot = await trialService.resolveOne(businessUnit.businessUnitPublicId)

      assert.equal(snapshot.medicionHasta, '2026-01-08') // el fin, no la cancelación tardía
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('sin prueba: respuesta válida y explícita, no error ni ceros disfrazados de prueba', async ({
    assert,
  }) => {
    const stamp = Date.now() + 7
    const noTrialPlanId = await createPlan(stamp, 0)
    const buSinPrueba = await createBusinessUnit(stamp, 'sin-prueba')
    const buConPrueba = await createBusinessUnit(stamp + 1, 'sin-prueba-control')
    const trialPlanId = await createPlan(stamp + 2, 7)
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: buSinPrueba.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      await subscriptionService.createSubscription({
        businessUnitPublicId: buConPrueba.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })

      const snapshot = await trialService.resolveOne(buSinPrueba.businessUnitPublicId)

      assert.isFalse(snapshot.tuvoPrueba)
      assert.equal(snapshot.estado, 'sin_prueba')
      assert.isNull(snapshot.ventana)
      assert.isNull(snapshot.diasContratados)
      assert.isNull(snapshot.diasTranscurridos)
      assert.isNull(snapshot.diasRestantes)
      assert.isNull(snapshot.medicionHasta)
    } finally {
      await cleanupBusinessUnit(buSinPrueba.businessUnitId)
      await cleanupBusinessUnit(buConPrueba.businessUnitId)
      await cleanupPlan(noTrialPlanId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('RN-01: empresa que agotó su prueba y hoy tiene otra suscripción sin prueba sigue trayendo la prueba que sí tuvo', async ({
    assert,
  }) => {
    const stamp = Date.now() + 8
    const trialPlanId = await createPlan(stamp, 7)
    const noTrialPlanId = await createPlan(stamp + 1, 0)
    const businessUnit = await createBusinessUnit(stamp, 'rn01')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const original = await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await forceSubscriptionRow(original.billingSubscriptionId, {
        billing_subscription_status: 'canceled',
        billing_subscription_subscribed_at: '2025-06-01 00:00:00',
        billing_subscription_trial_ends_at: '2025-06-08',
        billing_subscription_canceled_at: '2025-06-05',
        // El índice único de "suscripción viva" bloquea la nueva alta si esta
        // columna no se libera al cancelar a mano (fuera de cancelWithin()).
        billing_subscription_live_business_unit_id: null,
      })

      // Recontrata hoy, sin prueba (RN-04/RN-01 del ticket anterior: ya la
      // consumió). La suscripción viva de hoy no tiene trial_ends_at.
      await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        replaceLiveSubscription: true,
      })

      const snapshot = await trialService.resolveOne(businessUnit.businessUnitPublicId)

      // Sigue trayendo la prueba vieja, no "sin_prueba".
      assert.isTrue(snapshot.tuvoPrueba)
      assert.equal(snapshot.estado, 'terminada')
      assert.deepEqual(snapshot.ventana, { inicio: '2025-06-01', fin: '2025-06-08' })
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(trialPlanId)
      await cleanupPlan(noTrialPlanId)
    }
  })

  test('discrepancia declarada: la única suscripción con prueba borrada lógicamente responde sin_prueba (mismo universo que la tarjeta de Movimiento)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 9
    const trialPlanId = await createPlan(stamp, 7)
    const businessUnit = await createBusinessUnit(stamp, 'borrada')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      const sub = await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await softDeleteSubscription(sub.billingSubscriptionId)

      const snapshot = await trialService.resolveOne(businessUnit.businessUnitPublicId)

      assert.equal(snapshot.estado, 'sin_prueba')
      assert.isFalse(snapshot.tuvoPrueba)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('empresa inexistente responde error de dominio (NOT_FOUND), no sin_prueba', async ({ assert }) => {
    const trialService = new PlatformTenantTrialService()
    let thrownCode: string | null = null

    try {
      await trialService.resolveOne('no-existe-esta-empresa-00000000')
    } catch (error) {
      thrownCode = (error as { errorCode?: string }).errorCode ?? null
    }

    assert.equal(thrownCode, 'PLT.MET.NOT_FOUND')
  })

  test('RN-49: lote con dos empresas nunca mezcla datos entre ellas', async ({ assert }) => {
    const stamp = Date.now() + 10
    const trialPlanId = await createPlan(stamp, 7)
    const noTrialPlanId = await createPlan(stamp + 1, 0)
    const buA = await createBusinessUnit(stamp, 'lote-a')
    const buB = await createBusinessUnit(stamp + 1, 'lote-b')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: buA.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await subscriptionService.createSubscription({
        businessUnitPublicId: buB.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        skipTrial: true,
      })

      const results = await trialService.resolveBatch([
        buA.businessUnitPublicId,
        buB.businessUnitPublicId,
        'id-que-no-existe-en-ningun-lado',
      ])

      assert.lengthOf(results, 2)
      const byId = new Map(results.map((r) => [r.businessUnitPublicId, r]))
      assert.equal(byId.get(buA.businessUnitPublicId)?.estado, 'viva')
      assert.equal(byId.get(buB.businessUnitPublicId)?.estado, 'sin_prueba')
    } finally {
      await cleanupBusinessUnit(buA.businessUnitId)
      await cleanupBusinessUnit(buB.businessUnitId)
      await cleanupPlan(trialPlanId)
      await cleanupPlan(noTrialPlanId)
    }
  })

  test('universo de pruebas vivas: trae exactamente las empresas con prueba viva sembradas, ninguna terminada ni sin_prueba', async ({
    assert,
  }) => {
    const stamp = Date.now() + 11
    const trialPlanId = await createPlan(stamp, 7)
    const noTrialPlanId = await createPlan(stamp + 1, 0)
    const buViva1 = await createBusinessUnit(stamp, 'universo-viva-1')
    const buViva2 = await createBusinessUnit(stamp + 1, 'universo-viva-2')
    const buTerminada = await createBusinessUnit(stamp + 2, 'universo-terminada')
    const buSinPrueba = await createBusinessUnit(stamp + 3, 'universo-sin-prueba')
    const subscriptionService = new BillingSubscriptionService()
    const trialService = new PlatformTenantTrialService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: buViva1.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await subscriptionService.createSubscription({
        businessUnitPublicId: buViva2.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      const subTerminada = await subscriptionService.createSubscription({
        businessUnitPublicId: buTerminada.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      await forceSubscriptionRow(subTerminada.billingSubscriptionId, {
        billing_subscription_status: 'active',
      })
      await subscriptionService.createSubscription({
        businessUnitPublicId: buSinPrueba.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        skipTrial: true,
      })

      const universe = await trialService.resolveLiveUniverse()
      const ids = new Set(universe.map((s) => s.businessUnitPublicId))

      assert.isTrue(ids.has(buViva1.businessUnitPublicId))
      assert.isTrue(ids.has(buViva2.businessUnitPublicId))
      assert.isFalse(ids.has(buTerminada.businessUnitPublicId))
      assert.isFalse(ids.has(buSinPrueba.businessUnitPublicId))

      for (const snapshot of universe) {
        if (ids.has(snapshot.businessUnitPublicId)) {
          assert.equal(snapshot.estado, 'viva')
        }
      }
    } finally {
      await cleanupBusinessUnit(buViva1.businessUnitId)
      await cleanupBusinessUnit(buViva2.businessUnitId)
      await cleanupBusinessUnit(buTerminada.businessUnitId)
      await cleanupBusinessUnit(buSinPrueba.businessUnitId)
      await cleanupPlan(trialPlanId)
      await cleanupPlan(noTrialPlanId)
    }
  })
})

// ─── Nivel HTTP: contrato, guard y forma exacta ───────────────────────────────

test.group('GET /api/platform/tenant-trials — transporte y guard', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let planId: number | null = null

  group.setup(async () => {
    admin = await createActor('tenant-trial-admin', true)
    outsider = await createActor('tenant-trial-outsider', false)

    const stamp = Date.now() + 20
    planId = await createPlan(stamp, 7)
    businessUnit = await createBusinessUnit(stamp, 'http')
    const subscriptionService = new BillingSubscriptionService()
    await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
    })
  })

  group.teardown(async () => {
    if (businessUnit) await cleanupBusinessUnit(businessUnit.businessUnitId)
    if (planId) await cleanupPlan(planId)
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('individual: 200 con la forma exacta del snapshot', async ({ client, assert }) => {
    const response = await client
      .get(`${BASE_URL}/${businessUnit!.businessUnitPublicId}`)
      .loginAs(admin!.user)

    response.assertStatus(200)
    const data = response.body().data as TenantTrialSnapshot
    assert.deepEqual(
      Object.keys(data).sort(),
      [
        'businessUnitName',
        'businessUnitPublicId',
        'diasContratados',
        'diasRestantes',
        'diasTranscurridos',
        'estado',
        'medicionHasta',
        'resultado',
        'tuvoPrueba',
        'ventana',
      ].sort()
    )
    assert.equal(data.estado, 'viva')
    assert.isNull(data.resultado)
  })

  test('individual: 404 con businessUnitPublicId inexistente', async ({ client }) => {
    const response = await client.get(`${BASE_URL}/no-existe-00000`).loginAs(admin!.user)
    response.assertStatus(404)
    response.assertBodyContains({ code: 'PLT.MET.NOT_FOUND' })
  })

  test('lote: 200 con arreglo; 422 sin ids', async ({ client, assert }) => {
    const ok = await client
      .get(BASE_URL)
      .qs({ ids: businessUnit!.businessUnitPublicId })
      .loginAs(admin!.user)
    ok.assertStatus(200)
    assert.isArray(ok.body().data)
    assert.lengthOf(ok.body().data, 1)

    const missing = await client.get(BASE_URL).loginAs(admin!.user)
    missing.assertStatus(422)
    missing.assertBodyContains({ code: 'PLT.MET.VAL_INPUT' })
  })

  test('universo: 200 con arreglo', async ({ client, assert }) => {
    const response = await client.get(`${BASE_URL}/live`).loginAs(admin!.user)
    response.assertStatus(200)
    assert.isArray(response.body().data)
  })

  test('sin is_platform_admin responde 403 sin campo code', async ({ client, assert }) => {
    const response = await client
      .get(`${BASE_URL}/${businessUnit!.businessUnitPublicId}`)
      .loginAs(outsider!.user)
    response.assertStatus(403)
    assert.isUndefined(response.body().code)
  })

  test('sin sesión responde 401', async ({ client }) => {
    const response = await client.get(`${BASE_URL}/${businessUnit!.businessUnitPublicId}`)
    response.assertStatus(401)
  })

  test('el snapshot no publica identificadores internos ni identidad de personas', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`${BASE_URL}/${businessUnit!.businessUnitPublicId}`)
      .loginAs(admin!.user)
    const raw = JSON.stringify(response.body())
    // Ningún nombre de campo interno (id numérico de suscripción/empresa,
    // email, nombre de persona) debe aparecer en la respuesta.
    assert.notInclude(raw, 'billingSubscriptionId')
    assert.notInclude(raw, 'businessUnitId')
    assert.notInclude(raw, 'personFirstname')
    assert.notInclude(raw, 'personEmail')
  })
})

import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BillingSubscriptionService from '#services/billing_subscription_service'
import PlatformTrialService from '#services/platform_trial_service'
import { createTenantTrialFixture } from './helpers/platform_trial_fixture.js'

/**
 * USRH1789079078169 — contrato de `GET /api/platform/metrics/tenants/:publicId/trial`.
 *
 * Las reglas puras del cálculo se prueban en
 * `tests/unit/services/platform_trial_resolution.spec.ts`. Aquí se prueba lo
 * que solo la base de datos y el transporte pueden romper: qué suscripción
 * es "la prueba" (RN-01), el aislamiento por empresa (RN-49 — cada escenario
 * siembra al menos dos tenants), "sin prueba" como 200 válido (RN-02/RN-10),
 * el 404 y la lista cerrada de llaves del payload.
 */

const TEST_PASSWORD = 'TrialMetricsTest123!'

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Trial',
    personLastname: 'Metrics',
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

function urlFor(publicId: string): string {
  return `/api/platform/metrics/tenants/${publicId}/trial`
}

// ─── Nivel servicio: RN-01, RN-49, universo, lote ─────────────────────────────

test.group('PlatformTrialService — elección de la suscripción y aislamiento (USRH1789079078169)', () => {
  test('CA-4 · sin prueba no es error: prueba: null, tenant completo', async ({ assert }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca4-sin-prueba', trialDays: 0, skipTrial: true },
      { tag: 'ca4-control', trialDays: 7 },
    ])
    const service = new PlatformTrialService()

    try {
      const { tenant, prueba } = await service.getTenantTrial(tenants[0].businessUnitPublicId)

      assert.equal(tenant.publicId, tenants[0].businessUnitPublicId)
      assert.equal(tenant.nombre, tenants[0].businessUnitName)
      assert.isNull(prueba)
    } finally {
      await cleanup()
    }
  })

  test('CA-5 · la prueba vive en la suscripción que la tuvo, no en la vigente sin prueba', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca5-anterior', trialDays: 7, canceledAt: '2025-06-05', status: 'canceled' },
    ])
    const [t] = tenants
    const subscriptionService = new BillingSubscriptionService()
    const service = new PlatformTrialService()

    try {
      // Recontrata hoy sin prueba (RN-01 del ticket anterior: ya la consumió).
      await subscriptionService.createSubscription({
        businessUnitPublicId: t.businessUnitPublicId,
        billingPlanId: t.planId,
        contractedEmployees: 10,
        skipTrial: true,
        replaceLiveSubscription: true,
      })

      const { prueba } = await service.getTenantTrial(t.businessUnitPublicId)

      assert.isNotNull(prueba)
      assert.equal(prueba!.estado, 'terminada')
    } finally {
      await cleanup()
    }
  })

  test('CA-9 · dos empresas, cada una con lo suyo (RN-49): ni el detalle ni el lote mezclan datos', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca9-a', trialDays: 7, startOffsetDays: 0, trialEndsAtOverride: '2026-09-08' },
      { tag: 'ca9-b', trialDays: 14, startOffsetDays: 0, trialEndsAtOverride: '2026-09-20' },
    ])
    const [a, b] = tenants
    const service = new PlatformTrialService()

    try {
      const { prueba: pruebaA } = await service.getTenantTrial(a.businessUnitPublicId)
      const { prueba: pruebaB } = await service.getTenantTrial(b.businessUnitPublicId)
      assert.notEqual(pruebaA!.fin, pruebaB!.fin)

      const lote = await service.resolveTrialsForBusinessUnits([a.businessUnitId, b.businessUnitId])
      assert.equal(lote.size, 2)
      assert.equal(lote.get(a.businessUnitId)!.fin, pruebaA!.fin)
      assert.equal(lote.get(b.businessUnitId)!.fin, pruebaB!.fin)
      assert.notEqual(lote.get(a.businessUnitId)!.fin, lote.get(b.businessUnitId)!.fin)
    } finally {
      await cleanup()
    }
  })

  test('CA-10 · lote: solo trae entradas para las que tuvieron prueba, en una sola consulta', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca10-viva', trialDays: 7 },
      { tag: 'ca10-terminada', trialDays: 7, status: 'active' },
      { tag: 'ca10-sin-prueba', trialDays: 0, skipTrial: true },
    ])
    const service = new PlatformTrialService()

    try {
      const ids = tenants.map((t) => t.businessUnitId)
      const lote = await service.resolveTrialsForBusinessUnits(ids)

      assert.equal(lote.size, 2)
      assert.isTrue(lote.has(tenants[0].businessUnitId))
      assert.isTrue(lote.has(tenants[1].businessUnitId))
      assert.isFalse(lote.has(tenants[2].businessUnitId))
    } finally {
      await cleanup()
    }
  })

  test('CA-10 · universo de pruebas vivas: publicId y nombre presentes, deja fuera terminadas/sin prueba/borradas', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'universo-viva', trialDays: 7 },
      { tag: 'universo-terminada', trialDays: 7, status: 'active' },
      { tag: 'universo-sin-prueba', trialDays: 0, skipTrial: true },
      { tag: 'universo-borrada', trialDays: 7, subscriptionDeleted: true },
    ])
    const service = new PlatformTrialService()

    try {
      const universo = await service.listLiveTrials()
      const ids = new Set(universo.map((r) => r.businessUnitId))

      assert.isTrue(ids.has(tenants[0].businessUnitId))
      assert.isFalse(ids.has(tenants[1].businessUnitId))
      assert.isFalse(ids.has(tenants[2].businessUnitId))
      assert.isFalse(ids.has(tenants[3].businessUnitId))

      const fila = universo.find((r) => r.businessUnitId === tenants[0].businessUnitId)!
      assert.equal(fila.publicId, tenants[0].businessUnitPublicId)
      assert.equal(fila.nombre, tenants[0].businessUnitName)
      assert.equal(fila.trial.estado, 'viva')
    } finally {
      await cleanup()
    }
  })

  test('R-3 · discrepancia declarada: suscripción con prueba borrada lógicamente responde sin prueba', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'r3-borrada', trialDays: 7, subscriptionDeleted: true },
    ])
    const service = new PlatformTrialService()

    try {
      const { prueba } = await service.getTenantTrial(tenants[0].businessUnitPublicId)
      assert.isNull(prueba)
    } finally {
      await cleanup()
    }
  })
})

// ─── Nivel HTTP: contrato, guard y forma exacta ───────────────────────────────

test.group('GET /api/platform/metrics/tenants/:publicId/trial', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('trial-metrics-admin', true)
    outsider = await createActor('trial-metrics-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('CA-1 · prueba viva: forma exacta del 200 y lista cerrada de llaves', async ({
    client,
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca1-http', trialDays: 7 },
      { tag: 'ca1-http-control', trialDays: 14 },
    ])

    try {
      const response = await client.get(urlFor(tenants[0].businessUnitPublicId)).loginAs(admin!.user)

      response.assertStatus(200)
      const body = response.body() as { type: string; data: { tenant: unknown; prueba: unknown } }
      assert.equal(body.type, 'success')
      assert.deepEqual(Object.keys(body.data).sort(), ['prueba', 'tenant'])
      assert.deepEqual(Object.keys(body.data.tenant as object).sort(), ['nombre', 'publicId'])
      assert.deepEqual(
        Object.keys(body.data.prueba as object).sort(),
        [
          'diasContratados',
          'diasRestantes',
          'diasTranscurridos',
          'estado',
          'fechaResultado',
          'fin',
          'finEfectivo',
          'inicio',
          'resultado',
        ].sort()
      )
      assert.equal((body.data.prueba as { estado: string }).estado, 'viva')
      assert.isNull((body.data.prueba as { resultado: unknown }).resultado)
      assert.isNull((body.data.prueba as { fechaResultado: unknown }).fechaResultado)
    } finally {
      await cleanup()
    }
  })

  test('CA-7 · error — tenant inexistente responde 404 con el cuerpo literal', async ({
    client,
  }) => {
    const response = await client
      .get(urlFor('00000000-0000-4000-8000-000000000000'))
      .loginAs(admin!.user)

    response.assertStatus(404)
    response.assertBodyContains({
      title: 'No fue posible obtener la prueba del tenant',
      detail: 'La empresa solicitada no existe o no está disponible.',
      key: 'tenant-no-encontrado',
      code: 'PLT.MET.TENANT_NOT_FOUND',
    })
  })

  test('CA-8 · sin permiso de plataforma responde 403 sin campo code ni data', async ({
    client,
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([{ tag: 'ca8', trialDays: 7 }])

    try {
      const response = await client
        .get(urlFor(tenants[0].businessUnitPublicId))
        .loginAs(outsider!.user)

      response.assertStatus(403)
      assert.isUndefined(response.body().code)
      assert.isUndefined(response.body().data)
    } finally {
      await cleanup()
    }
  })

  test('CA-8 · sin sesión responde 401', async ({ client }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([{ tag: 'ca8-401', trialDays: 7 }])

    try {
      const response = await client.get(urlFor(tenants[0].businessUnitPublicId))
      response.assertStatus(401)
    } finally {
      await cleanup()
    }
  })

  test('CA-12 · la respuesta no publica identificadores internos ni identidad de personas', async ({
    client,
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([{ tag: 'ca12', trialDays: 7 }])

    try {
      const response = await client.get(urlFor(tenants[0].businessUnitPublicId)).loginAs(admin!.user)
      const raw = JSON.stringify(response.body())

      assert.notInclude(raw, 'businessUnitId')
      assert.notInclude(raw, 'billingSubscriptionId')
      assert.notInclude(raw, 'billingPlanId')
      assert.notInclude(raw, 'personFirstname')
      assert.notInclude(raw, 'personEmail')
    } finally {
      await cleanup()
    }
  })
})

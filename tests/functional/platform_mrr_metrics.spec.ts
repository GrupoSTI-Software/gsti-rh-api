import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'

/**
 * USRH1788052455653 — contrato de `GET /api/platform/metrics/mrr`.
 *
 * Las reglas del cálculo se prueban en `platform_mrr_service.spec.ts`. Aquí se
 * prueba lo que solo el transporte puede romper: que la ruta exista (el import
 * a mano de `start/routes.ts`), la forma exacta del payload, los dos guards y
 * que el endpoint no tenga entrada que validar.
 */

const TEST_PASSWORD = 'MrrMetricsTest123!'
const BASE_URL = '/api/platform/metrics/mrr'

/** Llaves exactas del payload. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_DATA_KEYS = [
  'calculadoAl',
  'monedas',
  'mrrActualNetoCents',
  'mrrProyectadoTrialCents',
  'suscripcionesActivas',
  'suscripcionesEnPrueba',
]

interface TestActor {
  user: User
  person: Person
}

interface MrrBody {
  mrrActualNetoCents: number
  suscripcionesActivas: number
  mrrProyectadoTrialCents: number
  suscripcionesEnPrueba: number
  monedas: Array<{ codigo: string; suscripciones: number }>
  calculadoAl: string
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'Mrr',
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

test.group('GET /api/platform/metrics/mrr', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('mrr-admin', true)
    outsider = await createActor('mrr-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('la ruta existe y responde el envelope del área', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)

    // Un 404 aquí significa que falta la línea de import en `start/routes.ts`.
    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(Object.keys(response.body().data).sort(), EXPECTED_DATA_KEYS)
    assert.isUndefined(response.body().meta)
  })

  test('las cuatro cifras son enteros y la fecha es de calendario', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody

    assert.isTrue(Number.isInteger(data.mrrActualNetoCents))
    assert.isTrue(Number.isInteger(data.suscripcionesActivas))
    assert.isTrue(Number.isInteger(data.mrrProyectadoTrialCents))
    assert.isTrue(Number.isInteger(data.suscripcionesEnPrueba))
    assert.match(data.calculadoAl, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('CA-3 — el payload no trae ningún campo que sea la suma de las dos cifras', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody
    const suma = data.mrrActualNetoCents + data.mrrProyectadoTrialCents

    assert.notInclude(Object.values(data), suma)
    assert.notInclude(JSON.stringify(data), '"mrrTotal')
  })

  test('el agregado no publica identidad de clientes', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const raw = JSON.stringify(response.body())

    for (const prohibido of [
      'businessUnitPublicId',
      'business_unit_id',
      'billingSubscriptionId',
      'rfc',
      'billingEmail',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })

  test('CA-10 — cada moneda viaja con su código y su conteo, y nada más', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody

    assert.isArray(data.monedas)
    for (const moneda of data.monedas) {
      assert.deepEqual(Object.keys(moneda).sort(), ['codigo', 'suscripciones'])
      assert.isTrue(Number.isInteger(moneda.suscripciones))
    }
  })

  test('sin is_platform_admin responde 403 sin campo code', async ({ client, assert }) => {
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

  test('no hay 422: el endpoint no recibe entrada y los query params sobrantes se ignoran', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ page: 'no-soy-un-numero', limit: 5000, groupBy: 'grupo' })
      .loginAs(admin!.user)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })
})

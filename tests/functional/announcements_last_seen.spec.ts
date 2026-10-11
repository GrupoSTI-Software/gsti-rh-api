import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Person from '#models/person'
import UserAnnouncementState from '#models/user_announcement_state'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales — marca de anuncios por usuario (`/api/announcements/me`).
 *
 * Convenciones (siguiendo `consent_acceptance.spec.ts`): usuarios de prueba con email
 * único, sin transacciones, cleanup explícito en `group.teardown`; `client.loginAs(user)`
 * emite un access token real.
 */

const TEST_PASSWORD = 'AnnouncementsTest123!'
const DEFAULT_ROLE = 'rh-manager' // la marca es personal (sin RBAC): cualquier rol autenticado aplica.

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(emailPrefix: string): Promise<TestActor> {
  const email = `announcements-${emailPrefix}-${randomUUID()}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'Announcements'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  const role = await ensureRole(DEFAULT_ROLE)
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await UserAnnouncementState.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('Anuncios /api/announcements/me - auth (401 sin autenticación)', () => {
  test('GET responde 401', async ({ client }) => {
    const response = await client.get('/api/announcements/me')
    response.assertStatus(401)
  })

  test('PUT responde 401', async ({ client }) => {
    const response = await client
      .put('/api/announcements/me')
      .json({ lastSeenAt: DateTime.utc().toISO() })
    response.assertStatus(401)
  })
})

test.group('Anuncios /api/announcements/me - flujo de la marca', (group) => {
  let actor: TestActor | null = null
  const firstSeen = '2026-01-15T10:30:00.250Z'
  const laterSeen = '2026-02-20T08:00:00.500Z'

  group.setup(async () => {
    actor = await createTestActor('flujo')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('GET sin fila responde lastSeenAt:null y no crea registro', async ({ client, assert }) => {
    const response = await client.get('/api/announcements/me').loginAs(actor!.user)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(response.body().data, { lastSeenAt: null })

    const rows = await UserAnnouncementState.query().where('user_id', actor!.user.userId)
    assert.lengthOf(rows, 0)
  })

  test('PUT crea la marca y la devuelve en ISO UTC con milisegundos', async ({ client, assert }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: firstSeen })

    response.assertStatus(200)
    assert.deepEqual(response.body().data, { lastSeenAt: firstSeen })

    const rows = await UserAnnouncementState.query().where('user_id', actor!.user.userId)
    assert.lengthOf(rows, 1)
  })

  test('PUT con offset distinto de UTC se normaliza y avanza la marca', async ({
    client,
    assert,
  }) => {
    // 2026-02-20T02:00:00.500-06:00 == laterSeen
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: '2026-02-20T02:00:00.500-06:00' })

    response.assertStatus(200)
    assert.deepEqual(response.body().data, { lastSeenAt: laterSeen })
  })

  test('PUT con una fecha anterior no retrocede: responde 200 con la vigente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: firstSeen })

    response.assertStatus(200)
    assert.deepEqual(response.body().data, { lastSeenAt: laterSeen })
  })

  test('PUT con la misma fecha conserva la vigente y no duplica la fila', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: laterSeen })

    response.assertStatus(200)
    assert.deepEqual(response.body().data, { lastSeenAt: laterSeen })

    const rows = await UserAnnouncementState.query().where('user_id', actor!.user.userId)
    assert.lengthOf(rows, 1)
  })

  test('GET posterior devuelve la marca vigente', async ({ client, assert }) => {
    const response = await client.get('/api/announcements/me').loginAs(actor!.user)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, { lastSeenAt: laterSeen })
  })
})

test.group('Anuncios /api/announcements/me - validación (422)', (group) => {
  let actor: TestActor | null = null

  group.setup(async () => {
    actor = await createTestActor('validacion')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('PUT más de 5 minutos en el futuro responde 422 fecha-en-el-futuro y no crea fila', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: DateTime.utc().plus({ minutes: 10 }).toISO() })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'fecha-en-el-futuro')
    assert.isString(body.title)
    assert.isString(body.detail)

    const rows = await UserAnnouncementState.query().where('user_id', actor!.user.userId)
    assert.lengthOf(rows, 0)
  })

  test('PUT dentro de la tolerancia de reloj (1 minuto en el futuro) se acepta', async ({
    client,
  }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: DateTime.utc().plus({ minutes: 1 }).toISO() })

    response.assertStatus(200)
  })

  test('PUT sin zona horaria responde 422 fecha-invalida', async ({ client, assert }) => {
    const response = await client
      .put('/api/announcements/me')
      .loginAs(actor!.user)
      .json({ lastSeenAt: '2026-01-15T10:30:00' })

    response.assertStatus(422)
    assert.equal(response.body().key, 'fecha-invalida')
  })

  test('PUT sin lastSeenAt responde 422 fecha-invalida', async ({ client, assert }) => {
    const response = await client.put('/api/announcements/me').loginAs(actor!.user).json({})

    response.assertStatus(422)
    assert.equal(response.body().key, 'fecha-invalida')
  })
})

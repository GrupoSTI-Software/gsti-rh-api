import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import User from '#models/user'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Unicidad de la credencial de acceso (USRH1789698261611).
 * Nueve casos del spec §5, uno por nombre. Tres siembran fuera de HTTP
 * (CA-5, CA-6, CA-9) y son los que no se recortan (riesgo R2).
 *
 * El actor usa los slugs reales del catálogo (módulo `users`, permisos
 * `create`/`update`): con otros slugs el gate respondería 403 antes de llegar
 * a la regla que cada caso prueba. Todo lo creado con `userEmailType`
 * `institutional` para no cruzar el permiso de escritura `contacto` (solo la
 * rama `personal` lo exige) y sin filas de empleado, así que el alta no
 * sincroniza nada fuera de `users`. CA-3 espera 201: es lo que el controlador
 * responde en un update exitoso (igual que el molde de aislamiento).
 */

const TEST_PASSWORD = 'MailUniqAccess123!'

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Unicidad del correo de acceso', (group) => {
  let actor: TenantActor | null = null
  const userIds: number[] = []
  const personIds: number[] = []

  group.setup(async () => {
    actor = await createTenantActor('mailuniq')
    await grantModulePermissions(actor, 'users', ['create', 'update'])
  })

  group.teardown(async () => {
    if (userIds.length > 0) {
      await db.from('business_unit_users').whereIn('user_id', userIds).delete()
      await db.from('users').whereIn('user_id', userIds).delete()
    }
    if (personIds.length > 0) {
      await db.from('people').whereIn('person_id', personIds).delete()
    }
    await cleanupTenantActor(actor)
    actor = null
  })

  async function createPerson(tag: string, email: string): Promise<Person> {
    const tenant = required(actor, 'el actor')
    const person = await Person.create({
      personFirstname: 'MailUniq',
      personLastname: 'Test',
      personSecondLastname: tag,
      personEmail: email,
      // Sin empresa, la persona es invisible para el `Person.query()` con
      // scope de tenant que `verifyInfoExist` corre dentro del POST.
      businessUnitId: tenant.businessUnit.businessUnitId,
    })
    personIds.push(person.personId)
    return person
  }

  /** Siembra directa en BD: la capa del índice, sin pasar por HTTP. */
  async function seedLiveUser(email: string, active: number = 1): Promise<User> {
    const tenant = required(actor, 'el actor')
    const person = await createPerson('seed', `persona-${uniqueStamp()}@gsti-tests.local`)
    const user = await User.create({
      userEmail: email,
      userPassword: TEST_PASSWORD,
      userActive: active,
      roleId: tenant.role.roleId,
      personId: person.personId,
      userEmailType: 'institutional',
    })
    userIds.push(user.userId)
    return user
  }

  function newUserBody(tenant: TenantActor, person: Person, email: string): Record<string, unknown> {
    return {
      userEmail: email,
      userActive: true,
      roleId: tenant.role.roleId,
      personId: person.personId,
      userEmailType: 'institutional',
    }
  }

  async function postUser(client: ApiClient, tenant: TenantActor, body: Record<string, unknown>) {
    return client.post('/api/users').loginAs(tenant.user).headers(businessUnitHeaders(tenant)).json(body)
  }

  async function putUser(
    client: ApiClient,
    tenant: TenantActor,
    userId: number,
    body: Record<string, unknown>
  ) {
    return client
      .put(`/api/users/${userId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json(body)
  }

  /** Alta por HTTP que debe tener éxito: registra el usuario para la limpieza. */
  async function postUserOrFail(
    client: ApiClient,
    tenant: TenantActor,
    email: string
  ): Promise<{ userId: number; personId: number }> {
    const person = await createPerson('alta', `persona-${uniqueStamp()}@gsti-tests.local`)
    const response = await postUser(client, tenant, newUserBody(tenant, person, email))
    response.assertStatus(201)
    const body = response.body() as { data: { user: { userId: number } } }
    userIds.push(body.data.user.userId)
    return { userId: body.data.user.userId, personId: person.personId }
  }

  async function liveUsersByEmail(email: string): Promise<User[]> {
    return User.query().whereNull('user_deleted_at').where('user_email', email)
  }

  test('CA-1 alta-con-correo-de-usuario-vivo', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const email = `ca1-vivo-${uniqueStamp()}@gsti-tests.local`
    const created = await postUserOrFail(client, tenant, email)

    const duplicatePerson = await createPerson('duplicada', `persona-${uniqueStamp()}@gsti-tests.local`)
    const response = await postUser(client, tenant, newUserBody(tenant, duplicatePerson, email))

    assertDuplicatedResponse(assert, response)

    const live = await liveUsersByEmail(email)
    assert.lengthOf(live, 1, 'el 400 no debe dejar una segunda fila viva')
    assert.equal(live[0].userId, created.userId)
    assert.equal(live[0].userEmail, email)
  })

  test('CA-2 edicion-con-correo-de-otro-usuario-vivo', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const emailA = `ca2-a-${uniqueStamp()}@gsti-tests.local`
    const emailB = `ca2-b-${uniqueStamp()}@gsti-tests.local`
    const userA = await postUserOrFail(client, tenant, emailA)
    const userB = await postUserOrFail(client, tenant, emailB)

    const beforeA = await snapshotUser(userA.userId)
    const beforeB = await snapshotUser(userB.userId)

    const response = await putUser(client, tenant, userA.userId, {
      userEmail: emailB,
      userActive: true,
      roleId: tenant.role.roleId,
      personId: userA.personId,
      userEmailType: 'institutional',
    })

    assertDuplicatedResponse(assert, response)

    const afterA = await snapshotUser(userA.userId)
    const afterB = await snapshotUser(userB.userId)
    assert.deepEqual(afterA, beforeA, 'la fila A no debe cambiar ante el 400')
    assert.deepEqual(afterB, beforeB, 'la fila B no debe cambiar ante el 400')
  })

  test('CA-3 edicion-conservando-el-propio-correo', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const email = `ca3-propio-${uniqueStamp()}@gsti-tests.local`
    const created = await postUserOrFail(client, tenant, email)

    const response = await putUser(client, tenant, created.userId, {
      userEmail: email,
      userActive: false,
      roleId: tenant.role.roleId,
      personId: created.personId,
      userEmailType: 'institutional',
    })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))

    const reloaded = await User.findOrFail(created.userId)
    assert.equal(reloaded.userEmail, email)
    assert.equal(reloaded.userActive, 0)
  })

  test('CA-4 alta-con-correo-de-usuario-dado-de-baja', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const email = `ca4-baja-${uniqueStamp()}@gsti-tests.local`
    const created = await postUserOrFail(client, tenant, email)

    const holder = await User.findOrFail(created.userId)
    await holder.delete()

    const trashed = await User.query()
      .withTrashed()
      .where('user_id', created.userId)
      .whereNotNull('user_deleted_at')
      .first()
    assert.isNotNull(trashed, 'el titular debe quedar con borrado lógico')

    const reused = await postUserOrFail(client, tenant, email)
    assert.notEqual(reused.userId, created.userId)

    const live = await liveUsersByEmail(email)
    assert.lengthOf(live, 1)
    assert.equal(live[0].userId, reused.userId)
  })

  test('CA-5 n-borrados-con-el-mismo-correo-conviven', async ({ assert }) => {
    const email = `ca5-borradas-${uniqueStamp()}@gsti-tests.local`

    const deletedIds: number[] = []
    for (let index = 0; index < 3; index++) {
      const seed = await seedLiveUser(email)
      await seed.delete()
      deletedIds.push(seed.userId)
    }

    const trashed = await User.query()
      .withTrashed()
      .whereIn('user_id', deletedIds)
      .whereNotNull('user_deleted_at')
      .where('user_email', email)
    assert.lengthOf(trashed, 3, 'las tres borradas con el mismo correo conviven')

    const firstLive = await seedLiveUser(email)
    const liveAfterFirst = await liveUsersByEmail(email)
    assert.lengthOf(liveAfterFirst, 1)
    assert.equal(liveAfterFirst[0].userId, firstLive.userId)

    const tenant = required(actor, 'el actor')
    const extraPerson = await createPerson('extra', `persona-${uniqueStamp()}@gsti-tests.local`)
    let secondLiveError: unknown = null
    try {
      await User.create({
        userEmail: email,
        userPassword: TEST_PASSWORD,
        userActive: 1,
        roleId: tenant.role.roleId,
        personId: extraPerson.personId,
        userEmailType: 'institutional',
      })
    } catch (error: unknown) {
      secondLiveError = error
    }
    assertDupIndexError(assert, secondLiveError)

    const liveAfterSecond = await liveUsersByEmail(email)
    assert.lengthOf(liveAfterSecond, 1, 'la segunda viva no debe quedar guardada')

    const toResurrect = await User.query()
      .withTrashed()
      .where('user_id', deletedIds[0])
      .firstOrFail()
    toResurrect.deletedAt = null
    let resurrectError: unknown = null
    try {
      await toResurrect.save()
    } catch (error: unknown) {
      resurrectError = error
    }
    assertDupIndexError(assert, resurrectError)
  })

  test('CA-6 alta-con-correo-de-usuario-inactivo-no-borrado', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const email = `ca6-inactivo-${uniqueStamp()}@gsti-tests.local`
    await seedLiveUser(email, 0)

    const duplicatePerson = await createPerson('duplicada', `persona-${uniqueStamp()}@gsti-tests.local`)
    const response = await postUser(client, tenant, newUserBody(tenant, duplicatePerson, email))

    assertDuplicatedResponse(assert, response)

    const live = await liveUsersByEmail(email)
    assert.lengthOf(live, 1, 'el 400 no debe dejar una segunda fila viva')
  })

  test('CA-7 variante-de-mayusculas', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const email = `ca7-juan-${uniqueStamp()}@gsti-tests.local`
    await postUserOrFail(client, tenant, email)

    const duplicatePerson = await createPerson('duplicada', `persona-${uniqueStamp()}@gsti-tests.local`)
    const response = await postUser(client, tenant, newUserBody(tenant, duplicatePerson, email.toUpperCase()))

    assertDuplicatedResponse(assert, response)

    const live = await liveUsersByEmail(email)
    assert.lengthOf(live, 1, 'el 400 no debe dejar una segunda fila viva')
  })

  test('CA-8 variante-de-acento', async ({ assert, client }) => {
    const tenant = required(actor, 'el actor')
    const stamp = uniqueStamp()
    const email = `ca8-jose-${stamp}@gsti-tests.local`
    const accented = `ca8-josé-${stamp}@gsti-tests.local`
    await postUserOrFail(client, tenant, email)

    const duplicatePerson = await createPerson('duplicada', `persona-${uniqueStamp()}@gsti-tests.local`)
    const response = await postUser(client, tenant, newUserBody(tenant, duplicatePerson, accented))

    assertDuplicatedResponse(assert, response)

    const live = await liveUsersByEmail(email)
    assert.lengthOf(live, 1, 'el 400 no debe dejar una segunda fila viva')
  })

  test('CA-9 espacios-alrededor-del-correo', async ({ assert }) => {
    const trimmed = `ca9-espacios-${uniqueStamp()}@gsti-tests.local`
    const spaced = `${trimmed} `
    const seed = await seedLiveUser(spaced)
    assert.equal(seed.userEmail, spaced)

    const generated = (await db
      .from('users')
      .select('user_email_active')
      .where('user_id', seed.userId)) as Array<{ user_email_active: string }>
    assert.equal(generated[0]?.user_email_active, trimmed, 'la generada recorta los espacios')

    const tenant = required(actor, 'el actor')
    const extraPerson = await createPerson('extra', `persona-${uniqueStamp()}@gsti-tests.local`)
    let duplicateError: unknown = null
    try {
      await User.create({
        userEmail: trimmed,
        userPassword: TEST_PASSWORD,
        userActive: 1,
        roleId: tenant.role.roleId,
        personId: extraPerson.personId,
        userEmailType: 'institutional',
      })
    } catch (error: unknown) {
      duplicateError = error
    }
    assertDupIndexError(assert, duplicateError)

    const live = await User.query()
      .whereNull('user_deleted_at')
      .whereIn('user_email', [trimmed, spaced])
    assert.lengthOf(live, 1, 'la segunda viva no debe quedar guardada')
  })
})

/** Foto plana de la cuenta para probar que el 400 no alteró nada. */
async function snapshotUser(userId: number): Promise<Record<string, unknown>> {
  const user = await User.findOrFail(userId)
  return {
    userId: user.userId,
    userEmail: user.userEmail,
    userActive: user.userActive,
    roleId: user.roleId,
    personId: user.personId,
    userEmailType: user.userEmailType,
  }
}

/** El cuerpo exacto de USR.MAIL.002: forma fija más `key` y `code` literales. */
function assertDuplicatedResponse(assert: Assert, response: ApiResponse): void {
  assert.equal(response.status(), 400, JSON.stringify(response.body()))
  const body = response.body() as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), ['code', 'detail', 'key', 'title'])
  assert.equal(body.key, 'correo-de-acceso-ya-registrado')
  assert.equal(body.code, 'USR.MAIL.002')
  assert.isString(body.title)
  assert.isString(body.detail)
}

function isDupIndexError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as Record<string, unknown>
  return record.code === 'ER_DUP_ENTRY' || record.errno === 1062
}

function assertDupIndexError(assert: Assert, error: unknown): void {
  assert.isTrue(isDupIndexError(error), `se esperaba ER_DUP_ENTRY, llegó: ${String(error)}`)
}

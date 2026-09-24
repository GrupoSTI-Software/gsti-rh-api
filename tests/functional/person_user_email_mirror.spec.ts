import { test } from '@japa/runner'
import User from '#models/user'
import {
  businessUnitHeader,
  cleanupMirrorWorld,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  readUserRow,
  stamp,
  userBody,
  type MirrorWorld,
} from './person_user_email_mirror_support.js'

/**
 * USRH1789698261612 — espejo entre el correo del expediente y la credencial,
 * sobre los cuatro endpoints, verificado leyendo la BD (no el status).
 */

let world: MirrorWorld | null = null

test.group('Espejo correo ↔ credencial — tipo de correo (CA-6)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('CA-6 tipo-fuera-del-enum-se-rechaza-al-capturar en POST', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca6-${stamp()}@correo.com`)
    for (const invalid of ['Personal', '', 'otro']) {
      const response = await client
        .post('/api/users')
        .loginAs(w.full.user)
        .headers(businessUnitHeader(w.full.businessUnit))
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json({
          userEmail: `ca6-${stamp()}@correo.com`,
          userActive: true,
          roleId: w.full.role.roleId,
          personId: person.personId,
          userEmailType: invalid,
        })
      assert.oneOf(response.status(), [422, 500], `status para "${invalid}"`)
      assert.notEqual(response.status(), 201)
      const created = await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first()
      assert.isNull(created)
    }
  })

  test('CA-6 tipo-fuera-del-enum-se-rechaza-al-capturar en PUT', async ({ client, assert }) => {
    const w = world!
    const email = `ca6-put-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: email,
      userEmailType: 'personal',
    })
    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json(userBody(user, { userEmail: `nuevo-${email}`, userEmailType: 'Personal' }))
    assert.notEqual(response.status(), 201)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
  })
})

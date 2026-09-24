import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import User from '#models/user'
import type Employee from '#models/employee'
import type Person from '#models/person'
import {
  assertNoDisclosure,
  businessUnitHeader,
  cleanupMirrorWorld,
  createEmployeeFor,
  createForeignBusinessUnit,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  employeeBody,
  personBody,
  readEmployeeRow,
  readPersonEmail,
  readPersonFirstname,
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

test.group('Espejo — PUT /api/employees/:id (M6)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putEmployee(client: ApiClient, employee: Employee, overrides: Record<string, unknown>) {
    const w = world!
    return client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, overrides))
  }

  test('CA-3 empleado-actualiza-solo-la-credencial-institucional: personal no cambia', async ({ client, assert }) => {
    const w = world!
    const personal = `ca3-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca3-e-${stamp()}@empresa.com`)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: personal, userEmailType: 'personal' })
    const nuevo = `ca3-nuevo-${stamp()}@empresa.com`

    const response = await putEmployee(client, employee, { employeeBusinessEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'email-type-mismatch' })
    const userRow = await readUserRow(user.userId)
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(userRow.user_email, personal)
    assert.equal(employeeRow.employee_business_email, nuevo)
  })

  test('CA-3 institucional: la credencial toma el valor PERSISTIDO', async ({ client, assert }) => {
    const w = world!
    const viejo = `ca3i-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })
    const nuevo = `ca3i-nuevo-${stamp()}@empresa.com`

    const response = await putEmployee(client, employee, { employeeBusinessEmail: `  ${nuevo}  ` })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'users' })
    const persistedEmployee = await readEmployeeRow(employee.employeeId)
    const persistedUser = await readUserRow(user.userId)
    assert.equal(persistedUser.user_email, persistedEmployee.employee_business_email.trim())
  })

  test('CA-10 sin cuenta de acceso: la omisión se declara (no-live-counterpart)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca10-${stamp()}@empresa.com`)
    const response = await putEmployee(client, employee, { employeeBusinessEmail: `ca10-n-${stamp()}@empresa.com` })
    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('E8 correo institucional de otro empleado vivo: rechazo de validación y nada cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `e8-ocupado-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const propio = `e8-propio-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, propio)

    const response = await putEmployee(client, employee, { employeeBusinessEmail: ocupado })

    response.assertStatus(400)
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, propio)
  })

  test('E8 reenviar el mismo correo propio no choca consigo mismo', async ({ client }) => {
    const w = world!
    const propio = `e8-mismo-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, propio)
    const response = await putEmployee(client, employee, { employeeBusinessEmail: propio })
    response.assertStatus(201)
  })

  test('CA-8 correo de otra cuenta viva: 400 USR.MAIL.002, nada cambia y sin divulgación', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8-${stamp()}@empresa.com`
    const otraPersona = await createPersonIn(w.registry, w.full.businessUnit, null)
    const otro = await createUserFor(w.registry, otraPersona, w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const viejo = `ca8-viejo-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })

    const response = await putEmployee(client, employee, { employeeBusinessEmail: ocupado, employeeFirstName: 'Cambiado' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.002')
    assert.equal(response.body().key, 'correo-de-acceso-ya-registrado')
    assertNoDisclosure(assert, response.body(), [ocupado, otro.userId, user.userId, employee.employeeId])
    const row = await readEmployeeRow(employee.employeeId)
    assert.equal(row.employee_business_email, viejo)
    assert.equal(row.employee_first_name, 'Espejo')
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, viejo)
  })
})

test.group('Espejo — PUT /api/persons/:id (M1)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putPerson(client: ApiClient, person: Person, overrides: Record<string, unknown>) {
    const w = world!
    return client
      .put(`/api/persons/${person.personId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(personBody(person, overrides))
  }

  test('CA-1 expediente-actualiza-la-credencial-personal aunque el correo previo sea NULL', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: `sin-relacion-${stamp()}@otro.com`,
      userEmailType: 'personal',
    })
    const nuevo = `ca1-${stamp()}@correo.com`

    const response = await putPerson(client, person, { personEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'users' })
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), nuevo)
  })

  test('CA-2 expediente-no-toca-la-credencial-institucional', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca2-${stamp()}@correo.com`)
    const acceso = `ca2-acceso-${stamp()}@empresa.com`
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: acceso, userEmailType: 'institutional' })
    const nuevo = `ca2-nuevo-${stamp()}@correo.com`

    const response = await putPerson(client, person, { personEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'email-type-mismatch' })
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, acceso)
    assert.equal(await readPersonEmail(person.personId), nuevo)
  })

  test('CA-10 persona sin cuenta: la omisión se declara (no-live-counterpart)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca10p-${stamp()}@correo.com`)
    const response = await putPerson(client, person, { personEmail: `ca10p-n-${stamp()}@correo.com` })
    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('CA-8 / CA-9 correo de otra cuenta viva: 400 USR.MAIL.002 y la persona NO queda actualizada', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca9-${stamp()}@correo.com`
    const otro = await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], {
      userEmail: ocupado,
      userEmailType: 'institutional',
    })
    const viejo = `ca9-viejo-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'personal' })

    const response = await putPerson(client, person, { personEmail: ocupado, personFirstname: 'Cambiado' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.002')
    assertNoDisclosure(assert, response.body(), [ocupado, otro.userId, user.userId, person.personId])
    assert.equal(await readPersonEmail(person.personId), viejo)
    assert.equal(await readPersonFirstname(person.personId), 'Espejo')
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, viejo)
  })

  test('CA-11 [ABUSO] persona de otra empresa: 404 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const victimaEmail = `victima-${stamp()}@correo.com`
    const victima = await createPersonIn(w.registry, w.limited.businessUnit, victimaEmail)
    const cuenta = await createUserFor(w.registry, victima, w.limited.role, [w.limited.businessUnit], {
      userEmail: victimaEmail,
      userEmailType: 'personal',
    })

    const response = await putPerson(client, victima, { personEmail: `atacante-${stamp()}@correo.com` })

    response.assertStatus(404)
    const cuentaRow = await readUserRow(cuenta.userId)
    assert.equal(cuentaRow.user_email, victimaEmail)
    assert.equal(await readPersonEmail(victima.personId), victimaEmail)
  })

  test('CA-11 [ABUSO] cuenta de acceso fuera del alcance del actor: 403 USR.MAIL.005 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const foreign = await createForeignBusinessUnit(w.registry)
    const victimaEmail = `victima2-${stamp()}@correo.com`
    const victima = await createPersonIn(w.registry, w.full.businessUnit, victimaEmail)
    const cuenta = await createUserFor(w.registry, victima, w.full.role, [foreign], { userEmail: victimaEmail, userEmailType: 'personal' })

    const response = await putPerson(client, victima, { personEmail: `atacante2-${stamp()}@correo.com` })

    response.assertStatus(403)
    assert.equal(response.body().code, 'USR.MAIL.005')
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
    const cuentaRow = await readUserRow(cuenta.userId)
    assert.equal(cuentaRow.user_email, victimaEmail)
    assert.equal(await readPersonEmail(victima.personId), victimaEmail)
  })

  test('CA-14 mas-de-un-usuario-por-persona-falla-cerrado sin decir cuántos ni cuáles', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca14-${stamp()}@correo.com`)
    const a = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: `ca14a-${stamp()}@x.com`, userEmailType: 'personal' })
    const b = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: `ca14b-${stamp()}@x.com`, userEmailType: 'personal' })

    const response = await putPerson(client, person, { personEmail: `ca14-n-${stamp()}@correo.com` })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.006')
    assertNoDisclosure(assert, response.body(), [a.userId, b.userId, a.userEmail, b.userEmail])
    const rowA = await readUserRow(a.userId)
    const rowB = await readUserRow(b.userId)
    assert.equal(rowA.user_email, a.userEmail)
    assert.equal(rowB.user_email, b.userEmail)
  })
})

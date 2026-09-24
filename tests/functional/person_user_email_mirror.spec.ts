import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import User from '#models/user'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import type Employee from '#models/employee'
import type Person from '#models/person'
import {
  assertNoDisclosure,
  businessUnitHeader,
  captureLogStore,
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
      response.assertStatus(422)
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

test.group('Espejo — POST /api/users (M2/M3)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function postUser(client: ApiClient, personId: number, userEmail: string, userEmailType?: string) {
    const w = world!
    return client
      .post('/api/users')
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json({
        userEmail,
        userActive: true,
        roleId: w.full.role.roleId,
        personId,
        ...(userEmailType === undefined ? {} : { userEmailType }),
      })
  }

  test('personal: escribe person_email y guarda la imagen previa solo en log_users', async ({ client, assert, cleanup }) => {
    const w = world!
    const logs = captureLogStore(cleanup)
    const anterior = `alta-anterior-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)
    const nuevo = `alta-nuevo-${stamp()}@correo.com`

    const response = await postUser(client, person.personId, nuevo, 'personal')

    response.assertStatus(201)
    const createdUser = await User.query().where('person_id', person.personId).whereNull('user_deleted_at').firstOrFail()
    w.registry.userIds.push(createdUser.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'people' })
    assert.equal(await readPersonEmail(person.personId), nuevo)
    assert.notInclude(JSON.stringify(response.body()), anterior)
    const entry = logs.find((log) => log.collection === 'log_users')
    assert.equal(entry?.payload.record_previous_person_email, anterior)
  })

  test('CA-4 el-correo-personal-no-se-borra: institucional escribe el correo de empresa', async ({ client, assert }) => {
    const w = world!
    const personal = `ca4-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca4-e-${stamp()}@empresa.com`)
    const nuevo = `ca4-n-${stamp()}@empresa.com`

    const response = await postUser(client, person.personId, nuevo, 'institutional')

    response.assertStatus(201)
    w.registry.userIds.push(response.body().data.user.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'employees' })
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), personal)
  })

  test('sin userEmailType el alta persiste institutional (default de la columna)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const response = await postUser(client, person.personId, `default-${stamp()}@empresa.com`)
    response.assertStatus(201)
    const userId = response.body().data.user.userId
    w.registry.userIds.push(userId)
    const userRow = await readUserRow(userId)
    assert.equal(userRow.user_email_type, 'institutional')
  })

  test('CA-10 omision-explicita-sin-puesto-vivo en el alta institucional', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const response = await postUser(client, person.personId, `ca10u-${stamp()}@empresa.com`, 'institutional')
    response.assertStatus(201)
    w.registry.userIds.push(response.body().data.user.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('CA-8 personal con correo de otra persona: 400 USR.MAIL.003 y no se crea la cuenta', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8p-${stamp()}@correo.com`
    const duena = await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const anterior = `ca8p-mio-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)

    const response = await postUser(client, person.personId, ocupado, 'personal')

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.003')
    assert.equal(response.body().key, 'correo-personal-ya-registrado')
    assertNoDisclosure(assert, response.body(), [ocupado, duena.personId, person.personId])
    assert.isNull(await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first())
    assert.equal(await readPersonEmail(person.personId), anterior)
  })

  test('CA-8 institucional con correo de otro empleado: 400 USR.MAIL.004 y no se crea la cuenta', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8e-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const propio = `ca8e-propio-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, propio)

    const response = await postUser(client, person.personId, ocupado, 'institutional')

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.004')
    assert.isNull(await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first())
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, propio)
  })
})

test.group('Espejo — PUT /api/users/:id (M4/M5)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putUser(client: ApiClient, actor: TenantActor, user: User, overrides: Record<string, unknown>) {
    return client
      .put(`/api/users/${user.userId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeader(actor.businessUnit))
      .json(userBody(user, overrides))
  }

  test('CA-5 edicion-sin-tipo-conserva-el-tipo-guardado y espeja al expediente', async ({ client, assert, cleanup }) => {
    const w = world!
    const logs = captureLogStore(cleanup)
    const anterior = `ca5-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)
    const empresa = `ca5-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: anterior, userEmailType: 'personal' })
    const nuevo = `ca5-nuevo-${stamp()}@correo.com`

    const response = await putUser(client, w.full, user, { userEmail: nuevo })

    response.assertStatus(201)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email_type, 'personal')
    assert.equal(row.user_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), nuevo)
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, empresa)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'people' })
    assert.equal(logs.find((log) => log.collection === 'log_users')?.payload.record_previous_person_email, anterior)
    assert.notInclude(JSON.stringify(response.body()), anterior)
  })

  test('CA-4 el-correo-personal-no-se-borra al editar una cuenta institucional', async ({ client, assert }) => {
    const w = world!
    const personal = `ca4u-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const viejo = `ca4u-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })
    const nuevo = `ca4u-n-${stamp()}@empresa.com`

    const response = await putUser(client, w.full, user, { userEmail: nuevo, userEmailType: 'institutional' })

    response.assertStatus(201)
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), personal)
  })

  test('CA-12 [ABUSO] discriminador envenenado "Personal": 422 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const email = `ca12a-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const empresa = `ca12a-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.limited.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.limited, user, { userEmail: `ca12a-n-${stamp()}@correo.com`, userEmailType: 'Personal' })

    response.assertStatus(422)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, empresa)
  })

  test('CA-12 [ABUSO] sin el campo y sin permiso de contacto: 403 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const email = `ca12b-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const empresa = `ca12b-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.limited.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.limited, user, { userEmail: `ca12b-n-${stamp()}@correo.com` })

    response.assertStatus(403)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
    assert.equal(await readPersonEmail(person.personId), email)
    const employeeRow = await readEmployeeRow(employee.employeeId)
    assert.equal(employeeRow.employee_business_email, empresa)
  })

  test('CA-8 personal con correo de otra persona: 400 USR.MAIL.003 y la cuenta no cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8up-${stamp()}@correo.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const email = `ca8up-mio-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.full, user, { userEmail: ocupado, userEmailType: 'personal' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.003')
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(await readPersonEmail(person.personId), email)
  })

  test('CA-8 institucional con correo de otro empleado: 400 USR.MAIL.004 y la cuenta no cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8ue-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const viejo = `ca8ue-mio-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })

    const response = await putUser(client, w.full, user, { userEmail: ocupado, userEmailType: 'institutional' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.004')
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, viejo)
  })

  test('repuntar la cuenta a una persona que ya tiene cuenta viva: 422 y no cambia', async ({ client, assert }) => {
    const w = world!
    const otra = await createPersonIn(w.registry, w.full.businessUnit, null)
    await createUserFor(w.registry, otra, w.full.role, [w.full.businessUnit], { userEmail: `otra-${stamp()}@x.com`, userEmailType: 'institutional' })
    const email = `repunte-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'institutional' })

    const response = await putUser(client, w.full, user, { personId: otra.personId })

    response.assertStatus(422)
    const row = await readUserRow(user.userId)
    assert.equal(row.person_id, person.personId)
  })
})

test.group('Espejo — CA-7 igualdad-de-trato-en-los-seis-caminos', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function as(client: ApiClient, method: 'put' | 'post', url: string, body: Record<string, unknown>) {
    const w = world!
    return client[method](url).loginAs(w.full.user).headers(businessUnitHeader(w.full.businessUnit)).json(body)
  }

  test('M1 y M6 → mismo cuerpo USR.MAIL.002; M2 y M4 → USR.MAIL.003; M3 y M5 → USR.MAIL.004; nada se guarda', async ({ client, assert }) => {
    const w = world!
    const bu = w.full.businessUnit
    const role = w.full.role

    // Correos ocupados, uno por destino.
    const ocupadoCuenta = `ca7-cuenta-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, bu, null), role, [bu], { userEmail: ocupadoCuenta, userEmailType: 'institutional' })
    const ocupadoPersonal = `ca7-personal-${stamp()}@x.com`
    await createPersonIn(w.registry, bu, ocupadoPersonal)
    const ocupadoEmpresa = `ca7-empresa-${stamp()}@x.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, bu, null), bu, ocupadoEmpresa)

    // M1: expediente de una persona con cuenta personal.
    const m1Email = `ca7-m1-${stamp()}@x.com`
    const m1Person = await createPersonIn(w.registry, bu, m1Email)
    const m1User = await createUserFor(w.registry, m1Person, role, [bu], { userEmail: m1Email, userEmailType: 'personal' })
    const m1 = await as(client, 'put', `/api/persons/${m1Person.personId}`, personBody(m1Person, { personEmail: ocupadoCuenta }))

    // M6: empleado con cuenta institucional.
    const m6Email = `ca7-m6-${stamp()}@x.com`
    const m6Person = await createPersonIn(w.registry, bu, null)
    const m6Employee = await createEmployeeFor(w.registry, m6Person, bu, m6Email)
    const m6User = await createUserFor(w.registry, m6Person, role, [bu], { userEmail: m6Email, userEmailType: 'institutional' })
    const m6 = await as(client, 'put', `/api/employees/${m6Employee.employeeId}`, employeeBody(m6Employee, { employeeBusinessEmail: ocupadoCuenta }))

    // M2: alta personal. M3: alta institucional.
    const m2Person = await createPersonIn(w.registry, bu, `ca7-m2-${stamp()}@x.com`)
    const m2 = await as(client, 'post', '/api/users', { userEmail: ocupadoPersonal, userActive: true, roleId: role.roleId, personId: m2Person.personId, userEmailType: 'personal' })
    const m3Person = await createPersonIn(w.registry, bu, null)
    const m3Employee = await createEmployeeFor(w.registry, m3Person, bu, `ca7-m3-${stamp()}@x.com`)
    const m3 = await as(client, 'post', '/api/users', { userEmail: ocupadoEmpresa, userActive: true, roleId: role.roleId, personId: m3Person.personId, userEmailType: 'institutional' })

    // M4: edición personal. M5: edición institucional.
    const m4Email = `ca7-m4-${stamp()}@x.com`
    const m4Person = await createPersonIn(w.registry, bu, m4Email)
    const m4User = await createUserFor(w.registry, m4Person, role, [bu], { userEmail: m4Email, userEmailType: 'personal' })
    const m4 = await as(client, 'put', `/api/users/${m4User.userId}`, userBody(m4User, { userEmail: ocupadoPersonal }))
    const m5Email = `ca7-m5-${stamp()}@x.com`
    const m5Person = await createPersonIn(w.registry, bu, null)
    const m5Employee = await createEmployeeFor(w.registry, m5Person, bu, m5Email)
    const m5User = await createUserFor(w.registry, m5Person, role, [bu], { userEmail: m5Email, userEmailType: 'institutional' })
    const m5 = await as(client, 'put', `/api/users/${m5User.userId}`, userBody(m5User, { userEmail: ocupadoEmpresa }))

    for (const response of [m1, m2, m3, m4, m5, m6]) response.assertStatus(400)
    assert.deepEqual(m1.body(), m6.body())
    assert.equal(m1.body().code, 'USR.MAIL.002')
    assert.deepEqual(m2.body(), m4.body())
    assert.equal(m2.body().code, 'USR.MAIL.003')
    assert.deepEqual(m3.body(), m5.body())
    assert.equal(m3.body().code, 'USR.MAIL.004')

    // Mismo efecto: nada se guardó en ninguno.
    const m1UserRow = await readUserRow(m1User.userId)
    const m6EmployeeRow = await readEmployeeRow(m6Employee.employeeId)
    const m6UserRow = await readUserRow(m6User.userId)
    const m3EmployeeRow = await readEmployeeRow(m3Employee.employeeId)
    const m4UserRow = await readUserRow(m4User.userId)
    const m5UserRow = await readUserRow(m5User.userId)
    const m5EmployeeRow = await readEmployeeRow(m5Employee.employeeId)
    assert.equal(await readPersonEmail(m1Person.personId), m1Email)
    assert.equal(m1UserRow.user_email, m1Email)
    assert.equal(m6EmployeeRow.employee_business_email, m6Email)
    assert.equal(m6UserRow.user_email, m6Email)
    assert.isNull(await User.query().where('person_id', m2Person.personId).whereNull('user_deleted_at').first())
    assert.isNull(await User.query().where('person_id', m3Person.personId).whereNull('user_deleted_at').first())
    assert.notEqual(m3EmployeeRow.employee_business_email, ocupadoEmpresa)
    assert.equal(m4UserRow.user_email, m4Email)
    assert.equal(await readPersonEmail(m4Person.personId), m4Email)
    assert.equal(m5UserRow.user_email, m5Email)
    assert.equal(m5EmployeeRow.employee_business_email, m5Email)
  })
})

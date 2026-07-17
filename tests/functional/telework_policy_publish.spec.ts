import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import { DateTime } from 'luxon'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import TeleworkPolicy from '#models/telework_policy'
import TeleworkPolicyNotificationLog from '#models/telework_policy_notification_log'
import TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'

/**
 * Tests funcionales — publicar/difundir la Política de Teletrabajo y
 * seguimiento de acuses (NOM-037-STPS-2023, numeral 5.2,
 * USRH1783547655377).
 *
 * Cubre los 5 endpoints NUEVOS de este HU (el editor del borrador ya está
 * cubierto por `telework_policy.spec.ts`, que este archivo no toca):
 *  - 401 sin autenticación.
 *  - 403 para un usuario sin permiso del módulo `telework-policy`.
 *  - Flujo completo con un usuario `root`: completar borrador → publicar
 *    (con difusión y bitácora) → doble publicación (409) → seguimiento de
 *    acuses (pendiente / sin correo) → recordatorio masivo y selectivo →
 *    0 pendientes idempotente tras acusar → historial de versiones → nuevo
 *    borrador desde la vigente (con 409 si ya hay uno) → publicar v2 →
 *    los acuses de v1 aparecen `outdated`.
 *  - Aislamiento cross-tenant (404 indistinguible).
 *
 * Convenciones: mismo patrón que `telework_policy.spec.ts` (usuarios de
 * prueba con email único, sin transacciones, cleanup explícito). `mail.fake()`
 * envuelve todo el archivo para nunca tocar un SMTP real; los correos de
 * prueba se generan fuera de la lista blanca de desarrollo a propósito
 * (el gate de `notice_service`/`telework_policy_notification.service`
 * simplemente simula el envío como "sent" sin salir de la app).
 */

const TEST_PASSWORD = 'TeleworkPolicyPublishTest123!'
const ROOT_ROLE_ID = 3
const NO_PERMISSION_ROLE_ID = 4 // empleado: no tiene el permiso 'telework-policy'

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkPolicyPublish'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function getPrimaryBusinessUnit(): Promise<BusinessUnit> {
  return BusinessUnit.query().where('business_unit_active', 1).firstOrFail()
}

interface TeleworkEmployeeOptions {
  withEmail?: boolean
}

async function createTeleworkEmployee(
  businessUnitId: number,
  options: TeleworkEmployeeOptions = {}
): Promise<Employee> {
  const withEmail = options.withEmail ?? true
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`

  // Se crea vía el modelo (no INSERT crudo): `person_email` se cifra en
  // reposo con un `prepare` de Lucid (AES-256-CBC, LFPDPPP art. 3.VI) — un
  // INSERT directo a la tabla dejaría el correo en texto plano y el
  // `consume` fallaría al descifrarlo (fallo-cerrado → `null`), rompiendo la
  // resolución de destinatarios de la difusión.
  const person = new Person()
  person.personFirstname = 'Teletrabajador'
  person.personLastname = 'Publish'
  person.personSecondLastname = stamp
  person.personEmail = withEmail ? `teletrabajador-${stamp}@gsti-tests.local` : null
  await person.save()

  const [employeeId] = await db.table('employees').insert({
    employee_sync_id: `EMP-TWP-${stamp}`,
    employee_code: `EMP-TWP-${stamp}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    person_id: person.personId,
    employee_work_schedule: 'Remote',
    employee_telework_percentage: 100,
    employee_created_at: new Date(),
  })

  return Employee.findOrFail(Number(employeeId))
}

async function cleanupTeleworkEmployee(employee: Employee | null) {
  if (!employee) return
  await TeleworkPolicyAcknowledgement.query().where('employee_id', employee.employeeId).delete()
  await TeleworkPolicyNotificationLog.query().where('employee_id', employee.employeeId).delete()
  const personId = employee.personId
  await Employee.query().where('employee_id', employee.employeeId).delete()
  await Person.query().where('person_id', personId).delete()
}

async function insertAcknowledgement(
  policy: TeleworkPolicy,
  employee: Employee,
  acknowledgedAt: DateTime = DateTime.now()
): Promise<void> {
  await db.table('telework_policy_acknowledgements').insert({
    telework_policy_id: policy.teleworkPolicyId,
    employee_id: employee.employeeId,
    business_unit_id: policy.businessUnitId,
    telework_policy_acknowledgement_acknowledged_at: acknowledgedAt.toJSDate(),
    telework_policy_acknowledgement_created_at: new Date(),
  })
}

async function completeDraftComponents(
  client: import('@japa/api-client').ApiClient,
  actor: User,
  businessUnitPublicId: string
) {
  const templateResponse = await client
    .get('/api/nom037/telework-policy/template')
    .loginAs(actor)
    .header('X-Business-Unit-Id', businessUnitPublicId)
  const templateComponents = templateResponse.body().data.components as Array<{
    key: string
    title: string
    body: string
  }>

  await client
    .put('/api/nom037/telework-policy')
    .loginAs(actor)
    .header('X-Business-Unit-Id', businessUnitPublicId)
    .json({ title: 'Política de Teletrabajo Publish Test', components: templateComponents })
}

test.group('TeleworkPolicy publish/acknowledgements - auth (401 sin autenticación)', () => {
  test('POST /api/nom037/telework-policy/publish responde 401', async ({ client }) => {
    const response = await client.post('/api/nom037/telework-policy/publish')
    response.assertStatus(401)
  })

  test('POST /api/nom037/telework-policy/draft responde 401', async ({ client }) => {
    const response = await client.post('/api/nom037/telework-policy/draft')
    response.assertStatus(401)
  })

  test('GET /api/nom037/telework-policy/versions responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-policy/versions')
    response.assertStatus(401)
  })

  test('GET /api/nom037/telework-policy/acknowledgements responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-policy/acknowledgements')
    response.assertStatus(401)
  })

  test('POST /api/nom037/telework-policy/remind-pending responde 401', async ({ client }) => {
    const response = await client.post('/api/nom037/telework-policy/remind-pending')
    response.assertStatus(401)
  })
})

test.group('TeleworkPolicy publish/acknowledgements - sin permiso (403)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE_ID, 'no-permiso-publish')
    businessUnit = await getPrimaryBusinessUnit()
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  function assertForbidden(body: Record<string, unknown>, assert: import('@japa/assert').Assert) {
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.errorCode, 'TWP.AUTH.001')
  }

  test('POST /publish responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('POST /draft responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .post('/api/nom037/telework-policy/draft')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('GET /versions responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .get('/api/nom037/telework-policy/versions')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('GET /acknowledgements responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('POST /remind-pending responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })
})

test.group('TeleworkPolicy publish/acknowledgements - aislamiento entre empresas', (group) => {
  const RH_MANAGER_ROLE_ID = 2

  let rhManagerA: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null

  group.setup(async () => {
    businessUnitA = await getPrimaryBusinessUnit()

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    businessUnitB = new BusinessUnit()
    businessUnitB.businessUnitName = `TeleworkPolicyPublish Isolation ${stamp}`
    businessUnitB.businessUnitSlug = `telework-policy-publish-isolation-${stamp}`
    businessUnitB.businessUnitLegalName = `TeleworkPolicyPublish Isolation Legal ${stamp}`
    businessUnitB.businessUnitActive = 1
    await businessUnitB.save()

    rhManagerA = await createTestActor(RH_MANAGER_ROLE_ID, 'rh-manager-a-publish')
    await rhManagerA.user.related('businessUnits').attach([businessUnitA.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(rhManagerA)
    if (businessUnitB) {
      await BusinessUnit.query().where('business_unit_id', businessUnitB.businessUnitId).delete()
    }
  })

  test('POST /publish con X-Business-Unit-Id fuera de alcance responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(rhManagerA!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)
    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('GET /acknowledgements con X-Business-Unit-Id fuera de alcance responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(rhManagerA!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)
    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })
})

test.group('TeleworkPolicy publish/acknowledgements - flujo completo (root)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employeeWithEmail: Employee | null = null
  let employeeWithoutEmail: Employee | null = null

  group.setup(async () => {
    mail.fake()
    root = await createTestActor(ROOT_ROLE_ID, 'root-publish')
    businessUnit = await getPrimaryBusinessUnit()

    // Determinismo: la empresa arranca sin ninguna política previa.
    await TeleworkPolicy.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .withTrashed()
      .delete()

    employeeWithEmail = await createTeleworkEmployee(businessUnit.businessUnitId, { withEmail: true })
    employeeWithoutEmail = await createTeleworkEmployee(businessUnit.businessUnitId, {
      withEmail: false,
    })
  })

  group.teardown(async () => {
    mail.restore()
    if (businessUnit) {
      await TeleworkPolicyNotificationLog.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
      await TeleworkPolicyAcknowledgement.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
      await TeleworkPolicy.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .withTrashed()
        .delete()
    }
    await cleanupTeleworkEmployee(employeeWithEmail)
    await cleanupTeleworkEmployee(employeeWithoutEmail)
    await cleanupTestActor(root)
  })

  test('POST /publish sin ningún borrador responde 404 politica-inexistente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'politica-inexistente')
  })

  test('POST /draft sin ningún borrador y sin ninguna vigente responde 404 politica-inexistente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/draft')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'politica-inexistente')
  })

  test('GET /versions sin ninguna versión responde 404 politica-inexistente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/versions')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'politica-inexistente')
  })

  test('GET /acknowledgements sin ninguna vigente responde 200 hasCurrentVersion=false', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.isFalse(body.data.hasCurrentVersion)
    assert.lengthOf(body.data.workers, 0)
  })

  test('POST /remind-pending sin ninguna vigente responde 404 sin-version-vigente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'sin-version-vigente')
  })

  test('POST /initialize + PUT con componente vacío, luego POST /publish responde 422 politica-incompleta-para-publicar', async ({
    client,
    assert,
  }) => {
    await client
      .post('/api/nom037/telework-policy/initialize')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ mode: 'template' })

    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>
    const incompleteComponents = templateComponents.map((component) =>
      component.key === '5_2_c' ? { ...component, body: '' } : component
    )

    await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Política incompleta', components: incompleteComponents })

    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'politica-incompleta-para-publicar')
    assert.equal(body.code, 'TWP.VAL.STRUCTURE.002')
    assert.deepEqual(body.data.missingKeys, ['5_2_c'])
  })

  test('completa el borrador y POST /publish responde 200 con difusión (1 sent, 1 skipped)', async ({
    client,
    assert,
  }) => {
    await completeDraftComponents(client, root!.user, businessUnit!.businessUnitPublicId)

    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.policy.status, 'published')
    assert.isTrue(body.data.policy.isCurrent)
    assert.isString(body.data.policy.contentHash)
    assert.isNotNull(body.data.policy.publishedAt)
    assert.equal(body.data.diffusion.total, 2)
    assert.equal(body.data.diffusion.sent, 1)
    assert.equal(body.data.diffusion.skipped, 1)
    assert.equal(body.data.diffusion.failed, 0)
  })

  test('POST /publish otra vez (sin borrador nuevo) responde 409 politica-publicada-inmutable', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(409)
    assert.equal(response.body().key, 'politica-publicada-inmutable')
  })

  test('GET /versions muestra la v1 publicada y vigente', async ({ client, assert }) => {
    const response = await client
      .get('/api/nom037/telework-policy/versions')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.lengthOf(body.data, 1)
    assert.equal(body.data[0].version, 1)
    assert.equal(body.data[0].status, 'published')
    assert.isTrue(body.data[0].isCurrent)
  })

  test('GET /acknowledgements muestra a ambos como pendientes; el que no tiene correo se marca hasEmail=false', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.data.hasCurrentVersion)
    assert.equal(body.data.currentVersion, 1)
    assert.equal(body.data.summary.total, 2)
    assert.equal(body.data.summary.pending, 2)
    assert.equal(body.data.summary.withoutEmail, 1)

    const byId = new Map(
      (body.data.workers as Array<Record<string, unknown>>).map((w) => [w.employeeId, w])
    )
    assert.equal(byId.get(employeeWithEmail!.employeeId)?.hasEmail, true)
    assert.equal(byId.get(employeeWithoutEmail!.employeeId)?.hasEmail, false)
    assert.equal(byId.get(employeeWithEmail!.employeeId)?.status, 'pending')
  })

  test('POST /remind-pending masivo envía a ambos pendientes (1 sent, 1 skipped)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.pendingTotal, 2)
    assert.equal(body.data.total, 2)
    assert.equal(body.data.sent, 1)
    assert.equal(body.data.skipped, 1)
    assert.equal(body.message, 'Recordatorio enviado correctamente.')
  })

  test('POST /remind-pending selectivo solo envía al employeeId indicado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ employeeIds: [employeeWithEmail!.employeeId] })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.pendingTotal, 2)
    assert.equal(body.data.total, 1)
  })

  test('POST /remind-pending con employeeIds que no coinciden con ningún pendiente responde 200 sin enviar nada', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ employeeIds: [999999999] })

    response.assertStatus(200)
    const body = response.body()
    // Sigue habiendo pendientes en la empresa (pendingTotal > 0); solo no
    // hubo intersección con el id indicado (total = 0) — mismo mensaje que
    // el caso de 0 pendientes global, porque en ambos no se envió nada.
    assert.equal(body.data.pendingTotal, 2)
    assert.equal(body.data.total, 0)
    assert.equal(
      body.message,
      'Ninguno de los teletrabajadores indicados está pendiente de acusar; no se envió ningún recordatorio.'
    )
  })

  test('POST /remind-pending con employeeIds malformado responde 422 entrada-invalida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ employeeIds: ['no-numerico'] })

    response.assertStatus(422)
    assert.equal(response.body().key, 'entrada-invalida')
  })

  test('tras acusar ambos la v1, GET /acknowledgements los marca acknowledged y POST /remind-pending es 0 pendientes idempotente', async ({
    client,
    assert,
  }) => {
    const current = await TeleworkPolicy.query()
      .where('business_unit_id', businessUnit!.businessUnitId)
      .where('telework_policy_is_current', true)
      .firstOrFail()

    await insertAcknowledgement(current, employeeWithEmail!)
    await insertAcknowledgement(current, employeeWithoutEmail!)

    const trackingResponse = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const trackingBody = trackingResponse.body()
    assert.equal(trackingBody.data.summary.acknowledged, 2)
    assert.equal(trackingBody.data.summary.pending, 0)

    const remindResponse = await client
      .post('/api/nom037/telework-policy/remind-pending')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    remindResponse.assertStatus(200)
    const remindBody = remindResponse.body()
    assert.equal(remindBody.data.pendingTotal, 0)
    assert.equal(remindBody.data.total, 0)
    assert.equal(remindBody.data.sent, 0)
    // El mensaje no debe decir "enviado correctamente" cuando en realidad
    // no había a quién recordarle nada (0 pendientes es idempotente, no un
    // envío exitoso).
    assert.equal(
      remindBody.message,
      'No hay teletrabajadores pendientes de acusar; no fue necesario enviar ningún recordatorio.'
    )
  })

  test('POST /draft crea la v2 desde la vigente; repetirlo responde 409 borrador-ya-existe', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/draft')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.data.version, 2)
    assert.equal(body.data.status, 'draft')
    assert.isFalse(body.data.isCurrent)

    const secondAttempt = await client
      .post('/api/nom037/telework-policy/draft')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    secondAttempt.assertStatus(409)
    assert.equal(secondAttempt.body().key, 'borrador-ya-existe')
  })

  test('publica la v2; la v1 deja de ser vigente y los acuses de v1 aparecen outdated', async ({
    client,
    assert,
  }) => {
    const publishResponse = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    publishResponse.assertStatus(200)
    const publishBody = publishResponse.body()
    assert.equal(publishBody.data.policy.version, 2)
    assert.isTrue(publishBody.data.policy.isCurrent)

    const previousVersion = await TeleworkPolicy.query()
      .where('business_unit_id', businessUnit!.businessUnitId)
      .where('telework_policy_version', 1)
      .firstOrFail()
    assert.isFalse(previousVersion.teleworkPolicyIsCurrent)

    const trackingResponse = await client
      .get('/api/nom037/telework-policy/acknowledgements')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const trackingBody = trackingResponse.body()
    assert.equal(trackingBody.data.currentVersion, 2)
    assert.equal(trackingBody.data.summary.outdated, 2)
    assert.equal(trackingBody.data.summary.acknowledged, 0)

    const versionsResponse = await client
      .get('/api/nom037/telework-policy/versions')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    assert.lengthOf(versionsResponse.body().data, 2)
  })
})

test.group('TeleworkPolicy publish/acknowledgements - i18n (Accept-Language)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-publish-i18n')
    businessUnit = await getPrimaryBusinessUnit()
    await TeleworkPolicy.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .withTrashed()
      .delete()
  })

  group.teardown(async () => {
    if (businessUnit) {
      await TeleworkPolicy.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .withTrashed()
        .delete()
    }
    await cleanupTestActor(root)
  })

  test('POST /publish sin borrador responde en español por defecto', async ({ client, assert }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(
      response.body().detail,
      'La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.'
    )
  })

  test('POST /publish sin borrador responde en inglés con Accept-Language: en', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/publish')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')

    response.assertStatus(404)
    assert.equal(
      response.body().detail,
      'This business unit does not have a Telework Policy yet; initialize it first.'
    )
  })
})

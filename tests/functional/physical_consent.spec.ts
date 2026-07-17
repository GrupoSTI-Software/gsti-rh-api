import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import LegalDocument from '#models/legal_document'
import UserConsent from '#models/user_consent'
import PiiAccessLog from '#models/pii_access_log'

/**
 * Tests funcionales — consentimiento biométrico físico (USRH1784146205513).
 *
 * Cubre, a nivel HTTP, el slice `consent/physical` completo:
 *  - 401 sin autenticación en los 4 endpoints (3 del slice + descarga desde evidencia global).
 *  - 403 sin el permiso `register-physical-consent`.
 *  - Flujo feliz sin usuario vinculado (H6): estado sin asiento → alta con archivo →
 *    duplicado (409) → estado con asiento → URL de descarga (ficha y evidencia global) →
 *    aparece en la vista de evidencia con `channel: physical` y `userId: null`.
 *  - Doble ancla (regla 8): empleado CON usuario vinculado → el asiento queda anclado
 *    también por `userId`.
 *  - Sin versión vigente publicada (422 CSNT.VAL.003).
 *  - Validaciones de archivo/versión (422 CSNT.VAL.001/004/005/006).
 *  - Empleado fuera de scope de la unidad de negocio activa o inexistente (404 CSNT.NF.001).
 *
 * Convenciones (siguiendo `telework_policy.spec.ts` / `consent_acceptance.spec.ts`):
 *  - Fixtures con timestamp único, sin transacciones, cleanup explícito en `group.teardown`.
 *  - Orden de cleanup obligatorio por los FK `RESTRICT` nuevos: primero los `user_consents`
 *    generados (por `employee_id`), luego `employees`/`legal_documents`, al final los
 *    actores (`users`/`people`) — nunca al revés.
 */

const TEST_PASSWORD = 'PhysicalConsentTest123!'
const ROOT_ROLE_ID = 3
const NO_PERMISSION_ROLE_ID = 4 // empleado: no tiene el permiso 'register-physical-consent'
const LINKED_USER_ROLE_ID = 4

/** PNG 1x1 válido (magic bytes reales) — el bodyparser detecta el tipo por contenido, no por extensión. */
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const VALID_FILE_NAME = 'consentimiento-firmado.png'

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'PhysicalConsent'
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
  // Los endpoints de descarga registran bitácora PII con el actor como `accessorUserId`
  // (S9) — FK RESTRICT hacia `users`, hay que limpiarla antes de borrar el actor.
  await PiiAccessLog.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function getPrimaryBusinessUnit(): Promise<BusinessUnit> {
  return BusinessUnit.query().where('business_unit_active', 1).firstOrFail()
}

async function createSecondaryBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `PhysicalConsent ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `physical-consent-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `PhysicalConsent ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function deleteSecondaryBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  linkedUser: User | null
}

async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string,
  withUser: boolean
): Promise<EmployeeFixture> {
  const stamp = uniqueStamp()

  const person = new Person()
  person.personFirstname = 'Empleado'
  person.personLastname = 'Fisico'
  person.personSecondLastname = prefix
  person.personEmail = `empleado-${prefix}-${stamp}@gsti-tests.local`
  await person.save()

  let linkedUser: User | null = null
  if (withUser) {
    linkedUser = new User()
    linkedUser.userEmail = `empleado-user-${prefix}-${stamp}@gsti-tests.local`
    linkedUser.userPassword = TEST_PASSWORD
    linkedUser.userActive = 1
    linkedUser.roleId = LINKED_USER_ROLE_ID
    linkedUser.personId = person.personId
    linkedUser.userEmailType = 'institutional'
    await linkedUser.save()
  }

  const inserted = await db.table('employees').insert({
    employee_sync_id: stamp,
    employee_code: `EMP-PHY-${prefix}-${stamp}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    person_id: person.personId,
    employee_created_at: new Date(),
  })
  const employeeId = Number(Array.isArray(inserted) ? inserted[0] : inserted)
  const employee = await Employee.findOrFail(employeeId)

  return { employee, person, linkedUser }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  // Los FK nuevos (`fk_user_consents_employee`, FK legado a `legal_documents`) son
  // RESTRICT: hay que borrar los asientos ANTES del empleado/documento/actor.
  await UserConsent.query().where('employee_id', fixture.employee.employeeId).delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  if (fixture.linkedUser) {
    await User.query().where('user_id', fixture.linkedUser.userId).delete()
  }
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function ensureNoBiometricCurrentDocument(): Promise<void> {
  await LegalDocument.query()
    .where('legal_document_type', 'biometric_consent')
    .where('legal_document_is_current', true)
    .delete()
}

async function createCurrentBiometricDocument(version = '1.0'): Promise<LegalDocument> {
  await ensureNoBiometricCurrentDocument()
  const document = new LegalDocument()
  document.legalDocumentType = 'biometric_consent'
  document.legalDocumentVersion = version
  document.legalDocumentContent = { es: 'Contenido de prueba' }
  document.legalDocumentIsCurrent = true
  document.legalDocumentStatus = 'published'
  document.legalDocumentPublishedAt = DateTime.now()
  await document.save()
  return document
}

async function deleteBiometricDocument(document: LegalDocument | null): Promise<void> {
  if (!document) return
  await LegalDocument.query().where('legal_document_id', document.legalDocumentId).delete()
}

test.group('PhysicalConsent - auth (401 sin autenticación)', () => {
  test('POST /api/employees/:employeeId/consents/physical responde 401', async ({ client }) => {
    const response = await client.post('/api/employees/1/consents/physical').field('type', 'biometric_consent')
    response.assertStatus(401)
  })

  test('GET /api/employees/:employeeId/consents/status responde 401', async ({ client }) => {
    const response = await client.get('/api/employees/1/consents/status')
    response.assertStatus(401)
  })

  test('GET /api/employees/:employeeId/consents/:userConsentId/evidence-download-url responde 401', async ({
    client,
  }) => {
    const response = await client.get('/api/employees/1/consents/1/evidence-download-url')
    response.assertStatus(401)
  })

  test('GET /api/consent/evidence/:userConsentId/download-url responde 401', async ({ client }) => {
    const response = await client.get('/api/consent/evidence/1/download-url')
    response.assertStatus(401)
  })
})

test.group('PhysicalConsent - sin permiso (403 CSNT.FORB.001)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE_ID, 'no-permiso')
    businessUnit = await getPrimaryBusinessUnit()
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('POST responde 403 sin el permiso register-physical-consent', async ({ client, assert }) => {
    const response = await client
      .post('/api/employees/999999/consents/physical')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso-consentimiento')
    assert.equal(body.code, 'CSNT.FORB.001')
    assert.isNull(body.data)
  })

  test('GET evidence-download-url de la ficha responde 403 sin el permiso', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/999999/consents/1/evidence-download-url')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assert.equal(response.body().code, 'CSNT.FORB.001')
  })
})

test.group('PhysicalConsent - flujo completo (root, empleado sin usuario vinculado)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let document: LegalDocument | null = null
  let employeeFixture: EmployeeFixture | null = null
  let registeredUserConsentId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root')
    businessUnit = await getPrimaryBusinessUnit()
    document = await createCurrentBiometricDocument('1.0')
    employeeFixture = await createEmployeeFixture(businessUnit.businessUnitId, 'sin-usuario', false)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeFixture)
    await deleteBiometricDocument(document)
    await cleanupTestActor(root)
  })

  test('GET status responde data:null antes de registrar ningún asiento', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employees/${employeeFixture!.employee.employeeId}/consents/status`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isNull(body.data)
  })

  test('POST con archivo válido registra el consentimiento físico (201, userId:null, channel:physical)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.employeeId, employeeFixture!.employee.employeeId)
    assert.isNull(body.data.userId)
    assert.equal(body.data.channel, 'physical')
    assert.equal(body.data.version, '1.0')
    assert.equal(body.data.documentType, 'biometric_consent')
    assert.equal(body.data.registeredBy.userId, root!.user.userId)
    assert.equal(body.data.evidence.originalName, VALID_FILE_NAME)
    assert.exists(body.data.userConsentId)

    registeredUserConsentId = body.data.userConsentId
  })

  test('POST repetido para el mismo empleado/documento responde 409 CSNT.DUP.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'consentimiento-ya-registrado')
    assert.equal(body.code, 'CSNT.DUP.001')
  })

  test('GET status posterior refleja el asiento registrado', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employees/${employeeFixture!.employee.employeeId}/consents/status`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.userConsentId, registeredUserConsentId)
    assert.equal(body.data.channel, 'physical')
    assert.isTrue(body.data.hasAttachment)
    assert.exists(body.data.registeredByName)
  })

  test('GET evidence-download-url de la ficha genera una URL firmada (200)', async ({ client, assert }) => {
    const response = await client
      .get(
        `/api/employees/${employeeFixture!.employee.employeeId}/consents/${registeredUserConsentId}/evidence-download-url`
      )
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isString(body.data.downloadUrl)
    assert.equal(body.data.expiresInSeconds, 300)
  })

  test('GET /api/consent/evidence/:userConsentId/download-url (evidencia global, root) genera una URL firmada (200)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/consent/evidence/${registeredUserConsentId}/download-url`)
      .loginAs(root!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isString(body.data.downloadUrl)
  })

  test('GET /api/consent/evidence lista el asiento con channel:physical y userId:null (H6)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/consent/evidence')
      .qs({ legalDocumentId: document!.legalDocumentId })
      .loginAs(root!.user)

    response.assertStatus(200)
    const rows = response.body().data.data as Array<Record<string, unknown>>
    const row = rows.find((r) => r.userConsentId === registeredUserConsentId)
    assert.exists(row)
    assert.isNull(row!.userId)
    assert.equal(row!.channel, 'physical')
    assert.equal(row!.employeeId, employeeFixture!.employee.employeeId)
    assert.isTrue(row!.hasAttachment as boolean)
    assert.exists(row!.userName)
  })
})

test.group('PhysicalConsent - doble ancla (empleado con usuario vinculado)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let document: LegalDocument | null = null
  let employeeFixture: EmployeeFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-doble-ancla')
    businessUnit = await getPrimaryBusinessUnit()
    document = await createCurrentBiometricDocument('1.0')
    employeeFixture = await createEmployeeFixture(businessUnit.businessUnitId, 'con-usuario', true)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeFixture)
    await deleteBiometricDocument(document)
    await cleanupTestActor(root)
  })

  test('POST ancla el asiento también por userId cuando el empleado tiene usuario vinculado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.data.employeeId, employeeFixture!.employee.employeeId)
    assert.equal(body.data.userId, employeeFixture!.linkedUser!.userId)
  })
})

test.group('PhysicalConsent - sin versión vigente publicada (422 CSNT.VAL.003)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employeeFixture: EmployeeFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'sin-vigente')
    businessUnit = await getPrimaryBusinessUnit()
    await ensureNoBiometricCurrentDocument()
    employeeFixture = await createEmployeeFixture(businessUnit.businessUnitId, 'sin-vigente', false)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeFixture)
    await cleanupTestActor(root)
  })

  test('POST sin documento biométrico vigente publicado responde 422 CSNT.VAL.003', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'sin-version-vigente-biometrico')
    assert.equal(body.code, 'CSNT.VAL.003')
  })
})

test.group('PhysicalConsent - validaciones de versión y archivo (422)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let document: LegalDocument | null = null
  let employeeFixture: EmployeeFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'validaciones')
    businessUnit = await getPrimaryBusinessUnit()
    document = await createCurrentBiometricDocument('1.0')
    employeeFixture = await createEmployeeFixture(businessUnit.businessUnitId, 'validaciones', false)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeFixture)
    await deleteBiometricDocument(document)
    await cleanupTestActor(root)
  })

  test('POST con documentVersion que no coincide con la vigente responde 422 CSNT.VAL.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '9.9')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'version-de-consentimiento-invalida')
    assert.equal(body.code, 'CSNT.VAL.001')
  })

  test('POST sin archivo adjunto responde 422 CSNT.VAL.004', async ({ client, assert }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'archivo-de-evidencia-requerido')
    assert.equal(body.code, 'CSNT.VAL.004')
  })

  test('POST con archivo de tipo no permitido responde 422 CSNT.VAL.005', async ({ client, assert }) => {
    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', Buffer.from('contenido de texto plano, no es imagen ni PDF'), {
        filename: 'consentimiento.txt',
        contentType: 'text/plain',
      })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'archivo-de-evidencia-invalido')
    assert.equal(body.code, 'CSNT.VAL.005')
  })

  test('POST con archivo mayor a 10 MB responde 422 CSNT.VAL.006', async ({ client, assert }) => {
    const oversizedPng = Buffer.concat([VALID_PNG_BUFFER, Buffer.alloc(11 * 1024 * 1024, 0)])

    const response = await client
      .post(`/api/employees/${employeeFixture!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', oversizedPng, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'archivo-de-evidencia-demasiado-grande')
    assert.equal(body.code, 'CSNT.VAL.006')
  }).timeout(20000)
})

test.group('PhysicalConsent - empleado fuera de scope o inexistente (404 CSNT.NF.001)', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let document: LegalDocument | null = null
  let employeeFixtureB: EmployeeFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'fuera-de-scope')
    businessUnitA = await getPrimaryBusinessUnit()
    businessUnitB = await createSecondaryBusinessUnit('fuera-de-scope')
    document = await createCurrentBiometricDocument('1.0')
    // Empleado de la empresa B; el header de la request seleccionará la A.
    employeeFixtureB = await createEmployeeFixture(businessUnitB.businessUnitId, 'fuera-de-scope', false)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeFixtureB)
    await deleteBiometricDocument(document)
    await deleteSecondaryBusinessUnit(businessUnitB)
    await cleanupTestActor(root)
  })

  test('POST sobre un empleado de otra empresa (fuera del header activo) responde 404', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/employees/${employeeFixtureB!.employee.employeeId}/consents/physical`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
      .field('type', 'biometric_consent')
      .field('documentVersion', '1.0')
      .file('file', VALID_PNG_BUFFER, { filename: VALID_FILE_NAME, contentType: 'image/png' })

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'empleado-no-encontrado')
    assert.equal(body.code, 'CSNT.NF.001')
  })

  test('GET status de un employeeId inexistente responde 404', async ({ client, assert }) => {
    const response = await client
      .get('/api/employees/999999999/consents/status')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().code, 'CSNT.NF.001')
  })
})

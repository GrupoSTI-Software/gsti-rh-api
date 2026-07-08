import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import LegalDocument from '#models/legal_document'
import UserConsent from '#models/user_consent'
import type { LegalDocumentType } from '#models/legal_document'

/**
 * Tests funcionales — consentimiento legal granular por documento (USRH1783101935670),
 * consumido tal cual por USRH1783369535608 (esta HU no agrega lógica de API nueva).
 *
 * Cubre, a nivel HTTP (capa controller/validator/route), lo que los tests unitarios de
 * `AcceptanceService` no ejercitan: auth (401), el flujo feliz de un usuario web nuevo,
 * y los dos errores de validación documentados en el spec e i18n `es`/`en`.
 *
 * Convenciones (siguiendo `legal_documents_management.spec.ts`):
 *  - Usuarios de prueba con email único basado en timestamp, sin transacciones,
 *    cleanup explícito en `group.teardown`.
 *  - `client.loginAs(user)` (plugin `authApiClient`) emite un access token real. Ese
 *    token no tiene fila en `api_tokens` (tabla propia de refresh/origin), así que
 *    `resolveAudience` cae al fallback `'web'` — exactamente la audiencia que esta HU
 *    necesita probar (aviso + términos, nunca biométrico).
 */

const TEST_PASSWORD = 'ConsentTest123!'
const DEFAULT_ROLE_ID = 2 // rh-manager: el consentimiento es personal (sin RBAC), cualquier rol autenticado aplica.

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'Consent'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = DEFAULT_ROLE_ID
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await UserConsent.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/** Versión vigente real de un tipo, para no hardcodear "1.0" (frágil ante reseeds). */
async function currentVersion(type: LegalDocumentType): Promise<string> {
  const doc = await LegalDocument.query()
    .where('legal_document_type', type)
    .where('legal_document_is_current', true)
    .firstOrFail()
  return doc.legalDocumentVersion
}

/**
 * Un `documentVersion` inválido pero dentro del `maxLength(20)` del validador: debe
 * fallar en el service (`ConsentError`), no antes en Vine, para probar el 422 correcto.
 */
const INVALID_VERSION = '0.1-old'

test.group('Consentimiento /api/consent/me - auth (401 sin autenticación)', () => {
  test('GET /api/consent/me responde 401', async ({ client }) => {
    const response = await client.get('/api/consent/me')
    response.assertStatus(401)
  })

  test('POST /api/consent/me responde 401', async ({ client }) => {
    const response = await client.post('/api/consent/me').json({ documentVersion: '1.0' })
    response.assertStatus(401)
  })
})

test.group('Consentimiento /api/consent/me - flujo web de un usuario nuevo', (group) => {
  let actor: TestActor | null = null

  group.setup(async () => {
    actor = await createTestActor('nuevo')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('GET devuelve pendingDocuments = [privacy_notice, terms_conditions], sin biométrico, accepted:false', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/consent/me').loginAs(actor!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isFalse(body.data.accepted)
    assert.sameMembers(
      body.data.pendingDocuments.map((d: { type: string }) => d.type),
      ['privacy_notice', 'terms_conditions']
    )
    assert.isFalse(
      body.data.pendingDocuments.some((d: { type: string }) => d.type === 'biometric_consent')
    )
  })

  /**
   * Se acepta por `type` explícito (no el paquete retrocompatible "sin type"): el
   * paquete exige que privacy_notice y terms_conditions comparten el mismo
   * version-string vigente ([VALIDAR] #3 del spec), lo cual no siempre es cierto en
   * un ambiente compartido (p.ej. si ya se publicó una v2.x de un solo documento).
   * Aceptar por documento es la vía robusta y es, además, la que exige la regla de
   * negocio 3 del spec cuando los pendientes son granulares (solo uno de los dos).
   */
  test('POST con type=privacy_notice registra solo ese documento; terms_conditions sigue pendiente', async ({
    client,
    assert,
  }) => {
    const version = await currentVersion('privacy_notice')

    const response = await client
      .post('/api/consent/me')
      .loginAs(actor!.user)
      .json({ documentVersion: version, type: 'privacy_notice' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isFalse(body.data.accepted)
    assert.sameMembers(
      body.data.pendingDocuments.map((d: { type: string }) => d.type),
      ['terms_conditions']
    )
  })

  test('POST con type=terms_conditions completa la aceptación y responde accepted:true', async ({
    client,
    assert,
  }) => {
    const version = await currentVersion('terms_conditions')

    const response = await client
      .post('/api/consent/me')
      .loginAs(actor!.user)
      .json({ documentVersion: version, type: 'terms_conditions' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isTrue(body.data.accepted)
    assert.lengthOf(body.data.pendingDocuments, 0)
    assert.exists(body.data.acceptedAt)
  })

  test('GET posterior confirma que la aceptación quedó registrada (accepted:true, sin pendientes)', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/consent/me').loginAs(actor!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.data.accepted)
    assert.lengthOf(body.data.pendingDocuments, 0)
  })
})

test.group('Consentimiento /api/consent/me - versión no vigente (422 CSNT.VAL.001)', (group) => {
  let actor: TestActor | null = null

  group.setup(async () => {
    actor = await createTestActor('version-vieja')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('POST con documentVersion que no coincide con la vigente responde 422 CSNT.VAL.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/consent/me')
      .loginAs(actor!.user)
      .json({ documentVersion: INVALID_VERSION })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'version-de-consentimiento-invalida')
    assert.equal(body.code, 'CSNT.VAL.001')
    assert.isNull(body.data)
  })

  test('mismo caso con Accept-Language: en responde título y detalle en inglés (i18n)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/consent/me')
      .header('Accept-Language', 'en')
      .loginAs(actor!.user)
      .json({ documentVersion: INVALID_VERSION })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, 'CSNT.VAL.001')
    assert.equal(body.message, 'Invalid consent version')
    assert.include(body.detail, 'does not match the current version')
  })
})

test.group('Consentimiento /api/consent/me - tipo inválido (422 CSNT.VAL.002)', (group) => {
  let actor: TestActor | null = null

  group.setup(async () => {
    actor = await createTestActor('tipo-invalido')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('POST con type fuera del enum responde 422 CSNT.VAL.002 con el detalle de Vine', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/consent/me')
      .loginAs(actor!.user)
      .json({ documentVersion: '1.0', type: 'not-a-real-type' })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'tipo-de-documento-invalido')
    assert.equal(body.code, 'CSNT.VAL.002')
    assert.exists(body.data?.errors)
  })

  test('POST sin documentVersion responde 422 CSNT.VAL.002 (validación Vine genérica)', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/consent/me').loginAs(actor!.user).json({})

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.code, 'CSNT.VAL.002')
    assert.exists(body.data?.errors)
  })
})

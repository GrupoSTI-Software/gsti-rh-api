import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import LegalDocument from '#models/legal_document'

/**
 * Tests funcionales — gestión y publicación de versiones de documentos legales
 * desde backoffice GSTI (USRH1783364449581).
 *
 * Cubre:
 *  - 401 sin autenticación en todos los verbos.
 *  - 403 para un usuario no-root en TODOS los verbos, incluido el histórico
 *    (regla de negocio 1).
 *  - Flujo completo con un usuario root: crear borrador → detalle → editar →
 *    publicar (reglas 2 y 4) → inmutabilidad tras publicar (regla 3) →
 *    colisión de versión duplicada → bloqueo de publicar sin ambos idiomas
 *    (regla 8) → histórico.
 *
 * Convenciones (siguiendo `business_unit_users_pivot.spec.ts`):
 *  - Usuarios de prueba con email único basado en timestamp, sin transacciones,
 *    cleanup explícito en `group.teardown`.
 *  - `client.loginAs(user)` (plugin `authApiClient`) emite un access token real.
 *  - Se usa `biometric_consent` para el flujo de gestión: es el tipo que el
 *    cimiento deja sin versión vigente, evitando interferir con `privacy_notice`/
 *    `terms_conditions` (sembrados en "1.0" y potencialmente usados por otros
 *    tests). Se restaura el estado previo de `biometric_consent` en el teardown.
 */

const TEST_PASSWORD = 'LegalDocsTest123!'
const ROOT_ROLE_ID = 3
const NON_ROOT_ROLE_ID = 2 // rh-manager: no tiene el permiso 'legal-documents' (solo-root)

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'LegalDocs'
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
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('Legal Documents Management - auth (401 sin autenticación)', () => {
  test('GET /api/legal-documents responde 401', async ({ client }) => {
    const response = await client.get('/api/legal-documents').qs({ type: 'terms_conditions' })
    response.assertStatus(401)
  })

  test('GET /api/legal-documents/:id responde 401', async ({ client }) => {
    const response = await client.get('/api/legal-documents/999999')
    response.assertStatus(401)
  })

  test('POST /api/legal-documents responde 401', async ({ client }) => {
    const response = await client.post('/api/legal-documents').json({
      type: 'biometric_consent',
      version: '999.0',
      content: { es: '<p>x</p>' },
    })
    response.assertStatus(401)
  })

  test('PUT /api/legal-documents/:id responde 401', async ({ client }) => {
    const response = await client.put('/api/legal-documents/999999').json({
      content: { es: '<p>x</p>' },
    })
    response.assertStatus(401)
  })

  test('POST /api/legal-documents/:id/publish responde 401', async ({ client }) => {
    const response = await client.post('/api/legal-documents/999999/publish')
    response.assertStatus(401)
  })
})

test.group('Legal Documents Management - solo root (403 en todos los verbos)', (group) => {
  let nonRoot: TestActor | null = null

  group.setup(async () => {
    nonRoot = await createTestActor(NON_ROOT_ROLE_ID, 'no-root')
  })

  group.teardown(async () => {
    await cleanupTestActor(nonRoot)
  })

  function assertForbidden(body: Record<string, unknown>, assert: import('@japa/assert').Assert) {
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.errorCode, 'LGDOC.FORB.001')
  }

  test('GET /api/legal-documents (histórico) responde 403 para no-root', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/legal-documents')
      .qs({ type: 'terms_conditions' })
      .loginAs(nonRoot!.user)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('GET /api/legal-documents/:id responde 403 para no-root', async ({ client, assert }) => {
    const response = await client.get('/api/legal-documents/1').loginAs(nonRoot!.user)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('POST /api/legal-documents responde 403 para no-root', async ({ client, assert }) => {
    const response = await client
      .post('/api/legal-documents')
      .loginAs(nonRoot!.user)
      .json({ type: 'biometric_consent', version: '999.0', content: { es: '<p>x</p>' } })

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('PUT /api/legal-documents/:id responde 403 para no-root', async ({ client, assert }) => {
    const response = await client
      .put('/api/legal-documents/1')
      .loginAs(nonRoot!.user)
      .json({ content: { es: '<p>x</p>' } })

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('POST /api/legal-documents/:id/publish responde 403 para no-root', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/legal-documents/1/publish').loginAs(nonRoot!.user)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })
})

test.group('Legal Documents Management - flujo de gestión (root)', (group) => {
  let root: TestActor | null = null
  let previousCurrentBiometricId: number | null = null
  const createdIds: number[] = []

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root')

    const previousCurrent = await LegalDocument.query()
      .where('legal_document_type', 'biometric_consent')
      .where('legal_document_is_current', true)
      .first()
    previousCurrentBiometricId = previousCurrent?.legalDocumentId ?? null
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await LegalDocument.query().whereIn('legal_document_id', createdIds).delete()
    }
    if (previousCurrentBiometricId !== null) {
      await LegalDocument.query()
        .where('legal_document_id', previousCurrentBiometricId)
        .update({ legal_document_is_current: true })
    }
    await cleanupTestActor(root)
  })

  // `version` tiene maxLength(20) en el validador: usar un sufijo corto del timestamp.
  const version = `t${Date.now().toString().slice(-8)}`
  let draftId: number

  test('POST /api/legal-documents crea un borrador con un solo idioma (regla 8)', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/legal-documents').loginAs(root!.user).json({
      type: 'biometric_consent',
      version,
      content: { es: '<p>Texto biométrico</p>' },
    })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.status, 'draft')
    assert.isFalse(body.data.isCurrent)
    assert.equal(body.data.content.es, '<p>Texto biométrico</p>')
    assert.equal(body.data.content.en, '')

    draftId = Number(body.data.id)
    createdIds.push(draftId)
  })

  test('GET /api/legal-documents/:id devuelve el detalle administrativo del borrador', async ({
    client,
    assert,
  }) => {
    const response = await client.get(`/api/legal-documents/${draftId}`).loginAs(root!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.id, draftId)
    assert.equal(body.data.version, version)
    assert.equal(body.data.status, 'draft')
  })

  test('PUT /api/legal-documents/:id completa el idioma faltante del borrador', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/legal-documents/${draftId}`)
      .loginAs(root!.user)
      .json({ content: { en: '<p>Biometric text</p>' } })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.content.es, '<p>Texto biométrico</p>')
    assert.equal(body.data.content.en, '<p>Biometric text</p>')
    assert.equal(body.data.status, 'draft')
  })

  test('POST /api/legal-documents/:id/publish publica el borrador y lo deja vigente (reglas 2 y 4)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/legal-documents/${draftId}/publish`)
      .loginAs(root!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.status, 'published')
    assert.isTrue(body.data.isCurrent)
    assert.exists(body.data.publishedAt)
    assert.equal(body.data.publishedBy.userId, root!.user.userId)
    assert.equal(body.data.publishedBy.email, root!.user.userEmail)
    assert.exists(body.data.publishedBy.name)

    const currentResponse = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'biometric_consent' })
      .loginAs(root!.user)
    currentResponse.assertStatus(200)
    assert.equal(currentResponse.body().data.version, version)
  })

  test('PUT sobre una versión ya publicada responde 409 (regla 3, inmutabilidad)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/legal-documents/${draftId}`)
      .loginAs(root!.user)
      .json({ content: { es: '<p>intento de edición</p>' } })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'version-publicada-inmutable')
    assert.equal(body.code, 'LGDOC.CONF.001')
  })

  test('POST publish sobre una versión ya publicada responde 409', async ({ client, assert }) => {
    const response = await client
      .post(`/api/legal-documents/${draftId}/publish`)
      .loginAs(root!.user)

    response.assertStatus(409)
    assert.equal(response.body().key, 'version-publicada-inmutable')
  })

  test('POST con (type, version) ya existente responde 409 (versión duplicada)', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/legal-documents').loginAs(root!.user).json({
      type: 'biometric_consent',
      version,
      content: { es: '<p>otro</p>', en: '<p>another</p>' },
    })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'version-duplicada')
    assert.equal(body.code, 'LGDOC.CONF.002')
  })

  test('publicar un borrador sin ambos idiomas responde 422 y permanece como borrador (regla 8)', async ({
    client,
    assert,
  }) => {
    const incompleteVersion = `${version}-inc`
    const createResponse = await client.post('/api/legal-documents').loginAs(root!.user).json({
      type: 'biometric_consent',
      version: incompleteVersion,
      content: { es: '<p>solo español</p>' },
    })
    createResponse.assertStatus(201)
    const incompleteId = Number(createResponse.body().data.id)
    createdIds.push(incompleteId)

    const publishResponse = await client
      .post(`/api/legal-documents/${incompleteId}/publish`)
      .loginAs(root!.user)

    publishResponse.assertStatus(422)
    const body = publishResponse.body()
    assert.equal(body.key, 'contenido-idioma-incompleto')
    assert.equal(body.code, 'LGDOC.VAL.002')

    const detailResponse = await client
      .get(`/api/legal-documents/${incompleteId}`)
      .loginAs(root!.user)
    assert.equal(detailResponse.body().data.status, 'draft')
  })

  test('GET /api/legal-documents (histórico) incluye la versión publicada y la marca vigente', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/legal-documents')
      .qs({ type: 'biometric_consent' })
      .loginAs(root!.user)

    response.assertStatus(200)
    const rows = response.body().data as Array<Record<string, unknown>>
    const published = rows.find((r) => r.id === draftId)
    assert.exists(published, 'la versión publicada debe aparecer en el histórico')
    assert.equal(published?.isCurrent, true)
  })

  test('GET /api/legal-documents/:id inexistente responde 404 en inglés con Accept-Language: en', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/legal-documents/999999999')
      .header('Accept-Language', 'en')
      .loginAs(root!.user)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'documento-legal-inexistente')
    assert.equal(body.code, 'LGDOC.NF.002')
    assert.include(body.detail, 'legal document version')
  })
})

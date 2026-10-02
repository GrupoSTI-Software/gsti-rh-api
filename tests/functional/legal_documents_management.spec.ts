import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import Role from '#models/role'
import LegalDocument from '#models/legal_document'
import ApiToken from '#models/api_token'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales — gestión y publicación de versiones de documentos legales
 * desde la consola de plataforma (USRH1790610965394).
 *
 * Cubre:
 *  - 401 sin autenticación en las 5 rutas nuevas (/api/platform/legal-documents).
 *  - 403 para actores sin plataforma: owner con loginAs (token BO), isPlatformAdmin
 *    con loginAs (token BO), root de tenant con loginAs (token BO).
 *  - 404 en las 5 rutas viejas (/api/legal-documents sin /current) — verificación en BD.
 *  - GET /api/legal-documents/current sigue respondiendo 200 (invariante, regla 4).
 *  - Flujo completo con actor de plataforma (token vía POST /api/platform/auth/login):
 *    crear borrador → detalle → editar → publicar → inmutabilidad →
 *    versión duplicada → sin ambos idiomas → histórico → 404 en inglés.
 *  - publishedBy.userId en respuesta y en BD coincide con el id del actor de plataforma.
 *
 * Actor de plataforma: User con isPlatformAdmin=true + token de la consola
 * (origin='platform', vía POST /api/platform/auth/login). client.loginAs emite
 * origin='web' y el guard platformAdmin lo rechaza con 403 — no sirve para el flujo.
 *
 * Molde del actor de plataforma: tests/functional/platform_admin_scope_bypass.spec.ts.
 * Molde original de gestión: tests/functional/legal_documents_management.spec.ts
 * (USRH1783364449581, reescrito en USRH1790610965394).
 */

const TEST_PASSWORD = 'LegalDocsPlatform123!'

interface TestActor {
  user: User
  person: Person
}

/** Actor genérico de backoffice (sin isPlatformAdmin). */
async function createTestActor(roleSlug: TestRoleSlug, emailPrefix: string): Promise<TestActor> {
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
  const role = await ensureRole(roleSlug)
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

/** Actor de plataforma: isPlatformAdmin = true; el login de consola emite origin='platform'. */
async function createPlatformAdmin(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'LegalDocs',
    personLastname: 'Platform',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

/** Inicia sesión en la consola de plataforma y devuelve el Bearer token (origin='platform'). */
async function loginPlatformConsole(
  client: import('@japa/api-client').ApiClient,
  email: string
): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = (response.body() as { data?: { token?: string } }).data?.token
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
}

async function cleanupTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await ApiToken.query().where('tokenable_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 — sin autenticación en las 5 rutas nuevas
// ─────────────────────────────────────────────────────────────────────────────
test.group('Legal Documents Management - auth (401 sin autenticación)', () => {
  test('GET /api/platform/legal-documents responde 401', async ({ client }) => {
    const response = await client.get('/api/platform/legal-documents').qs({ type: 'terms_conditions' })
    response.assertStatus(401)
  })

  test('GET /api/platform/legal-documents/:id responde 401', async ({ client }) => {
    const response = await client.get('/api/platform/legal-documents/999999')
    response.assertStatus(401)
  })

  test('POST /api/platform/legal-documents responde 401', async ({ client }) => {
    const response = await client.post('/api/platform/legal-documents').json({
      type: 'biometric_consent',
      version: '999.0',
      content: { es: '<p>x</p>' },
    })
    response.assertStatus(401)
  })

  test('PUT /api/platform/legal-documents/:id responde 401', async ({ client }) => {
    const response = await client.put('/api/platform/legal-documents/999999').json({
      content: { es: '<p>x</p>' },
    })
    response.assertStatus(401)
  })

  test('POST /api/platform/legal-documents/:id/publish responde 401', async ({ client }) => {
    const response = await client.post('/api/platform/legal-documents/999999/publish')
    response.assertStatus(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 403 — actores sin sesión de consola (reglas 1, 2 y 3)
// ─────────────────────────────────────────────────────────────────────────────
test.group('Legal Documents Management - 403 por actor (reglas 1, 2 y 3)', (group) => {
  let owner: TestActor | null = null
  let platformAdminWithBoToken: TestActor | null = null

  group.setup(async () => {
    owner = await createTestActor('owner', 'owner-lgdoc')
    platformAdminWithBoToken = await createPlatformAdmin('platform-bo-lgdoc')
  })

  group.teardown(async () => {
    await cleanupTestActor(owner)
    await cleanupTestActor(platformAdminWithBoToken)
  })

  function assertPlatformForbidden(body: Record<string, unknown>, assert: import('@japa/assert').Assert) {
    assert.equal(body.key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isUndefined(body.code)
    assert.equal(body.title, 'Acceso restringido a plataforma')
  }

  // --- owner con token BO (regla 2) ---
  test('owner con loginAs recibe 403 en GET /api/platform/legal-documents', async ({ client, assert }) => {
    const response = await client
      .get('/api/platform/legal-documents')
      .qs({ type: 'terms_conditions' })
      .loginAs(owner!.user)
    response.assertStatus(403)
    assertPlatformForbidden(response.body(), assert)
  })

  test('owner con loginAs recibe 403 en POST /api/platform/legal-documents', async ({ client, assert }) => {
    const response = await client
      .post('/api/platform/legal-documents')
      .loginAs(owner!.user)
      .json({ type: 'biometric_consent', version: '999.0', content: { es: '<p>x</p>' } })
    response.assertStatus(403)
    assertPlatformForbidden(response.body(), assert)
  })

  test('owner con loginAs recibe 403 en POST /api/platform/legal-documents/:id/publish', async ({ client, assert }) => {
    const response = await client
      .post('/api/platform/legal-documents/1/publish')
      .loginAs(owner!.user)
    response.assertStatus(403)
    assertPlatformForbidden(response.body(), assert)
  })

  // --- isPlatformAdmin con token BO (regla 3: sesión de backoffice no basta) ---
  test('isPlatformAdmin con loginAs (token BO) recibe 403 en GET /api/platform/legal-documents', async ({ client, assert }) => {
    const response = await client
      .get('/api/platform/legal-documents')
      .qs({ type: 'terms_conditions' })
      .loginAs(platformAdminWithBoToken!.user)
    response.assertStatus(403)
    assertPlatformForbidden(response.body(), assert)
  })

  test('isPlatformAdmin con loginAs (token BO) recibe 403 en POST /api/platform/legal-documents', async ({ client, assert }) => {
    const response = await client
      .post('/api/platform/legal-documents')
      .loginAs(platformAdminWithBoToken!.user)
      .json({ type: 'biometric_consent', version: '999.0', content: { es: '<p>x</p>' } })
    response.assertStatus(403)
    assertPlatformForbidden(response.body(), assert)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 404 — rutas viejas de gestión retiradas (regla 4 del spec, S1 de seguridad)
// ─────────────────────────────────────────────────────────────────────────────
test.group('Legal Documents Management - rutas viejas retiran (404)', (group) => {
  let owner: TestActor | null = null

  group.setup(async () => {
    owner = await createTestActor('owner', 'owner-lgdoc-404')
  })

  group.teardown(async () => {
    await cleanupTestActor(owner)
  })

  test('GET /api/legal-documents responde 404 (ruta retirada)', async ({ client }) => {
    const response = await client
      .get('/api/legal-documents')
      .qs({ type: 'terms_conditions' })
      .loginAs(owner!.user)
    response.assertStatus(404)
  })

  test('GET /api/legal-documents/:id responde 404 (ruta retirada)', async ({ client }) => {
    const response = await client.get('/api/legal-documents/1').loginAs(owner!.user)
    response.assertStatus(404)
  })

  test('POST /api/legal-documents responde 404 (ruta retirada)', async ({ client }) => {
    const response = await client
      .post('/api/legal-documents')
      .loginAs(owner!.user)
      .json({ type: 'biometric_consent', version: '999.0', content: { es: '<p>x</p>' } })
    response.assertStatus(404)
  })

  test('PUT /api/legal-documents/:id responde 404 (ruta retirada)', async ({ client }) => {
    const response = await client
      .put('/api/legal-documents/1')
      .loginAs(owner!.user)
      .json({ content: { es: '<p>x</p>' } })
    response.assertStatus(404)
  })

  test('POST /api/legal-documents/:id/publish responde 404 (ruta retirada)', async ({ client }) => {
    const response = await client
      .post('/api/legal-documents/1/publish')
      .loginAs(owner!.user)
    response.assertStatus(404)
  })

  test('GET /api/legal-documents/current sigue respondiendo 200 (invariante, regla 4)', async ({ client, assert }) => {
    const response = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'privacy_notice' })
      .loginAs(owner!.user)
    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.equal(response.body().data.type, 'privacy_notice')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flujo completo desde la consola de plataforma (reglas 1, 5 y 6)
// ─────────────────────────────────────────────────────────────────────────────
test.group('Legal Documents Management - flujo de gestión (actor de plataforma)', (group) => {
  let platformAdmin: TestActor | null = null
  let platformToken: string = ''
  let previousCurrentBiometricId: number | null = null
  const createdIds: number[] = []

  group.setup(async () => {
    platformAdmin = await createPlatformAdmin('platform-lgdoc')
    // loginPlatformConsole se llama en cada test porque necesita `client`
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
    await cleanupTestActor(platformAdmin)
  })

  // `version` tiene maxLength(20): usar un sufijo corto del timestamp.
  const version = `pt${Date.now().toString().slice(-8)}`
  let draftId: number

  test('obtener token de consola via POST /api/platform/auth/login', async ({ client }) => {
    const previousCurrent = await LegalDocument.query()
      .where('legal_document_type', 'biometric_consent')
      .where('legal_document_is_current', true)
      .first()
    previousCurrentBiometricId = previousCurrent?.legalDocumentId ?? null

    platformToken = await loginPlatformConsole(client, platformAdmin!.user.userEmail)
  })

  test('POST /api/platform/legal-documents crea un borrador con un solo idioma (regla 5)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/platform/legal-documents')
      .header('Authorization', `Bearer ${platformToken}`)
      .json({
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

  test('GET /api/platform/legal-documents/:id devuelve el detalle del borrador', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/platform/legal-documents/${draftId}`)
      .header('Authorization', `Bearer ${platformToken}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.id, draftId)
    assert.equal(body.data.version, version)
    assert.equal(body.data.status, 'draft')
  })

  test('PUT /api/platform/legal-documents/:id completa el idioma faltante', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/platform/legal-documents/${draftId}`)
      .header('Authorization', `Bearer ${platformToken}`)
      .json({ content: { en: '<p>Biometric text</p>' } })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.content.es, '<p>Texto biométrico</p>')
    assert.equal(body.data.content.en, '<p>Biometric text</p>')
    assert.equal(body.data.status, 'draft')
  })

  test('POST /api/platform/legal-documents/:id/publish publica y registra el actor (reglas 5 y 6)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/platform/legal-documents/${draftId}/publish`)
      .header('Authorization', `Bearer ${platformToken}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.status, 'published')
    assert.isTrue(body.data.isCurrent)
    assert.exists(body.data.publishedAt)
    // publishedBy apunta al actor de plataforma (regla 6)
    assert.equal(body.data.publishedBy.userId, platformAdmin!.user.userId)
    assert.equal(body.data.publishedBy.email, platformAdmin!.user.userEmail)
    assert.exists(body.data.publishedBy.name)

    // Verificar en BD que published_by_user_id es el actor de plataforma
    const row = await LegalDocument.query().where('legal_document_id', draftId).firstOrFail()
    assert.equal(row.legalDocumentPublishedByUserId, platformAdmin!.user.userId)
    assert.isTrue(Boolean(row.legalDocumentIsCurrent))

    // GET /current del tipo publicado devuelve la versión nueva
    const currentResponse = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'biometric_consent' })
      .header('Authorization', `Bearer ${platformToken}`)
    currentResponse.assertStatus(200)
    assert.equal(currentResponse.body().data.version, version)
  })

  test('PUT sobre una versión ya publicada responde 409 (inmutabilidad, regla 5)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/platform/legal-documents/${draftId}`)
      .header('Authorization', `Bearer ${platformToken}`)
      .json({ content: { es: '<p>intento de edición</p>' } })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'version-publicada-inmutable')
    assert.equal(body.code, 'LGDOC.CONF.001')
  })

  test('POST publish sobre una versión ya publicada responde 409', async ({ client, assert }) => {
    const response = await client
      .post(`/api/platform/legal-documents/${draftId}/publish`)
      .header('Authorization', `Bearer ${platformToken}`)

    response.assertStatus(409)
    assert.equal(response.body().key, 'version-publicada-inmutable')
  })

  test('POST con (type, version) ya existente responde 409 (versión duplicada, regla 5)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/platform/legal-documents')
      .header('Authorization', `Bearer ${platformToken}`)
      .json({
        type: 'biometric_consent',
        version,
        content: { es: '<p>otro</p>', en: '<p>another</p>' },
      })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'version-duplicada')
    assert.equal(body.code, 'LGDOC.CONF.002')
  })

  test('publicar sin ambos idiomas responde 422 y el borrador sigue como draft (regla 5)', async ({
    client,
    assert,
  }) => {
    const incompleteVersion = `${version}-i`
    const createResponse = await client
      .post('/api/platform/legal-documents')
      .header('Authorization', `Bearer ${platformToken}`)
      .json({
        type: 'biometric_consent',
        version: incompleteVersion,
        content: { es: '<p>solo español</p>' },
      })
    createResponse.assertStatus(201)
    const incompleteId = Number(createResponse.body().data.id)
    createdIds.push(incompleteId)

    const publishResponse = await client
      .post(`/api/platform/legal-documents/${incompleteId}/publish`)
      .header('Authorization', `Bearer ${platformToken}`)

    publishResponse.assertStatus(422)
    const body = publishResponse.body()
    assert.equal(body.key, 'contenido-idioma-incompleto')
    assert.equal(body.code, 'LGDOC.VAL.002')

    // El borrador no cambió de estado
    const detailResponse = await client
      .get(`/api/platform/legal-documents/${incompleteId}`)
      .header('Authorization', `Bearer ${platformToken}`)
    assert.equal(detailResponse.body().data.status, 'draft')
  })

  test('GET /api/platform/legal-documents (histórico) incluye la versión publicada', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/platform/legal-documents')
      .qs({ type: 'biometric_consent' })
      .header('Authorization', `Bearer ${platformToken}`)

    response.assertStatus(200)
    const rows = response.body().data as Array<Record<string, unknown>>
    const published = rows.find((r) => r.id === draftId)
    assert.exists(published, 'la versión publicada debe aparecer en el histórico')
    assert.equal(published?.isCurrent, true)
  })

  test('GET /api/platform/legal-documents/:id inexistente responde 404 en inglés (Accept-Language: en)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/platform/legal-documents/999999999')
      .header('Authorization', `Bearer ${platformToken}`)
      .header('Accept-Language', 'en')

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'documento-legal-inexistente')
    assert.equal(body.code, 'LGDOC.NF.002')
    assert.include(body.detail, 'legal document version')
  })
})

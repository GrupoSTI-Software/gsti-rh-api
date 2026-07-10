import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import LegalDocument from '#models/legal_document'

/**
 * Tests funcionales — `GET /api/legal-documents/current` (cimiento, USRH1783058893786),
 * consumido por USRH1783369535608 para mostrar contenido/versión vigentes en el
 * onboarding de `gsti-rh-bo` (fuera de este repo).
 *
 * `legal_documents_management.spec.ts` ya toca este endpoint de forma incidental (tras
 * publicar un borrador de `biometric_consent`); estos tests lo cubren de forma dedicada:
 * 200 para los dos tipos que la web exige, 404 `LGDOC.NF.001` para un tipo sin versión
 * vigente publicada, 422 `LGDOC.VAL.001` para `type` faltante/inválido, e i18n `en`.
 *
 * Convenciones (siguiendo `legal_documents_management.spec.ts` / `consent_acceptance.spec.ts`):
 *  - Usuarios de prueba con email único basado en timestamp, sin transacciones, cleanup
 *    explícito en `group.teardown`.
 *  - Caso 404: el ambiente compartido de desarrollo puede tener ya una versión vigente
 *    de `biometric_consent` (publicada manualmente al probar la gestión GSTI, fuera del
 *    seed limpio que asume `0047_legal_documents_seeder.ts`). El grupo 404 captura el
 *    `is_current` real antes de la prueba, lo apaga temporalmente para forzar el caso
 *    "sin versión vigente", y lo restaura en el teardown — mismo patrón de
 *    captura/restauración que ya usa `legal_documents_management.spec.ts`.
 */

const TEST_PASSWORD = 'LegalDocCurrentTest123!'
const DEFAULT_ROLE_ID = 2 // rh-manager: `/current` solo exige auth, no el permiso de gestión (solo-root).

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'LegalDocCurrent'
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
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('GET /api/legal-documents/current - auth (401 sin autenticación)', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'privacy_notice' })
    response.assertStatus(401)
  })
})

test.group('GET /api/legal-documents/current - documento vigente (200)', (group) => {
  let actor: TestActor | null = null

  group.setup(async () => {
    actor = await createTestActor('current-ok')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
  })

  test('type=privacy_notice devuelve la versión y contenido vigentes', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'privacy_notice' })
      .loginAs(actor!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.type, 'privacy_notice')
    assert.isString(body.data.version)
    assert.isNotEmpty(body.data.version)
    // `content` siempre es string (fallback `''` en `buildDto`, nunca null): no se
    // asume no-vacío aquí porque el dato vigente real del ambiente compartido puede
    // variar; el contrato (nunca null, nunca crash) es lo que valida este caso.
    assert.isString(body.data.content)
    assert.exists(body.data.publishedAt)
  })

  test('type=terms_conditions devuelve la versión y contenido vigentes', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/legal-documents/current')
      .qs({ type: 'terms_conditions' })
      .loginAs(actor!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.type, 'terms_conditions')
    assert.isString(body.data.version)
    assert.isString(body.data.content)
  })
})

test.group(
  'GET /api/legal-documents/current - sin versión vigente publicada (404 LGDOC.NF.001)',
  (group) => {
    let actor: TestActor | null = null
    let previousCurrentBiometricId: number | null = null

    group.setup(async () => {
      actor = await createTestActor('current-404')

      const previousCurrent = await LegalDocument.query()
        .where('legal_document_type', 'biometric_consent')
        .where('legal_document_is_current', true)
        .first()
      previousCurrentBiometricId = previousCurrent?.legalDocumentId ?? null

      if (previousCurrentBiometricId !== null) {
        await LegalDocument.query()
          .where('legal_document_id', previousCurrentBiometricId)
          .update({ legal_document_is_current: false })
      }
    })

    group.teardown(async () => {
      if (previousCurrentBiometricId !== null) {
        await LegalDocument.query()
          .where('legal_document_id', previousCurrentBiometricId)
          .update({ legal_document_is_current: true })
      }
      await cleanupTestActor(actor)
    })

    test('type=biometric_consent responde 404 LGDOC.NF.001', async ({ client, assert }) => {
      const response = await client
        .get('/api/legal-documents/current')
        .qs({ type: 'biometric_consent' })
        .loginAs(actor!.user)

      response.assertStatus(404)
      const body = response.body()
      assert.equal(body.type, 'error')
      assert.equal(body.key, 'documento-legal-sin-version-vigente')
      assert.equal(body.code, 'LGDOC.NF.001')
    })

    test('mismo caso con Accept-Language: en responde el detalle en inglés (i18n)', async ({
      client,
      assert,
    }) => {
      const response = await client
        .get('/api/legal-documents/current')
        .qs({ type: 'biometric_consent' })
        .header('Accept-Language', 'en')
        .loginAs(actor!.user)

      response.assertStatus(404)
      const body = response.body()
      assert.equal(body.code, 'LGDOC.NF.001')
      assert.include(body.detail, 'no published current version')
    })
  }
)

test.group(
  'GET /api/legal-documents/current - parámetro type inválido (422 LGDOC.VAL.001)',
  (group) => {
    let actor: TestActor | null = null

    group.setup(async () => {
      actor = await createTestActor('current-422')
    })

    group.teardown(async () => {
      await cleanupTestActor(actor)
    })

    test('sin type responde 422 con el mensaje de parámetro faltante', async ({
      client,
      assert,
    }) => {
      const response = await client.get('/api/legal-documents/current').loginAs(actor!.user)

      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.type, 'error')
      assert.equal(body.key, 'tipo-de-documento-invalido')
      assert.equal(body.code, 'LGDOC.VAL.001')
      assert.include(body.detail, "'type'")
    })

    test('con type fuera del enum responde 422', async ({ client, assert }) => {
      const response = await client
        .get('/api/legal-documents/current')
        .qs({ type: 'not-a-real-type' })
        .loginAs(actor!.user)

      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.key, 'tipo-de-documento-invalido')
      assert.equal(body.code, 'LGDOC.VAL.001')
    })
  }
)

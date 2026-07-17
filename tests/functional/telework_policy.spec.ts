import { test } from '@japa/runner'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import TeleworkPolicy from '#models/telework_policy'

/**
 * Tests funcionales — editor del borrador de la Política de Teletrabajo
 * (NOM-037-STPS-2023, numeral 5.2, USRH1783566072187).
 *
 * Cubre:
 *  - 401 sin autenticación en los 5 endpoints.
 *  - 403 para un usuario sin permiso del módulo `telework-policy` (rol `empleado`).
 *  - Flujo completo con un usuario `root` (bypass RBAC): estado sin borrador →
 *    plantilla base → inicializar desde plantilla → 409 al reinicializar →
 *    editar (con componente vacío → `missingComponentKeys`) → 422 estructura
 *    inválida (set de `key` incorrecto) → 422 cantidad inválida (Vine) →
 *    descartar → 404 tras descartar → reinicializar en blanco (version
 *    incrementada, nunca reutilizada) → `missingComponentKeys` con los 12.
 *
 * Convenciones (siguiendo `legal_documents_management.spec.ts`):
 *  - Usuarios de prueba con email único basado en timestamp, sin transacciones,
 *    cleanup explícito en `group.teardown`.
 *  - El header `X-Business-Unit-Id` requiere el código público UUID v4 de la
 *    empresa (`business_unit_public_id`), nunca el id interno.
 */

const TEST_PASSWORD = 'TeleworkPolicyTest123!'
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
  person.personFirstname = 'TeleworkPolicy'
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

test.group('TeleworkPolicy - auth (401 sin autenticación)', () => {
  test('GET /api/nom037/telework-policy responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-policy')
    response.assertStatus(401)
  })

  test('GET /api/nom037/telework-policy/template responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-policy/template')
    response.assertStatus(401)
  })

  test('POST /api/nom037/telework-policy/initialize responde 401', async ({ client }) => {
    const response = await client
      .post('/api/nom037/telework-policy/initialize')
      .json({ mode: 'template' })
    response.assertStatus(401)
  })

  test('PUT /api/nom037/telework-policy responde 401', async ({ client }) => {
    const response = await client
      .put('/api/nom037/telework-policy')
      .json({ title: 'x', components: [] })
    response.assertStatus(401)
  })

  test('DELETE /api/nom037/telework-policy/draft responde 401', async ({ client }) => {
    const response = await client.delete('/api/nom037/telework-policy/draft')
    response.assertStatus(401)
  })
})

test.group('TeleworkPolicy - sin permiso (403)', (group) => {
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

  function assertForbidden(body: Record<string, unknown>, assert: import('@japa/assert').Assert) {
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.errorCode, 'TWP.AUTH.001')
  }

  test('GET /api/nom037/telework-policy responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('GET /api/nom037/telework-policy/template responde 403 sin permiso', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('POST /api/nom037/telework-policy/initialize responde 403 sin permiso', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/initialize')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ mode: 'template' })

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('PUT /api/nom037/telework-policy responde 403 sin permiso', async ({ client, assert }) => {
    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'x', components: [] })

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })

  test('DELETE /api/nom037/telework-policy/draft responde 403 sin permiso', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete('/api/nom037/telework-policy/draft')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assertForbidden(response.body(), assert)
  })
})

test.group('TeleworkPolicy - aislamiento entre empresas', (group) => {
  const RH_MANAGER_ROLE_ID = 2

  let rhManagerA: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null

  group.setup(async () => {
    businessUnitA = await getPrimaryBusinessUnit()

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    businessUnitB = new BusinessUnit()
    businessUnitB.businessUnitName = `TeleworkPolicy Isolation ${stamp}`
    businessUnitB.businessUnitSlug = `telework-policy-isolation-${stamp}`
    businessUnitB.businessUnitLegalName = `TeleworkPolicy Isolation Legal ${stamp}`
    businessUnitB.businessUnitActive = 1
    await businessUnitB.save()

    // El usuario solo tiene asignada la empresa A (regla de negocio 7:
    // aislamiento por empresa) — nunca la B.
    rhManagerA = await createTestActor(RH_MANAGER_ROLE_ID, 'rh-manager-a')
    await rhManagerA.user.related('businessUnits').attach([businessUnitA.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(rhManagerA)
    if (businessUnitB) {
      await BusinessUnit.query().where('business_unit_id', businessUnitB.businessUnitId).delete()
    }
  })

  test('GET con X-Business-Unit-Id de una empresa fuera de su alcance responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(rhManagerA!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('PUT con X-Business-Unit-Id de una empresa fuera de su alcance responde 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(rhManagerA!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)
      .json({ title: 'x', components: [] })

    response.assertStatus(404)
    assert.equal(response.body().key, 'BU.NOT.001')
  })

  test('GET con X-Business-Unit-Id de su propia empresa responde 200 (control positivo)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(rhManagerA!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })
})

test.group('TeleworkPolicy - header X-Business-Unit-Id', () => {
  test('responde 400 cuando falta el header X-Business-Unit-Id', async ({ client, assert }) => {
    const actor = await createTestActor(ROOT_ROLE_ID, 'header-missing')
    try {
      const response = await client.get('/api/nom037/telework-policy').loginAs(actor.user)
      response.assertStatus(400)
      assert.equal(response.body().key, 'BU.VAL.000')
    } finally {
      await cleanupTestActor(actor)
    }
  })
})

test.group('TeleworkPolicy - flujo completo (root)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root')
    businessUnit = await getPrimaryBusinessUnit()

    // Determinismo: garantiza que la empresa arranca sin ninguna política previa
    // (incluye posibles filas huérfanas de una corrida anterior interrumpida).
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

  test('GET /api/nom037/telework-policy responde exists=false cuando no hay borrador', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.exists, false)
    assert.isNull(body.data.policy)
  })

  test('GET /api/nom037/telework-policy/template devuelve los 12 componentes sembrados', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.data.isCurrent)
    assert.lengthOf(body.data.components, 12)
    assert.equal(body.data.components[0].key, '5_2_a')
  })

  let draftId: number

  test('POST /api/nom037/telework-policy/initialize (mode=template) crea el borrador version 1', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/initialize')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ mode: 'template' })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.data.version, 1)
    assert.equal(body.data.status, 'draft')
    assert.isFalse(body.data.isCurrent)
    assert.lengthOf(body.data.components, 12)
    assert.lengthOf(body.data.missingComponentKeys, 0)

    draftId = Number(body.data.id)
  })

  test('POST /api/nom037/telework-policy/initialize otra vez responde 409 politica-ya-existe', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/initialize')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ mode: 'template' })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'politica-ya-existe')
    assert.equal(body.code, 'TWP.CONF.001')
  })

  test('GET /api/nom037/telework-policy responde exists=true con el borrador creado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.data.exists)
    assert.equal(body.data.policy.id, draftId)
  })

  test('PUT /api/nom037/telework-policy edita el borrador y señala componentes faltantes', async ({
    client,
    assert,
  }) => {
    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>

    const editedComponents = templateComponents.map((component) =>
      component.key === '5_2_h'
        ? { key: component.key, title: component.title, body: '' }
        : { key: component.key, title: component.title, body: component.body }
    )

    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Política de Teletrabajo de Acme', components: editedComponents })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.title, 'Política de Teletrabajo de Acme')
    assert.deepEqual(body.data.missingComponentKeys, ['5_2_h'])
  })

  test('PUT con set de key incorrecto responde 422 estructura-componentes-invalida', async ({
    client,
    assert,
  }) => {
    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>

    // Duplica el primer key en vez de traer los 12 distintos esperados.
    const invalidComponents = templateComponents
      .slice(0, 11)
      .map((component) => ({ key: component.key, title: component.title, body: component.body }))
    invalidComponents.push({ ...invalidComponents[0] })

    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Título válido', components: invalidComponents })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'estructura-componentes-invalida')
    assert.equal(body.code, 'TWP.VAL.STRUCTURE.001')
    // El detalle accionable debe señalar exactamente qué se duplicó y qué falta.
    assert.deepEqual(body.data.duplicatedKeys, [invalidComponents[0].key])
    assert.deepEqual(body.data.missingKeys, [templateComponents[11].key])
    assert.deepEqual(body.data.unexpectedKeys, [])
  })

  test('PUT con menos de 12 componentes responde 422 entrada-invalida (Vine)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        title: 'Título válido',
        components: [{ key: '5_2_a', title: 'x', body: 'y' }],
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'entrada-invalida')
  })

  test('PUT con un componente que excede el máximo permitido responde 422 (no 413)', async ({
    client,
    assert,
  }) => {
    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>

    // Un solo componente por encima del límite (100 000 caracteres, ver
    // telework_policy_update.validator.ts) debe fallar con un 422 claro de
    // Vine, no con el 413 "Entity too large" crudo del bodyparser.
    const oversizedComponents = templateComponents.map((component, index) => ({
      key: component.key,
      title: component.title,
      body: index === 0 ? 'x'.repeat(100_001) : component.body,
    }))

    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Título válido', components: oversizedComponents })

    response.assertStatus(422)
    assert.equal(response.body().key, 'entrada-invalida')
  })

  test('PUT con los 12 componentes cerca del máximo permitido responde 200 (no 413)', async ({
    client,
    assert,
  }) => {
    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>

    // 12 × ~95 000 caracteres (~1.1 MB de body) debe caber cómodamente bajo
    // el límite global `json.limit: '2mb'` de config/bodyparser.ts.
    const largeComponents = templateComponents.map((component) => ({
      key: component.key,
      title: component.title,
      body: 'x'.repeat(95_000),
    }))

    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Título válido', components: largeComponents })

    response.assertStatus(200)
    assert.lengthOf(response.body().data.components[0].body, 95_000)
  })

  test('DELETE /api/nom037/telework-policy/draft descarta el borrador', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete('/api/nom037/telework-policy/draft')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })

  test('GET /api/nom037/telework-policy responde exists=false tras descartar', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.isFalse(response.body().data.exists)
  })

  test('PUT tras descartar responde 404 politica-inexistente', async ({ client, assert }) => {
    const templateResponse = await client
      .get('/api/nom037/telework-policy/template')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const templateComponents = templateResponse.body().data.components as Array<{
      key: string
      title: string
      body: string
    }>
    const validComponents = templateComponents.map((component) => ({
      key: component.key,
      title: component.title,
      body: component.body,
    }))

    const response = await client
      .put('/api/nom037/telework-policy')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ title: 'Título válido', components: validComponents })

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'politica-inexistente')
    assert.equal(body.code, 'TWP.NF.001')
  })

  test('DELETE tras descartar responde 404 politica-inexistente', async ({ client, assert }) => {
    const response = await client
      .delete('/api/nom037/telework-policy/draft')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'politica-inexistente')
  })

  test('POST initialize (mode=blank) tras descartar crea version 2 con los 12 componentes vacíos', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/nom037/telework-policy/initialize')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ mode: 'blank' })

    response.assertStatus(201)
    const body = response.body()
    // La versión nunca se reutiliza (regla de negocio): la v1 se descartó, ahora es v2.
    assert.equal(body.data.version, 2)
    assert.lengthOf(body.data.components, 12)
    assert.lengthOf(body.data.missingComponentKeys, 12)
    assert.equal(body.data.components[0].body, '')
  })
})

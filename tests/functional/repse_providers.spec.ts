import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import ProveedorRepse from '#models/proveedor_repse'
import ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import { computeRfcCheckDigit } from '../../app/shared/validators/rfc.validator.js'

/**
 * Tests funcionales — módulo "Proveedores REPSE" (USRH1784259105646, lado
 * contratante): catálogo de proveedores del tenant y bitácora de
 * validaciones periódicas de folio.
 *
 * Convenciones (siguiendo `physical_consent.spec.ts` / `repse_scope_tenant_isolation.spec.ts`):
 *  - Fixtures con timestamp único, sin transacciones, cleanup explícito en `group.teardown`.
 *  - `root` (bypass RBAC + scope total vía selección) para el flujo feliz y aislamiento
 *    cross-tenant; un actor `empleado` (sin permiso) para el caso 403.
 *  - El middleware de scope resuelve la request a UNA sola unidad de negocio (la del
 *    header `X-Business-Unit-Id`), incluso para `root` — por eso basta seleccionar
 *    distintas unidades para probar aislamiento sin necesitar la pivote `business_unit_users`.
 */

const TEST_PASSWORD = 'RepseProviderTest123!'
const ROOT_ROLE_ID = 3
const NO_PERMISSION_ROLE_ID = 4 // empleado: no tiene permiso del módulo repse-providers
const RH_MANAGER_ROLE_ID = 2 // tiene permiso granular vía el seeder 0052

/** PDF mínimo válido (magic bytes reales `%PDF-`). */
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf-8')
const VALID_PDF_NAME = 'evidencia-repse.pdf'

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
  person.personFirstname = 'RepseProvider'
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

async function createSecondaryBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `RepseProvider ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `repse-provider-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `RepseProvider ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function deleteBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

async function cleanupProveedor(proveedorRepseId: number | null) {
  if (!proveedorRepseId) return
  await ProveedorRepseValidacion.query().where('proveedor_repse_id', proveedorRepseId).delete()
  await ProveedorRepse.query().where('proveedor_repse_id', proveedorRepseId).delete()
}

function randomFolio(prefix: string): string {
  return `${prefix}-${uniqueStamp()}`
}

let rfcCounter = 0

/**
 * RFC persona moral con dígito verificador SAT válido (`isValidRfcSat`).
 * Formato: 3 letras + AAMMDD (6 dígitos) + 2 homoclave + 1 dígito verificador (12 chars).
 */
function randomRfc(): string {
  rfcCounter += 1
  const homoclave = String(rfcCounter % 100).padStart(2, '0')
  const base = `ABC850101${homoclave}` // 11 chars
  return `${base}${computeRfcCheckDigit(base)}` // 12 chars
}

test.group('RepseProviders - auth (401 sin autenticación)', () => {
  test('GET /api/repse-providers responde 401', async ({ client }) => {
    const response = await client.get('/api/repse-providers').qs({ page: 1, limit: 20 })
    response.assertStatus(401)
  })

  test('POST /api/repse-providers responde 401', async ({ client }) => {
    const response = await client.post('/api/repse-providers').json({})
    response.assertStatus(401)
  })

  test('GET /api/repse-providers/:providerId/validations responde 401', async ({ client }) => {
    const response = await client.get('/api/repse-providers/1/validations')
    response.assertStatus(401)
  })

  test('GET /api/repse-providers/:providerId/validations/:validationId/download responde 401', async ({
    client,
  }) => {
    const response = await client.get('/api/repse-providers/1/validations/1/download')
    response.assertStatus(401)
  })
})

test.group('RepseProviders - sin permiso (403)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE_ID, 'no-permiso')
    businessUnit = await createSecondaryBusinessUnit('no-permiso')
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET responde 403 sin el permiso read', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers')
      .qs({ page: 1, limit: 20 })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.errorCode, 'REPSEPROV.FORBID.001')
  })

  test('POST responde 403 sin el permiso create', async ({ client, assert }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor de prueba',
        rfc: randomRfc(),
        folio: randomFolio('SINPERM'),
        objetoRegistrado: 'Servicios de prueba',
        folioVencimiento: '2027-01-01',
      })

    response.assertStatus(403)
    assert.equal(response.body().errorCode, 'REPSEPROV.FORBID.001')
  })

  test('GET download responde 403 sin el permiso read', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers/1/validations/1/download')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assert.equal(response.body().errorCode, 'REPSEPROV.FORBID.001')
  })
})

test.group('RepseProviders - flujo feliz (CRUD + validaciones, root)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let providerId: number | null = null
  let validationId: number | null = null
  let otherProviderId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-happy')
    businessUnit = await createSecondaryBusinessUnit('happy')
  })

  group.teardown(async () => {
    await cleanupProveedor(otherProviderId)
    await cleanupProveedor(providerId)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('POST crea un proveedor REPSE (201, reviewStatus pending_first_validation)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Servicios Especializados Acme S.A. de C.V.',
        rfc: randomRfc(),
        folio: randomFolio('HAPPY'),
        objetoRegistrado: 'Servicios de limpieza industrial',
        folioVencimiento: '2027-01-01',
        periodicidadMeses: 1,
      })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    const provider = body.data.proveedorRepse
    assert.isNumber(provider.proveedorRepseId)
    assert.equal(provider.reviewStatus, 'pending_first_validation')
    assert.isNull(provider.nextReviewAt)
    providerId = provider.proveedorRepseId
  })

  test('GET /api/repse-providers/:id devuelve el proveedor creado', async ({ client, assert }) => {
    const response = await client
      .get(`/api/repse-providers/${providerId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.proveedorRepse.proveedorRepseId, providerId)
  })

  test('GET /api/repse-providers lista el proveedor creado', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers')
      .qs({ page: 1, limit: 50 })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.proveedoresRepse.data as Array<{ proveedorRepseId: number }>
    assert.isTrue(rows.some((row) => row.proveedorRepseId === providerId))
  })

  test('PUT actualiza la razón social del proveedor', async ({ client, assert }) => {
    const response = await client
      .put(`/api/repse-providers/${providerId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ razonSocial: 'Servicios Especializados Acme (actualizado)' })

    response.assertStatus(200)
    assert.equal(
      response.body().data.proveedorRepse.razonSocial,
      'Servicios Especializados Acme (actualizado)'
    )
  })

  test('POST validación registra evidencia y actualiza nextReviewAt del proveedor', async ({
    client,
    assert,
  }) => {
    const fecha = DateTime.now().toISODate()!

    const response = await client
      .post(`/api/repse-providers/${providerId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', fecha)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(201)
    const validation = response.body().data.validacion
    assert.equal(validation.estatus, 'vigente')
    assert.equal(validation.proveedorRepseId, providerId)
    assert.equal(validation.autorUserId, root!.user.userId)
    validationId = validation.proveedorRepseValidacionId

    const providerResponse = await client
      .get(`/api/repse-providers/${providerId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    const provider = providerResponse.body().data.proveedorRepse
    const expectedNextReviewAt = DateTime.fromISO(fecha).plus({ months: 1 }).toISODate()
    assert.equal(provider.nextReviewAt, expectedNextReviewAt)
    assert.notEqual(provider.reviewStatus, 'pending_first_validation')
  })

  test('GET download descarga la evidencia de la validación (200, mismo archivo subido)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/repse-providers/${providerId}/validations/${validationId}/download`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.header('content-type'), 'application/pdf')
    assert.include(response.header('content-disposition') ?? '', 'attachment')
    assert.include(response.header('content-disposition') ?? '', VALID_PDF_NAME)
    assert.equal(response.header('content-length'), String(VALID_PDF_BUFFER.length))
  })

  test('GET download de validación inexistente responde 404 con key validacion-no-encontrada', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/repse-providers/${providerId}/validations/999999999/download`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'validacion-no-encontrada')
  })

  test('GET download de una validación desde otro proveedor del mismo tenant responde 404', async ({
    client,
    assert,
  }) => {
    const createResponse = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Otro Proveedor Especializado S.A. de C.V.',
        rfc: randomRfc(),
        folio: randomFolio('OTHERPROV'),
        objetoRegistrado: 'Servicios de mantenimiento',
        folioVencimiento: '2027-01-01',
        periodicidadMeses: 1,
      })
    createResponse.assertStatus(201)
    otherProviderId = createResponse.body().data.proveedorRepse.proveedorRepseId

    const response = await client
      .get(`/api/repse-providers/${otherProviderId}/validations/${validationId}/download`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'validacion-no-encontrada')
  })

  test('GET validations lista la bitácora del proveedor', async ({ client, assert }) => {
    const response = await client
      .get(`/api/repse-providers/${providerId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const validaciones = response.body().data.validaciones as Array<{ proveedorRepseId: number }>
    assert.isAbove(validaciones.length, 0)
    assert.isTrue(validaciones.every((row) => row.proveedorRepseId === providerId))
  })

  test('DELETE aplica borrado lógico; GET posterior responde 404', async ({ client, assert }) => {
    const deleteResponse = await client
      .delete(`/api/repse-providers/${providerId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    deleteResponse.assertStatus(200)

    const showResponse = await client
      .get(`/api/repse-providers/${providerId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    showResponse.assertStatus(404)
    assert.equal(showResponse.body().key, 'proveedor-repse-no-encontrado')
  })
})

test.group('RepseProviders - validaciones de entrada (422/409)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let existingProviderId: number | null = null
  let existingFolio: string | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-val')
    businessUnit = await createSecondaryBusinessUnit('val')

    existingFolio = randomFolio('DUPCHECK')
    const provider = new ProveedorRepse()
    provider.businessUnitId = businessUnit.businessUnitId
    provider.razonSocial = 'Proveedor Existente'
    provider.rfc = randomRfc()
    provider.rfcHash = 'test-hash'
    provider.folio = existingFolio
    provider.objetoRegistrado = 'Servicio existente'
    provider.folioVencimiento = DateTime.now().plus({ years: 1 })
    provider.periodicidadMeses = 1
    await provider.save()
    existingProviderId = provider.proveedorRepseId
  })

  group.teardown(async () => {
    await cleanupProveedor(existingProviderId)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('POST sin folio responde 422', async ({ client, assert }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Sin folio',
        rfc: randomRfc(),
        objetoRegistrado: 'Servicio sin folio',
        folioVencimiento: '2027-01-01',
      })

    response.assertStatus(422)
    assert.equal(response.body().errorCode, 'REPSEPROV.VAL.001')
  })

  test('POST con RFC inválido responde 422', async ({ client, assert }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'RFC inválido',
        rfc: 'NOESUNRFC',
        folio: randomFolio('BADRFC'),
        objetoRegistrado: 'Servicio con RFC inválido',
        folioVencimiento: '2027-01-01',
      })

    response.assertStatus(422)
    assert.equal(response.body().type, 'error')
  })

  test('POST con folioVencimiento inválido aclara formato esperado (es)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor fecha mal',
        rfc: randomRfc(),
        folio: randomFolio('BADVENC'),
        objetoRegistrado: 'Servicio con fecha inválida',
        folioVencimiento: '20-01-2026',
      })

    response.assertStatus(422)
    assert.include(response.body().message, 'AAAA-MM-DD')
  })

  test('POST con folioVencimiento inválido aclara formato esperado (en)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')
      .json({
        razonSocial: 'Proveedor fecha mal',
        rfc: randomRfc(),
        folio: randomFolio('BADVENC'),
        objetoRegistrado: 'Servicio con fecha inválida',
        folioVencimiento: '20-01-2026',
      })

    response.assertStatus(422)
    assert.include(response.body().message, 'YYYY-MM-DD')
  })

  test('POST con folio duplicado (activo) en la misma empresa responde 409', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor duplicado',
        rfc: randomRfc(),
        folio: existingFolio,
        objetoRegistrado: 'Servicio duplicado',
        folioVencimiento: '2027-01-01',
      })

    response.assertStatus(409)
    assert.equal(response.body().key, 'folio-proveedor-repse-ya-registrado')
    assert.equal(response.body().errorCode, 'REPSEPROV.CONFLICT.FOLIO.001')
  })

  test('GET de proveedor inexistente responde 404', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'proveedor-repse-no-encontrado')
  })

  test('POST validación sin archivo responde 422 con key evidencia-invalida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', DateTime.now().toISODate()!)

    response.assertStatus(422)
    assert.equal(response.body().key, 'evidencia-invalida')
    assert.include(response.body().message, "No se recibió el parámetro 'archivo'")
  })

  test('POST validación con tipo de archivo no permitido responde 422', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', DateTime.now().toISODate()!)
      .file('archivo', Buffer.from('contenido de texto plano, no es evidencia válida'), {
        filename: 'evidencia.txt',
        contentType: 'text/plain',
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'evidencia-invalida')
    assert.include(response.body().message, 'Tipo de archivo no permitido')
  })

  test('POST validación con archivo demasiado grande responde 422', async ({ client, assert }) => {
    const oversizedPdf = Buffer.concat([
      VALID_PDF_BUFFER,
      Buffer.alloc(11 * 1024 * 1024, 0),
    ])

    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', DateTime.now().toISODate()!)
      .file('archivo', oversizedPdf, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.equal(response.body().key, 'evidencia-invalida')
    assert.include(response.body().message, 'excede el tamaño máximo')
  })

  test('POST validación con estatus inválido aclara opciones válidas (es)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'status_invalido')
      .field('fecha', DateTime.now().toISODate()!)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.include(response.body().message, "'vigente', 'no_vigente'")
    assert.include(response.body().message, 'opciones válidas')
  })

  test('POST validación con estatus inválido aclara opciones válidas (en)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')
      .field('estatus', 'status_invalido')
      .field('fecha', DateTime.now().toISODate()!)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.include(response.body().message, "'vigente', 'no_vigente'")
    assert.include(response.body().message, 'valid options are')
  })

  test('POST validación con fecha inválida aclara formato esperado (es)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', '20-01-2026')
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.include(response.body().message, 'AAAA-MM-DD')
  })

  test('POST validación con fecha inválida aclara formato esperado (en)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')
      .field('estatus', 'vigente')
      .field('fecha', '20-01-2026')
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.include(response.body().message, 'YYYY-MM-DD')
  })

  test('POST con folioVencimiento en el pasado responde 422 con key folio-vencimiento-pasado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor con folio ya vencido',
        rfc: randomRfc(),
        folio: randomFolio('VENCIDO'),
        objetoRegistrado: 'Servicio con folio vencido',
        folioVencimiento: DateTime.now().minus({ days: 1 }).toISODate(),
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'folio-vencimiento-pasado')
    assert.include(response.body().message, 'folioVencimiento')
  })

  test('PUT con folioVencimiento en el pasado responde 422 con key folio-vencimiento-pasado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/repse-providers/${existingProviderId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ folioVencimiento: DateTime.now().minus({ days: 1 }).toISODate() })

    response.assertStatus(422)
    assert.equal(response.body().key, 'folio-vencimiento-pasado')
  })

  test('POST validación con fecha futura responde 422 con key fecha-futura', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', DateTime.now().plus({ days: 1 }).toISODate()!)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.equal(response.body().key, 'fecha-futura')
    assert.include(response.body().message, 'no puede ser posterior a hoy')
  })

  test('POST validación con fecha anterior a la última registrada responde 422 con key fecha-anterior-a-ultima-validacion', async ({
    client,
    assert,
  }) => {
    const hoy = DateTime.now().toISODate()!
    const ayer = DateTime.now().minus({ days: 1 }).toISODate()!

    const first = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', hoy)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })
    first.assertStatus(201)

    const second = await client
      .post(`/api/repse-providers/${existingProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', ayer)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })

    second.assertStatus(422)
    assert.equal(second.body().key, 'fecha-anterior-a-ultima-validacion')
  })
})

test.group('RepseProviders - coherencia de reviewStatus/nextReviewAt', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let expiredFolioProviderId: number | null = null
  let periodicidadProviderId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-coherencia')
    businessUnit = await createSecondaryBusinessUnit('coherencia')
  })

  group.teardown(async () => {
    await cleanupProveedor(expiredFolioProviderId)
    await cleanupProveedor(periodicidadProviderId)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('reviewStatus es overdue si folioVencimiento ya pasó, aunque no haya validaciones', async ({
    client,
    assert,
  }) => {
    // Fixture directa al modelo: el folio ya vencido antes de que existiera
    // la regla `assertFolioVencimientoNotExpired` (p. ej. datos migrados).
    const provider = new ProveedorRepse()
    provider.businessUnitId = businessUnit!.businessUnitId
    provider.razonSocial = 'Proveedor con folio vencido, sin validaciones'
    provider.rfc = randomRfc()
    provider.rfcHash = 'test-hash-expired-folio'
    provider.folio = randomFolio('EXPIRED')
    provider.objetoRegistrado = 'Servicio con folio ya vencido'
    provider.folioVencimiento = DateTime.now().minus({ days: 5 })
    provider.periodicidadMeses = 6
    await provider.save()
    expiredFolioProviderId = provider.proveedorRepseId

    const response = await client
      .get(`/api/repse-providers/${expiredFolioProviderId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.proveedorRepse.reviewStatus, 'overdue')
    assert.isNull(response.body().data.proveedorRepse.nextReviewAt)
  })

  test('PUT que cambia periodicidadMeses recalcula nextReviewAt a partir de la última validación', async ({
    client,
    assert,
  }) => {
    const createResponse = await client
      .post('/api/repse-providers')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor con cambio de periodicidad',
        rfc: randomRfc(),
        folio: randomFolio('PERIOD'),
        objetoRegistrado: 'Servicio con cambio de periodicidad',
        folioVencimiento: '2027-01-01',
        periodicidadMeses: 6,
      })
    createResponse.assertStatus(201)
    periodicidadProviderId = createResponse.body().data.proveedorRepse.proveedorRepseId

    const fecha = DateTime.now().toISODate()!
    const validationResponse = await client
      .post(`/api/repse-providers/${periodicidadProviderId}/validations`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .field('estatus', 'vigente')
      .field('fecha', fecha)
      .file('archivo', VALID_PDF_BUFFER, { filename: VALID_PDF_NAME, contentType: 'application/pdf' })
    validationResponse.assertStatus(201)

    const beforeResponse = await client
      .get(`/api/repse-providers/${periodicidadProviderId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const expectedBefore = DateTime.fromISO(fecha).plus({ months: 6 }).toISODate()
    assert.equal(beforeResponse.body().data.proveedorRepse.nextReviewAt, expectedBefore)

    const updateResponse = await client
      .put(`/api/repse-providers/${periodicidadProviderId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ periodicidadMeses: 1 })
    updateResponse.assertStatus(200)

    const expectedAfter = DateTime.fromISO(fecha).plus({ months: 1 }).toISODate()
    assert.equal(updateResponse.body().data.proveedorRepse.nextReviewAt, expectedAfter)
    assert.notEqual(updateResponse.body().data.proveedorRepse.nextReviewAt, expectedBefore)
  })
})

test.group('RepseProviders - aislamiento multi-tenant (root, scope por selección)', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let providerIdA: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-tenant')
    businessUnitA = await createSecondaryBusinessUnit('tenant-a')
    businessUnitB = await createSecondaryBusinessUnit('tenant-b')

    const provider = new ProveedorRepse()
    provider.businessUnitId = businessUnitA.businessUnitId
    provider.razonSocial = 'Proveedor BU-A'
    provider.rfc = randomRfc()
    provider.rfcHash = 'test-hash-bu-a'
    provider.folio = randomFolio('TENANTA')
    provider.objetoRegistrado = 'Servicio de BU-A'
    provider.folioVencimiento = DateTime.now().plus({ years: 1 })
    provider.periodicidadMeses = 1
    await provider.save()
    providerIdA = provider.proveedorRepseId
  })

  group.teardown(async () => {
    await cleanupProveedor(providerIdA)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnitA)
    await deleteBusinessUnit(businessUnitB)
  })

  test('root con BU-A seleccionada ve el proveedor de BU-A', async ({ client, assert }) => {
    const response = await client
      .get(`/api/repse-providers/${providerIdA}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.proveedorRepse.proveedorRepseId, providerIdA)
  })

  test('root con BU-B seleccionada recibe 404 uniforme al pedir el proveedor de BU-A', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/repse-providers/${providerIdA}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'proveedor-repse-no-encontrado')
  })

  test('root con BU-B seleccionada no ve el proveedor de BU-A en el listado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/repse-providers')
      .qs({ page: 1, limit: 50 })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.proveedoresRepse.data as Array<{ proveedorRepseId: number }>
    assert.isFalse(rows.some((row) => row.proveedorRepseId === providerIdA))
  })
})

test.group('RepseProviders - i18n (Accept-Language)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-i18n')
    businessUnit = await createSecondaryBusinessUnit('i18n')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('404 en español (default)', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'es')

    response.assertStatus(404)
    assert.include(response.body().message, 'no existe o no pertenece al tenant actual')
  })

  test('404 en inglés (Accept-Language: en)', async ({ client, assert }) => {
    const response = await client
      .get('/api/repse-providers/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')

    response.assertStatus(404)
    assert.include(response.body().message, 'does not exist or does not belong to the current tenant')
  })

  test('sin ?limit= en la URL, el 422 aclara que es un query param (es)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/repse-providers')
      .qs({ page: 1 })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(422)
    assert.include(response.body().message, 'query param')
    assert.include(response.body().message, "'limit'")
  })

  test('sin ?limit= en la URL, el 422 aclara que es un query param (en)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/repse-providers')
      .qs({ page: 1 })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')

    response.assertStatus(422)
    assert.include(response.body().message, 'query param')
    assert.include(response.body().message, "'limit'")
  })
})

test.group('RepseProviders - permiso granular vía rol rh-manager (no root)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let providerId: number | null = null

  group.setup(async () => {
    actor = await createTestActor(RH_MANAGER_ROLE_ID, 'rh-manager')
    businessUnit = await createSecondaryBusinessUnit('rh-manager')
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupProveedor(providerId)
    await cleanupTestActor(actor)
    await deleteBusinessUnit(businessUnit)
  })

  test('rh-manager puede crear un proveedor gracias al permiso seedeado (0052)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/repse-providers')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        razonSocial: 'Proveedor de RH Manager',
        rfc: randomRfc(),
        folio: randomFolio('RHMGR'),
        objetoRegistrado: 'Servicio validado por rh-manager',
        folioVencimiento: '2027-01-01',
      })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    providerId = body.data.proveedorRepse.proveedorRepseId
  })
})

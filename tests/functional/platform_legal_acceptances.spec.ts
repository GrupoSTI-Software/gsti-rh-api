import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import LegalDocument, { type LegalDocumentType } from '#models/legal_document'
import Person from '#models/person'
import Role from '#models/role'
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import UserConsent from '#models/user_consent'
import ApiToken from '#models/api_token'
import { blindIndex } from '#utils/blind_index'

/**
 * USRH1790610965452 — contrato del listado de aceptaciones legales por empresa
 * (`GET /api/platform/legal-acceptances`): estado de Términos y Aviso por tenant.
 *
 * Cubre CA-1, CA-2, CA-3, CA-8, CA-11 y CA-13. Cada test monta su propio mundo
 * (empresas, cuentas, documentos vigentes) y lo desmonta al terminar, restaurando
 * los documentos vigentes globales de `sae_pruebas` que hubiera antes.
 */

const TEST_PASSWORD = 'LegalAcceptances123!'
const BASE_URL = '/api/platform/legal-acceptances'
const GENERIC_RFC = 'XAXX010101000'

const TERMS: LegalDocumentType = 'terms_conditions'
const PRIVACY: LegalDocumentType = 'privacy_notice'

const INVALID_FILTERS_BODY = {
  type: 'error',
  title: 'Filtros de aceptaciones inválidos',
  key: 'filtros-de-aceptaciones-invalidos',
  code: 'CONSENT.PLATFORM.001',
}

/** Todo lo que un test crea, para poder borrarlo sin tocar datos ajenos. */
interface World {
  stamp: string
  businessUnitIds: number[]
  userIds: number[]
  personIds: number[]
  roleIds: number[]
  legalDocumentIds: number[]
  /** Vigentes globales que había antes del test; se restauran en el teardown. */
  previousCurrentIds: number[]
}

interface TenantFixture {
  businessUnit: BusinessUnit
  role: Role
}

interface DocumentFact {
  status: string
  lastAcceptedAt: string | null
}

interface RowFact {
  businessUnitPublicId: string
  businessUnitName: string
  termsConditions: DocumentFact
  privacyNotice: DocumentFact
}

let world: World | null = null
let adminUser: User | null = null
let adminPerson: Person | null = null
let adminToken: string | null = null

function currentWorld(): World {
  if (!world) {
    throw new Error('El mundo del test no está montado')
  }
  return world
}

/** Versión corta (columna de 20 caracteres) y única por corrida para el par tipo+versión. */
function docVersion(w: World, suffix: string): string {
  return `QA${w.stamp.slice(-9)}-${suffix}`
}

function uniqueStamp(): string {
  return `${Date.now()}${Math.floor(Math.random() * 10_000)}`
}

/** Actor de plataforma: rol `root` existente + marca `isPlatformAdmin`. */
async function createPlatformAdmin(): Promise<void> {
  const email = `qa-legal-acc-admin-${uniqueStamp()}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  adminPerson = await Person.create({
    personFirstname: 'LegalAcceptances',
    personLastname: 'Admin',
    personSecondLastname: 'QA',
    personEmail: email,
  })
  adminUser = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: adminPerson.personId,
    userEmailType: 'institutional',
  })
}

/** Token de consola (`origin = 'platform'`); `loginAs` no sirve porque no lo emite. */
async function platformToken(client: ApiClient): Promise<string> {
  if (adminToken) {
    return adminToken
  }
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: adminUser!.userEmail,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token as string | undefined
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  adminToken = token
  return token
}

async function listAcceptances(
  client: ApiClient,
  query: Record<string, string | number>
): Promise<ApiResponse> {
  const token = await platformToken(client)
  return client.get(BASE_URL).qs(query).header('Authorization', `Bearer ${token}`)
}

/** Empresa de prueba con el sello de la corrida en el nombre, para filtrarla con `search`. */
async function createTenant(label: string): Promise<TenantFixture> {
  const w = currentWorld()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `QA-LA ${label} ${w.stamp}`,
    businessUnitSlug: `qa-la-${label.toLowerCase()}-${w.stamp}`,
    businessUnitLegalName: `QA-LA ${label} ${w.stamp} SA de CV`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  w.businessUnitIds.push(businessUnit.businessUnitId)

  const role = await Role.create({
    roleName: `QA-LA owner ${label} ${w.stamp}`,
    roleSlug: 'owner',
    businessUnitId: businessUnit.businessUnitId,
    roleActive: 1,
    roleDescription: 'fixture QA',
  })
  w.roleIds.push(role.roleId)

  return { businessUnit, role }
}

/** Cuenta de la empresa con membresía (rol en la pivote) — la cuenta dueña. */
async function createTenantOwner(tenant: TenantFixture, label: string): Promise<User> {
  const w = currentWorld()
  const email = `qa-la-${label.toLowerCase()}-${w.stamp}@gsti-tests.local`

  const person = await Person.create({
    personFirstname: 'QA',
    personLastname: 'Owner',
    personSecondLastname: label,
    personEmail: email,
  })
  w.personIds.push(person.personId)

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: tenant.role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  w.userIds.push(user.userId)

  await BusinessUnitUser.create({
    userId: user.userId,
    businessUnitId: tenant.businessUnit.businessUnitId,
    roleId: tenant.role.roleId,
  })

  return user
}

/**
 * Publica una versión del tipo y la deja como única vigente: primero apaga la vigente
 * previa del tipo (una sola vigente por tipo).
 */
async function publishDocument(
  type: LegalDocumentType,
  version: string,
  publishedAt: DateTime
): Promise<LegalDocument> {
  await LegalDocument.query()
    .where('legal_document_type', type)
    .update({ legalDocumentIsCurrent: false })

  const document = await LegalDocument.create({
    legalDocumentType: type,
    legalDocumentVersion: version,
    legalDocumentContent: { es: 'fixture' },
    legalDocumentIsCurrent: true,
    legalDocumentStatus: 'published',
    legalDocumentPublishedAt: publishedAt,
  })
  currentWorld().legalDocumentIds.push(document.legalDocumentId)
  return document
}

async function acceptDocument(
  user: User,
  document: LegalDocument,
  acceptedAt: DateTime
): Promise<void> {
  await UserConsent.create({
    userId: user.userId,
    legalDocumentId: document.legalDocumentId,
    userConsentDocumentVersion: document.legalDocumentVersion,
    userConsentAcceptedAt: acceptedAt,
    userConsentIp: null,
    userConsentUserAgent: null,
  })
}

/** Busca la fila de una empresa por su sello; falla con mensaje claro si no viene. */
function findRow(rows: RowFact[], tenant: TenantFixture): RowFact {
  const row = rows.find((r) => r.businessUnitPublicId === tenant.businessUnit.businessUnitPublicId)
  if (!row) {
    throw new Error(`La empresa ${tenant.businessUnit.businessUnitName} no vino en el listado`)
  }
  return row
}

/** Compara el instante (no el texto) de una fecha ISO de la respuesta con la esperada. */
function sameInstant(actual: string | null, expected: DateTime): boolean {
  return actual !== null && DateTime.fromISO(actual).toMillis() === expected.toMillis()
}

test.group('GET /api/platform/legal-acceptances — contrato del listado', (group) => {
  group.setup(async () => {
    await createPlatformAdmin()
  })

  group.teardown(async () => {
    if (adminUser) {
      await ApiToken.query().where('tokenable_id', adminUser.userId).delete()
      await db.from('users').where('user_id', adminUser.userId).delete()
    }
    if (adminPerson) {
      await db.from('people').where('person_id', adminPerson.personId).delete()
    }
  })

  group.each.setup(async () => {
    const previous = await db
      .from('legal_documents')
      .whereIn('legal_document_type', [TERMS, PRIVACY])
      .where('legal_document_is_current', 1)
      .select('legal_document_id')

    world = {
      stamp: uniqueStamp(),
      businessUnitIds: [],
      userIds: [],
      personIds: [],
      roleIds: [],
      legalDocumentIds: [],
      previousCurrentIds: previous.map((r: { legal_document_id: number }) =>
        Number(r.legal_document_id)
      ),
    }

    // Catálogo determinista: sin vigentes de Términos ni Aviso hasta que el test publique.
    await db
      .from('legal_documents')
      .whereIn('legal_document_type', [TERMS, PRIVACY])
      .update({ legal_document_is_current: 0 })
  })

  group.each.teardown(async () => {
    const w = world
    world = null
    if (!w) {
      return
    }

    try {
      if (w.userIds.length > 0) {
        await db.from('user_consents').whereIn('user_id', w.userIds).delete()
      }
      if (w.legalDocumentIds.length > 0) {
        await db.from('user_consents').whereIn('legal_document_id', w.legalDocumentIds).delete()
      }
      if (w.businessUnitIds.length > 0) {
        await db.from('business_unit_users').whereIn('business_unit_id', w.businessUnitIds).delete()
        await db
          .from('tenant_billing_profiles')
          .whereIn('business_unit_id', w.businessUnitIds)
          .delete()
      }
      if (w.userIds.length > 0) {
        await db.from('users').whereIn('user_id', w.userIds).delete()
      }
      if (w.personIds.length > 0) {
        await db.from('people').whereIn('person_id', w.personIds).delete()
      }
      if (w.roleIds.length > 0) {
        await db.from('roles').whereIn('role_id', w.roleIds).delete()
      }
      if (w.businessUnitIds.length > 0) {
        await db.from('business_units').whereIn('business_unit_id', w.businessUnitIds).delete()
      }
      if (w.legalDocumentIds.length > 0) {
        await db.from('legal_documents').whereIn('legal_document_id', w.legalDocumentIds).delete()
      }
    } finally {
      // Va en `finally`: si algún borrado truena, el catálogo global (compartido con otras
      // suites) se restaura igual y `sae_pruebas` nunca se queda sin vigentes.
      // Restaura el catálogo global tal como estaba. Una sola transacción: apagar y
      // reencender van juntos o ninguno, así nunca queda a medias.
      await db.transaction(async (trx) => {
        await trx
          .from('legal_documents')
          .whereIn('legal_document_type', [TERMS, PRIVACY])
          .update({ legal_document_is_current: 0 })
        if (w.previousCurrentIds.length > 0) {
          await trx
            .from('legal_documents')
            .whereIn('legal_document_id', w.previousCurrentIds)
            .update({ legal_document_is_current: 1 })
        }
      })
    }
  })

  test('CA-1: owner al día en ambos documentos', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que la empresa cuyo dueño aceptó las versiones vigentes de
     * Términos y Aviso aparece "al día" en ambos, con la fecha de su aceptación.
     *
     * Dado: empresa A con un owner que aceptó la vigente de Términos y la de Aviso.
     * Cuando: el administrador de plataforma lista filtrando por el sello de la corrida.
     * Entonces: 200; la fila de A trae `al-dia` con la fecha de aceptación en ambos y
     * `currentVersions` lleva las versiones vigentes.
     */
    const w = currentWorld()
    const termsAt = DateTime.fromISO('2026-03-10T09:15:00.000-06:00')
    const privacyAt = DateTime.fromISO('2026-03-11T10:30:00.000-06:00')
    const terms = await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
    )
    const privacy = await publishDocument(
      PRIVACY,
      docVersion(w, 'P1'),
      DateTime.fromISO('2026-03-02T12:00:00.000-06:00')
    )

    const tenantA = await createTenant('Alfa')
    const owner = await createTenantOwner(tenantA, 'Alfa')
    await acceptDocument(owner, terms, termsAt)
    await acceptDocument(owner, privacy, privacyAt)

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.currentVersions.termsConditions.version, terms.legalDocumentVersion)
    assert.equal(body.currentVersions.privacyNotice.version, privacy.legalDocumentVersion)

    const row = findRow(body.data, tenantA)
    assert.equal(row.termsConditions.status, 'al-dia')
    assert.isTrue(sameInstant(row.termsConditions.lastAcceptedAt, termsAt))
    assert.equal(row.privacyNotice.status, 'al-dia')
    assert.isTrue(sameInstant(row.privacyNotice.lastAcceptedAt, privacyAt))
    assert.deepEqual(Object.keys(row).sort(), [
      'businessUnitName',
      'businessUnitPublicId',
      'privacyNotice',
      'termsConditions',
    ])
  })

  test('CA-2: versión nueva publicada deja pendiente', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que publicar una versión nueva de Términos deja "pendiente"
     * a la empresa que había aceptado la anterior, sin tocar su estado del Aviso.
     *
     * Dado: empresa B cuyo owner aceptó Términos v1 y Aviso vigente; después se publica Términos v2.
     * Cuando: el administrador de plataforma lista.
     * Entonces: Términos `pendiente` con la fecha de v1, `currentVersions` apunta a v2
     * y el Aviso sigue `al-dia`.
     */
    const w = currentWorld()
    const termsV1At = DateTime.fromISO('2026-02-10T09:00:00.000-06:00')
    const privacyAt = DateTime.fromISO('2026-02-11T09:00:00.000-06:00')
    const termsV1 = await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-02-01T12:00:00.000-06:00')
    )
    const privacy = await publishDocument(
      PRIVACY,
      docVersion(w, 'P1'),
      DateTime.fromISO('2026-02-02T12:00:00.000-06:00')
    )

    const tenantB = await createTenant('Bravo')
    const owner = await createTenantOwner(tenantB, 'Bravo')
    await acceptDocument(owner, termsV1, termsV1At)
    await acceptDocument(owner, privacy, privacyAt)

    const termsV2 = await publishDocument(
      TERMS,
      docVersion(w, 'T2'),
      DateTime.fromISO('2026-09-01T12:00:00.000-06:00')
    )

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.currentVersions.termsConditions.version, termsV2.legalDocumentVersion)

    const row = findRow(body.data, tenantB)
    assert.equal(row.termsConditions.status, 'pendiente')
    assert.isTrue(sameInstant(row.termsConditions.lastAcceptedAt, termsV1At))
    assert.equal(row.privacyNotice.status, 'al-dia')
    assert.isTrue(sameInstant(row.privacyNotice.lastAcceptedAt, privacyAt))
  })

  test('CA-3: empresa sin aceptaciones', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que una empresa recién creada, sin usuarios, no desaparece ni
     * truena: aparece como "nunca" en ambos documentos.
     *
     * Dado: empresa C sin usuarios ni aceptaciones, con ambos documentos publicados.
     * Cuando: el administrador de plataforma lista.
     * Entonces: 200; la fila de C trae `nunca` y `lastAcceptedAt` null en Términos y Aviso.
     */
    const w = currentWorld()
    await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
    )
    await publishDocument(
      PRIVACY,
      docVersion(w, 'P1'),
      DateTime.fromISO('2026-03-02T12:00:00.000-06:00')
    )
    const tenantC = await createTenant('Charlie')

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const row = findRow(response.body().data, tenantC)
    assert.deepEqual(row.termsConditions, { status: 'nunca', lastAcceptedAt: null })
    assert.deepEqual(row.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
  })

  test('CA-8: tipo sin versión vigente', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que si el Aviso no tiene versión vigente, el listado lo dice
     * (`currentVersions.privacyNotice` null) y ninguna empresa figura como pendiente o nunca de él.
     *
     * Dado: Términos vigente publicado, Aviso sin vigente; empresa con owner que aceptó Términos.
     * Cuando: el administrador de plataforma lista.
     * Entonces: `currentVersions.privacyNotice` es null y toda fila trae el Aviso como
     * `sin-version-publicada` con `lastAcceptedAt` null.
     */
    const w = currentWorld()
    const terms = await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
    )
    const tenantA = await createTenant('Alfa')
    const tenantC = await createTenant('Charlie')
    const owner = await createTenantOwner(tenantA, 'Alfa')
    await acceptDocument(owner, terms, DateTime.fromISO('2026-03-10T09:15:00.000-06:00'))

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const body = response.body()
    assert.isNull(body.currentVersions.privacyNotice)
    assert.equal(body.currentVersions.termsConditions.version, terms.legalDocumentVersion)

    const rows = body.data as RowFact[]
    assert.lengthOf(rows, 2)
    for (const row of [findRow(rows, tenantA), findRow(rows, tenantC)]) {
      assert.deepEqual(row.privacyNotice, { status: 'sin-version-publicada', lastAcceptedAt: null })
    }
    assert.equal(findRow(rows, tenantA).termsConditions.status, 'al-dia')
  })

  test('CA-11: paginación, búsqueda y vacío', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que el listado pagina en orden por nombre, encuentra empresas por
     * nombre o por RFC completo sin revelar el RFC, y responde vacío sin error cuando nada coincide.
     *
     * Dado: tres empresas (Alfa, Bravo, Charlie); Bravo con RFC fiscal capturado.
     * Cuando: se pide `limit=2&page=2`, `search` por nombre, `search` por RFC y `search` sin coincidencias.
     * Entonces: la página 2 trae solo Charlie con meta { total: 3, page: 2, limit: 2, lastPage: 2 };
     * las búsquedas encuentran a Bravo (sin RFC en la respuesta) y la vacía trae data [] y total 0.
     */
    const w = currentWorld()
    await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
    )
    await publishDocument(
      PRIVACY,
      docVersion(w, 'P1'),
      DateTime.fromISO('2026-03-02T12:00:00.000-06:00')
    )
    const tenantA = await createTenant('Alfa')
    const tenantB = await createTenant('Bravo')
    const tenantC = await createTenant('Charlie')

    await TenantBillingProfile.create({
      businessUnitId: tenantB.businessUnit.businessUnitId,
      rfc: GENERIC_RFC,
      rfcHash: blindIndex(GENERIC_RFC),
      legalName: `QA-LA Bravo ${w.stamp} SA de CV`,
      postalCode: '06600',
      taxRegimeCode: '601',
      cfdiUseCode: 'G03',
      billingEmail: 'facturas-qa-la@gsti-tests.local',
    })

    // Página 2 de 2 con limit=2: solo la tercera empresa en orden por nombre.
    const paged = await listAcceptances(client, { search: w.stamp, limit: 2, page: 2 })
    paged.assertStatus(200)
    const pagedBody = paged.body()
    assert.deepEqual(pagedBody.meta, { total: 3, page: 2, limit: 2, lastPage: 2 })
    assert.lengthOf(pagedBody.data, 1)
    assert.equal(pagedBody.data[0].businessUnitPublicId, tenantC.businessUnit.businessUnitPublicId)

    // Página 1: las dos primeras, ordenadas por nombre.
    const first = await listAcceptances(client, { search: w.stamp, limit: 2, page: 1 })
    first.assertStatus(200)
    assert.deepEqual(
      (first.body().data as RowFact[]).map((r) => r.businessUnitPublicId),
      [tenantA.businessUnit.businessUnitPublicId, tenantB.businessUnit.businessUnitPublicId]
    )

    // Búsqueda por nombre de una empresa.
    const byName = await listAcceptances(client, { search: tenantB.businessUnit.businessUnitName })
    byName.assertStatus(200)
    assert.deepEqual(
      (byName.body().data as RowFact[]).map((r) => r.businessUnitPublicId),
      [tenantB.businessUnit.businessUnitPublicId]
    )

    // Búsqueda por RFC completo válido: la encuentra y la respuesta no lo contiene.
    const byRfc = await listAcceptances(client, { search: GENERIC_RFC, limit: 100 })
    byRfc.assertStatus(200)
    const rfcRows = byRfc.body().data as RowFact[]
    assert.include(
      rfcRows.map((r) => r.businessUnitPublicId),
      tenantB.businessUnit.businessUnitPublicId
    )
    assert.notInclude(JSON.stringify(byRfc.body()), GENERIC_RFC)

    // Búsqueda sin coincidencias: vacío, no error.
    const none = await listAcceptances(client, { search: `SIN-COINCIDENCIA-${w.stamp}` })
    none.assertStatus(200)
    assert.deepEqual(none.body().data, [])
    assert.equal(none.body().meta.total, 0)
  })

  test('CA-13: filtros inválidos', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que un filtro fuera de contrato se rechaza con el mismo aviso claro,
     * sea cual sea el filtro que falle.
     *
     * Dado: un administrador de plataforma autenticado.
     * Cuando: pide con `status=foo`, con `limit=101` y con `page=0`.
     * Entonces: las tres peticiones responden 422 con el mismo cuerpo de error del contrato.
     */
    const invalidQueries: Array<Record<string, string | number>> = [
      { status: 'foo' },
      { limit: 101 },
      { page: 0 },
    ]

    for (const query of invalidQueries) {
      const response = await listAcceptances(client, query)

      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.type, INVALID_FILTERS_BODY.type)
      assert.equal(body.title, INVALID_FILTERS_BODY.title)
      assert.equal(body.key, INVALID_FILTERS_BODY.key)
      assert.equal(body.code, INVALID_FILTERS_BODY.code)
      assert.isString(body.detail)
      assert.isAbove(body.detail.length, 0, `detail vacío para ${JSON.stringify(query)}`)
    }
  })
})

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
 * Cubre CA-1 a CA-16. Cada test monta su propio mundo
 * (empresas, cuentas, documentos vigentes) y lo desmonta al terminar, restaurando
 * los documentos vigentes globales de `sae_pruebas` que hubiera antes.
 */

const TEST_PASSWORD = 'LegalAcceptances123!'
const BASE_URL = '/api/platform/legal-acceptances'
const GENERIC_RFC = 'XAXX010101000'

const TERMS: LegalDocumentType = 'terms_conditions'
const PRIVACY: LegalDocumentType = 'privacy_notice'

/**
 * Llaves exactas de una fila del listado. Lista cerrada a propósito (SEC-C-03): si alguien
 * agrega un campo fiscal o un id interno al DTO, este test lo detiene.
 */
const EXPECTED_ROW_KEYS = [
  'businessUnitName',
  'businessUnitPublicId',
  'privacyNotice',
  'termsConditions',
]

/**
 * Cuerpo EXACTO del 403 del guard de plataforma (SEC-C-02). Lista cerrada a propósito:
 * tres llaves, sin `code` y sin ningún dato de empresa. Si alguien le agrega o le quita una,
 * CA-15 y CA-16 lo detienen.
 */
const PLATFORM_FORBIDDEN_BODY = {
  title: 'Acceso restringido a plataforma',
  detail: 'Esta sección es exclusiva de administradores de plataforma.',
  key: 'AUTH.PLATFORM.FORBIDDEN',
}

/** Cuerpo EXACTO del 401 del middleware `auth` cuando la petición llega sin token. */
const TOKEN_MISSING_BODY = {
  type: 'warning',
  title: 'Token requerido',
  detail: 'No se envió un access token válido',
  message: 'No se envió un access token válido',
  key: 'AUTH.TOKEN.MISSING',
  data: { refreshable: false },
}

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
    // El login del backoffice rechaza cuentas pendientes de activar (contraseña sin fijar).
    userPasswordSetAt: DateTime.utc(),
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

/**
 * Token del login del backoffice (`POST /api/auth/login`, origen `web`): el mismo que usa
 * cualquier cuenta de empresa. No es un token de consola, así que el guard de plataforma
 * debe rechazarlo aunque la cuenta sea administradora de plataforma.
 */
async function backofficeToken(client: ApiClient, user: User): Promise<string> {
  const response = await client.post('/api/auth/login').json({
    userEmail: user.userEmail,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token as string | undefined
  if (!token) {
    throw new Error('Login del backoffice no devolvió token')
  }
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

/**
 * Cuenta sin membresía; `userRoleId` es su `users.role_id` (el rol de respaldo de la
 * etapa anterior a los roles por empresa).
 */
async function createAccount(label: string, userRoleId: number): Promise<User> {
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
    // El login del backoffice rechaza cuentas pendientes de activar (contraseña sin fijar).
    userPasswordSetAt: DateTime.utc(),
    roleId: userRoleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  w.userIds.push(user.userId)
  return user
}

/** Membresía de una cuenta en una empresa; `membershipRoleId` null = sin rol en la pivote. */
async function addMembership(
  user: User,
  tenant: TenantFixture,
  membershipRoleId: number | null
): Promise<BusinessUnitUser> {
  return BusinessUnitUser.create({
    userId: user.userId,
    businessUnitId: tenant.businessUnit.businessUnitId,
    roleId: membershipRoleId,
  })
}

/** Cuenta de la empresa con membresía (rol en la pivote) — la cuenta dueña. */
async function createTenantOwner(tenant: TenantFixture, label: string): Promise<User> {
  const user = await createAccount(label, tenant.role.roleId)
  await addMembership(user, tenant, tenant.role.roleId)
  return user
}

/** Rol adicional de la empresa (admin, empleado, etc.) distinto del owner de la plantilla. */
async function createTenantRole(tenant: TenantFixture, slug: string): Promise<Role> {
  const w = currentWorld()
  const role = await Role.create({
    roleName: `QA-LA ${slug} ${tenant.businessUnit.businessUnitSlug}`,
    roleSlug: slug,
    businessUnitId: tenant.businessUnit.businessUnitId,
    roleActive: 1,
    roleDescription: 'fixture QA',
  })
  w.roleIds.push(role.roleId)
  return role
}

/** Rol de plataforma `root` ya existente en `sae_pruebas` (no se crea ni se borra). */
async function findRootRole(): Promise<Role> {
  return Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
}

/** Borrado suave con fecha fija sobre una fila sembrada por el test (sin pasar por hooks). */
async function markDeleted(
  table: string,
  idColumn: string,
  id: number,
  deletedAtColumn: string
): Promise<void> {
  await db
    .from(table)
    .where(idColumn, id)
    .update({ [deletedAtColumn]: '2026-05-01 10:00:00' })
}

/**
 * Documento de otro tipo para fijar que no cuenta: queda NO vigente a propósito, porque
 * publicarlo como vigente apagaría el biométrico real del catálogo compartido y el teardown
 * solo restaura Términos y Aviso.
 */
async function createBiometricDocument(version: string): Promise<LegalDocument> {
  const document = await LegalDocument.create({
    legalDocumentType: 'biometric_consent',
    legalDocumentVersion: version,
    legalDocumentContent: { es: 'fixture' },
    legalDocumentIsCurrent: false,
    legalDocumentStatus: 'published',
    legalDocumentPublishedAt: DateTime.fromISO('2026-03-03T12:00:00.000-06:00'),
  })
  currentWorld().legalDocumentIds.push(document.legalDocumentId)
  return document
}

/** Identificadores públicos de las empresas que trajo una respuesta 200. */
function publicIdsOf(response: ApiResponse): string[] {
  return (response.body().data as RowFact[]).map((r) => r.businessUnitPublicId)
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
        await ApiToken.query().whereIn('tokenable_id', w.userIds).delete()
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

  test('CA-4: solo aceptó un no-owner', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que si quienes aceptaron son un administrador y un empleado, y no
     * el dueño, la empresa NO figura como que aceptó.
     *
     * Dado: empresa D con un usuario `admin` y otro `empleado`, ambos con la vigente de
     * Términos y de Aviso aceptada, y sin ningún owner.
     * Cuando: el administrador de plataforma lista.
     * Entonces: la fila de D trae `nunca` y `lastAcceptedAt` null en Términos y Aviso.
     */
    const w = currentWorld()
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

    const tenantD = await createTenant('Delta')
    const adminRole = await createTenantRole(tenantD, 'admin')
    const employeeRole = await createTenantRole(tenantD, 'empleado')
    const adminMember = await createAccount('DeltaAdmin', adminRole.roleId)
    await addMembership(adminMember, tenantD, adminRole.roleId)
    const employeeMember = await createAccount('DeltaEmp', employeeRole.roleId)
    await addMembership(employeeMember, tenantD, employeeRole.roleId)

    const acceptedAt = DateTime.fromISO('2026-03-10T09:15:00.000-06:00')
    for (const member of [adminMember, employeeMember]) {
      await acceptDocument(member, terms, acceptedAt)
      await acceptDocument(member, privacy, acceptedAt)
    }

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const row = findRow(response.body().data, tenantD)
    assert.deepEqual(row.termsConditions, { status: 'nunca', lastAcceptedAt: null })
    assert.deepEqual(row.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
  })

  test('CA-5: owner en una empresa, empleado en otra', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que una misma persona cuenta como "la empresa aceptó" solo donde
     * es dueña, y no en la empresa donde es empleada.
     *
     * Dado: una cuenta owner en A y `empleado` en E que aceptó la vigente de Términos y Aviso.
     * Cuando: el administrador de plataforma lista.
     * Entonces: A sale `al-dia` en ambos; E sale `nunca` en ambos.
     */
    const w = currentWorld()
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
    const tenantE = await createTenant('Echo')
    const employeeRoleE = await createTenantRole(tenantE, 'empleado')

    const person = await createTenantOwner(tenantA, 'Alfa')
    await addMembership(person, tenantE, employeeRoleE.roleId)

    const acceptedAt = DateTime.fromISO('2026-03-10T09:15:00.000-06:00')
    await acceptDocument(person, terms, acceptedAt)
    await acceptDocument(person, privacy, acceptedAt)

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const rows = response.body().data as RowFact[]
    const rowA = findRow(rows, tenantA)
    assert.equal(rowA.termsConditions.status, 'al-dia')
    assert.equal(rowA.privacyNotice.status, 'al-dia')
    const rowE = findRow(rows, tenantE)
    assert.deepEqual(rowE.termsConditions, { status: 'nunca', lastAcceptedAt: null })
    assert.deepEqual(rowE.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
  })

  test('CA-6: borrados suaves', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que una membresía retirada, una cuenta borrada o un rol borrado
     * dejan de sostener el estado de la empresa, y que una empresa borrada desaparece.
     *
     * Dado: cuatro empresas con un owner que aceptó la vigente, cada una con un borrado
     * distinto (membresía, cuenta, rol); una quinta con un owner vigente que aceptó solo
     * Términos y otro con la membresía retirada que aceptó solo Aviso; y una sexta empresa
     * borrada con su owner al día.
     * Cuando: el administrador de plataforma lista.
     * Entonces: las tres primeras salen `nunca`; la quinta sale Términos `al-dia` y Aviso
     * `nunca` (solo cuenta el owner restante); la borrada no viene en la respuesta.
     */
    const w = currentWorld()
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
    const acceptedAt = DateTime.fromISO('2026-03-10T09:15:00.000-06:00')

    // Membresía retirada.
    const tenantMembership = await createTenant('Membresia')
    const retiredOwner = await createTenantOwner(tenantMembership, 'Membresia')
    await acceptDocument(retiredOwner, terms, acceptedAt)
    await acceptDocument(retiredOwner, privacy, acceptedAt)
    const membership = await BusinessUnitUser.query()
      .where('user_id', retiredOwner.userId)
      .firstOrFail()
    await markDeleted(
      'business_unit_users',
      'business_unit_user_id',
      membership.businessUnitUserId,
      'business_unit_user_deleted_at'
    )

    // Cuenta borrada.
    const tenantUser = await createTenant('Cuenta')
    const deletedOwner = await createTenantOwner(tenantUser, 'Cuenta')
    await acceptDocument(deletedOwner, terms, acceptedAt)
    await acceptDocument(deletedOwner, privacy, acceptedAt)
    await markDeleted('users', 'user_id', deletedOwner.userId, 'user_deleted_at')

    // Rol borrado.
    const tenantRole = await createTenant('Rol')
    const orphanOwner = await createTenantOwner(tenantRole, 'Rol')
    await acceptDocument(orphanOwner, terms, acceptedAt)
    await acceptDocument(orphanOwner, privacy, acceptedAt)
    await markDeleted('roles', 'role_id', tenantRole.role.roleId, 'role_deleted_at')

    // Owner vigente + owner retirado: solo el vigente sostiene el estado.
    const tenantMixed = await createTenant('Mixta')
    const liveOwner = await createTenantOwner(tenantMixed, 'MixtaVigente')
    await acceptDocument(liveOwner, terms, acceptedAt)
    const removedOwner = await createTenantOwner(tenantMixed, 'MixtaRetirado')
    await acceptDocument(removedOwner, privacy, acceptedAt)
    const removedMembership = await BusinessUnitUser.query()
      .where('user_id', removedOwner.userId)
      .firstOrFail()
    await markDeleted(
      'business_unit_users',
      'business_unit_user_id',
      removedMembership.businessUnitUserId,
      'business_unit_user_deleted_at'
    )

    // Empresa borrada: no debe aparecer.
    const tenantGone = await createTenant('Borrada')
    const goneOwner = await createTenantOwner(tenantGone, 'Borrada')
    await acceptDocument(goneOwner, terms, acceptedAt)
    await acceptDocument(goneOwner, privacy, acceptedAt)
    await markDeleted(
      'business_units',
      'business_unit_id',
      tenantGone.businessUnit.businessUnitId,
      'business_unit_deleted_at'
    )

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const rows = response.body().data as RowFact[]
    for (const tenant of [tenantMembership, tenantUser, tenantRole]) {
      const row = findRow(rows, tenant)
      assert.deepEqual(row.termsConditions, { status: 'nunca', lastAcceptedAt: null })
      assert.deepEqual(row.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
    }

    const mixed = findRow(rows, tenantMixed)
    assert.equal(mixed.termsConditions.status, 'al-dia')
    assert.isTrue(sameInstant(mixed.termsConditions.lastAcceptedAt, acceptedAt))
    assert.deepEqual(mixed.privacyNotice, { status: 'nunca', lastAcceptedAt: null })

    assert.notInclude(publicIdsOf(response), tenantGone.businessUnit.businessUnitPublicId)
    assert.lengthOf(rows, 4)
  })

  test('CA-7: respaldo de otra empresa y cuenta root', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que ni el rol de respaldo de una cuenta que pertenece a OTRA
     * empresa ni una cuenta root de plataforma hacen que una empresa figure como aceptada,
     * y que el respaldo de la propia empresa sí sigue contando.
     *
     * Dado: empresa K con dos miembros que aceptaron la vigente, ambos sin rol en la membresía:
     * uno cuyo rol de respaldo es el owner de otra empresa y otro con respaldo root; y empresa M con un miembro sin rol en
     * la membresía cuyo respaldo es el owner de la propia M.
     * Cuando: el administrador de plataforma lista.
     * Entonces: K sale `nunca` en Términos y Aviso; M sale `al-dia` en ambos.
     */
    const w = currentWorld()
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
    const acceptedAt = DateTime.fromISO('2026-03-10T09:15:00.000-06:00')
    const rootRole = await findRootRole()

    const tenantK = await createTenant('Kilo')
    const foreignTenant = await createTenant('Ajena')

    // Sin rol en la pivote; su respaldo es el owner de otra empresa.
    const foreignBackup = await createAccount('KiloRespaldoAjeno', foreignTenant.role.roleId)
    await addMembership(foreignBackup, tenantK, null)

    // Cuenta root miembro de la empresa: la pivote exige un rol de la misma empresa (FK
    // compuesta), así que el rol root solo puede entrar por el respaldo `users.role_id`.
    const rootBackup = await createAccount('KiloRootRespaldo', rootRole.roleId)
    await addMembership(rootBackup, tenantK, null)

    for (const member of [foreignBackup, rootBackup]) {
      await acceptDocument(member, terms, acceptedAt)
      await acceptDocument(member, privacy, acceptedAt)
    }

    // Control: el respaldo del owner de la propia empresa sí cuenta.
    const tenantM = await createTenant('Mike')
    const ownBackup = await createAccount('MikeRespaldoPropio', tenantM.role.roleId)
    await addMembership(ownBackup, tenantM, null)
    await acceptDocument(ownBackup, terms, acceptedAt)
    await acceptDocument(ownBackup, privacy, acceptedAt)

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const rows = response.body().data as RowFact[]
    const rowK = findRow(rows, tenantK)
    assert.deepEqual(rowK.termsConditions, { status: 'nunca', lastAcceptedAt: null })
    assert.deepEqual(rowK.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
    const rowM = findRow(rows, tenantM)
    assert.equal(rowM.termsConditions.status, 'al-dia')
    assert.equal(rowM.privacyNotice.status, 'al-dia')
  })

  test('CA-9: solo biométrico', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que el consentimiento biométrico no cuenta como aceptación de
     * Términos ni de Aviso.
     *
     * Dado: empresa N cuyo owner solo aceptó un documento biométrico; Términos y Aviso
     * vigentes publicados.
     * Cuando: el administrador de plataforma lista.
     * Entonces: la fila de N trae `nunca` y `lastAcceptedAt` null en Términos y Aviso.
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
    const biometric = await createBiometricDocument(docVersion(w, 'B1'))

    const tenantN = await createTenant('November')
    const owner = await createTenantOwner(tenantN, 'November')
    await acceptDocument(owner, biometric, DateTime.fromISO('2026-03-10T09:15:00.000-06:00'))

    const response = await listAcceptances(client, { search: w.stamp })

    response.assertStatus(200)
    const row = findRow(response.body().data, tenantN)
    assert.deepEqual(row.termsConditions, { status: 'nunca', lastAcceptedAt: null })
    assert.deepEqual(row.privacyNotice, { status: 'nunca', lastAcceptedAt: null })
  })

  test('CA-10: filtro no excluyente', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que el filtro por estado mira cada documento por separado: una
     * empresa con Términos pendiente y Aviso nunca aparece en ambos filtros, una al día en
     * Términos pero pendiente en Aviso no cuenta como "al día", y solo se considera "al día"
     * la que lo está en todos los documentos.
     *
     * Dado: empresa F con un owner que solo aceptó Términos v1 (luego se publica v2) y
     * nada de Aviso; empresa M con un owner al día en Términos v2 pero que aceptó Aviso v1
     * (luego se publica v2); empresa A con un owner al día en Términos v2 y Aviso v2. Antes
     * de publicar nada, el catálogo no tiene documentos vigentes.
     * Cuando: el administrador de plataforma lista con `status` al-dia, pendiente y nunca.
     * Entonces: sin documentos vigentes ningún filtro trae empresas; después F sale en
     * `pendiente` y en `nunca` pero no en `al-dia`, M sale en `pendiente` y no en `al-dia`
     * ni en `nunca`, y A sale en `al-dia` y en ninguno de los otros dos.
     */
    const w = currentWorld()
    const tenantF = await createTenant('Foxtrot')
    const tenantA = await createTenant('Alfa')
    const tenantM = await createTenant('Mixta')
    const ownerF = await createTenantOwner(tenantF, 'Foxtrot')
    const ownerA = await createTenantOwner(tenantA, 'Alfa')
    const ownerM = await createTenantOwner(tenantM, 'Mixta')

    // Sin documentos vigentes: ningún filtro devuelve empresas.
    for (const status of ['al-dia', 'pendiente', 'nunca']) {
      const empty = await listAcceptances(client, { search: w.stamp, status })
      empty.assertStatus(200)
      assert.deepEqual(empty.body().data, [], `status=${status} sin vigentes`)
      assert.equal(empty.body().meta.total, 0)
    }

    const termsV1 = await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-02-01T12:00:00.000-06:00')
    )
    const privacyV1 = await publishDocument(
      PRIVACY,
      docVersion(w, 'P1'),
      DateTime.fromISO('2026-02-02T12:00:00.000-06:00')
    )
    await acceptDocument(ownerF, termsV1, DateTime.fromISO('2026-02-10T09:00:00.000-06:00'))
    await acceptDocument(ownerM, privacyV1, DateTime.fromISO('2026-02-11T09:00:00.000-06:00'))

    const termsV2 = await publishDocument(
      TERMS,
      docVersion(w, 'T2'),
      DateTime.fromISO('2026-09-01T12:00:00.000-06:00')
    )
    await acceptDocument(ownerA, termsV2, DateTime.fromISO('2026-09-02T09:00:00.000-06:00'))
    await acceptDocument(ownerM, termsV2, DateTime.fromISO('2026-09-02T09:10:00.000-06:00'))

    // Aviso v2 deja pendiente a M (solo aceptó v1); A sí acepta la vigente.
    const privacyV2 = await publishDocument(
      PRIVACY,
      docVersion(w, 'P2'),
      DateTime.fromISO('2026-09-03T12:00:00.000-06:00')
    )
    await acceptDocument(ownerA, privacyV2, DateTime.fromISO('2026-09-04T09:05:00.000-06:00'))

    const idF = tenantF.businessUnit.businessUnitPublicId
    const idA = tenantA.businessUnit.businessUnitPublicId
    const idM = tenantM.businessUnit.businessUnitPublicId

    const pending = await listAcceptances(client, { search: w.stamp, status: 'pendiente' })
    pending.assertStatus(200)
    assert.include(publicIdsOf(pending), idF)
    assert.include(publicIdsOf(pending), idM)
    assert.notInclude(publicIdsOf(pending), idA)

    const never = await listAcceptances(client, { search: w.stamp, status: 'nunca' })
    never.assertStatus(200)
    assert.include(publicIdsOf(never), idF)
    assert.notInclude(publicIdsOf(never), idM)
    assert.notInclude(publicIdsOf(never), idA)

    // `al-dia` exige estar al día en AMBOS documentos: M (al día solo en Términos) queda fuera.
    const upToDate = await listAcceptances(client, { search: w.stamp, status: 'al-dia' })
    upToDate.assertStatus(200)
    assert.include(publicIdsOf(upToDate), idA)
    assert.notInclude(publicIdsOf(upToDate), idM)
    assert.notInclude(publicIdsOf(upToDate), idF)

    // M conserva el estado propio de cada documento.
    const rowM = findRow(pending.body().data, tenantM)
    assert.equal(rowM.termsConditions.status, 'al-dia')
    assert.equal(rowM.privacyNotice.status, 'pendiente')

    // La fila de F sigue mostrando cada documento con su propio estado.
    const rowF = findRow(pending.body().data, tenantF)
    assert.equal(rowF.termsConditions.status, 'pendiente')
    assert.equal(rowF.privacyNotice.status, 'nunca')
  })

  test('CA-12: minimización', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que el listado no entrega datos fiscales ni de identidad de las
     * empresas: cada fila trae solo nombre, identificador público y los dos estados.
     *
     * Dado: empresa con RFC y razón social fiscal capturados y un owner al día, junto con
     * otra empresa sin aceptaciones.
     * Cuando: el administrador de plataforma lista, sin filtro y filtrando por `al-dia`.
     * Entonces: 200; toda fila tiene exactamente las llaves del contrato y el cuerpo
     * completo no contiene el RFC, su huella, ni las razones sociales sembradas.
     */
    const w = currentWorld()
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
    const tenantC = await createTenant('Charlie')
    const owner = await createTenantOwner(tenantA, 'Alfa')
    await acceptDocument(owner, terms, DateTime.fromISO('2026-03-10T09:15:00.000-06:00'))
    await acceptDocument(owner, privacy, DateTime.fromISO('2026-03-11T10:30:00.000-06:00'))

    const rfc = `QA${w.stamp.slice(-10)}X`
    const fiscalLegalName = `Razon Fiscal Distintiva ${w.stamp} SA de CV`
    await TenantBillingProfile.create({
      businessUnitId: tenantA.businessUnit.businessUnitId,
      rfc,
      rfcHash: blindIndex(rfc),
      legalName: fiscalLegalName,
      postalCode: '06600',
      taxRegimeCode: '601',
      cfdiUseCode: 'G03',
      billingEmail: 'facturas-qa-la@gsti-tests.local',
    })

    const forbidden = [
      rfc,
      blindIndex(rfc),
      fiscalLegalName,
      tenantA.businessUnit.businessUnitLegalName,
      tenantC.businessUnit.businessUnitLegalName,
    ]

    const queries: Array<Record<string, string | number>> = [
      { search: w.stamp, limit: 100 },
      { search: w.stamp, limit: 100, status: 'al-dia' },
    ]

    for (const query of queries) {
      const response = await listAcceptances(client, query)

      response.assertStatus(200)
      const rows = response.body().data as RowFact[]
      assert.isAbove(rows.length, 0)
      for (const row of rows) {
        assert.deepEqual(
          Object.keys(row).sort(),
          EXPECTED_ROW_KEYS,
          'la fila del listado es una lista cerrada: ningún dato fiscal ni id interno'
        )
      }
      findRow(rows, tenantA)

      const serialized = JSON.stringify(response.body())
      for (const secret of forbidden) {
        assert.notInclude(serialized, secret)
      }
    }
  })

  test('CA-14: sin token', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que quien llega sin sesión recibe el aviso de "token requerido" que
     * ya da el sistema a cualquier sección protegida, y que ese aviso no revela nada de
     * ninguna empresa.
     *
     * Dado: una empresa sembrada con su owner y las versiones vigentes publicadas.
     * Cuando: se pide el listado sin cabecera de autorización.
     * Entonces: 401 con el cuerpo existente de "token requerido" (sin `code`), sin el nombre,
     * el identificador público ni el sello de ninguna empresa.
     */
    const w = currentWorld()
    await publishDocument(
      TERMS,
      docVersion(w, 'T1'),
      DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
    )
    const tenant = await createTenant('Alfa')
    await createTenantOwner(tenant, 'Alfa')

    const response = await client.get(BASE_URL).qs({ search: w.stamp })

    response.assertStatus(401)
    assert.deepEqual(response.body(), TOKEN_MISSING_BODY)

    const serialized = JSON.stringify(response.body())
    for (const leak of [
      w.stamp,
      tenant.businessUnit.businessUnitName,
      tenant.businessUnit.businessUnitPublicId,
    ]) {
      assert.notInclude(serialized, leak)
    }
  })

  test('CA-15: owner de tenant con token del BO', async ({ client, assert }) => {
    /**
     * Objetivo: comprobar que el dueño de una empresa, aun con una sesión válida del
     * backoffice, no entra a la sección de plataforma ni ve nada de ninguna empresa.
     *
     * Dado: una empresa con su owner, que inicia sesión por el login del backoffice.
     * Cuando: pide el listado con ese token.
     * Entonces: 403 con exactamente el aviso de acceso restringido (tres llaves, sin `code`)
     * y sin datos de ninguna empresa.
     */
    const w = currentWorld()
    const tenant = await createTenant('Alfa')
    const owner = await createTenantOwner(tenant, 'Alfa')
    const token = await backofficeToken(client, owner)

    const response = await client
      .get(BASE_URL)
      .qs({ search: w.stamp })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.deepEqual(response.body(), PLATFORM_FORBIDDEN_BODY)

    const serialized = JSON.stringify(response.body())
    for (const leak of [
      w.stamp,
      tenant.businessUnit.businessUnitName,
      tenant.businessUnit.businessUnitPublicId,
    ]) {
      assert.notInclude(serialized, leak)
    }
  })

  test('CA-16: admin de plataforma con token del BO', async ({ client, assert }) => {
    /**
     * Objetivo: lo mismo que CA-15, pero con una cuenta que SÍ es administradora de
     * plataforma, para comprobar que lo que abre la sección es la sesión de la consola y no
     * solo la marca de la cuenta.
     *
     * Dado: el administrador de plataforma, que inicia sesión por el login del backoffice
     * (no por el de la consola).
     * Cuando: pide el listado con ese token.
     * Entonces: el mismo 403 exacto del Escenario CA-15 (tres llaves, sin `code`).
     */
    const w = currentWorld()
    await createTenant('Alfa')
    const token = await backofficeToken(client, adminUser!)

    const response = await client
      .get(BASE_URL)
      .qs({ search: w.stamp })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.deepEqual(response.body(), PLATFORM_FORBIDDEN_BODY)
  })
})

import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import LegalDocument, { type LegalDocumentType } from '#models/legal_document'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import UserConsent from '#models/user_consent'
import ApiToken from '#models/api_token'
import EvidenceRepositoryMysql from '#modules/consent/evidence/evidence.repository.mysql'
import { PLATFORM_ACCEPTANCE_DOCUMENT_TYPES } from '#modules/consent/platform/platform_consent.constants'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1790610965466 — expediente de aceptaciones legales por tenant (historial).
 *
 * Primer grupo: filtros aditivos del repositorio de evidencia que la historia del
 * expediente consume (Task 1 del plan) — comportamiento fail-closed probado llamando
 * directo al adaptador, sin HTTP.
 *
 * Segundo grupo: contrato HTTP completo de
 * `GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances` (Task 4): CA-1 a
 * CA-14, los bordes de Review Focus y las regresiones del contrato congelado de §10.
 * Cada prueba monta su propio mundo (empresas, cuentas, documentos) y lo desmonta al
 * terminar, restaurando los documentos vigentes globales de `sae_pruebas`.
 *
 * El adaptador real se consume desde el sub-slice de plataforma, que corre bajo el
 * bypass auditado del tenant (`runUnscoped`, motivo `platform-admin`): fuera de una
 * petición HTTP el mixin de alcance de empresa lanzaría sin ese contexto. Las pruebas
 * HTTP no necesitan envoltura: el guard de plataforma ya envuelve toda la petición.
 */

const TEST_PASSWORD = 'LegalAcceptances123!'

const TERMS: LegalDocumentType = 'terms_conditions'
const PRIVACY: LegalDocumentType = 'privacy_notice'

/** URL del expediente de una empresa por su `businessUnitPublicId`. */
const HISTORY_URL = (publicId: string) => `/api/platform/tenants/${publicId}/legal-acceptances`

/**
 * Llaves exactas de una fila del historial. Lista cerrada a propósito (SEC-D-06): si
 * alguien agrega correo, ids internos o empresas ajenas al DTO, este test lo detiene.
 */
const EXPECTED_ROW_KEYS = [
  'userConsentId',
  'userName',
  'isOwner',
  'documentType',
  'version',
  'acceptedAt',
  'channel',
  'ip',
  'userAgent',
]

/**
 * Cuerpo EXACTO del 403 del guard de plataforma (SEC-C-02). Lista cerrada a propósito:
 * tres llaves, sin `code` y sin ningún dato de empresa. El middleware no se toca.
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

/** Cuerpo del 404 del contrato §10 (el `detail` es i18n y no se aserta literal). */
const NOT_FOUND_BODY = {
  type: 'error',
  title: 'Empresa no encontrada',
  key: 'empresa-no-encontrada',
  code: 'CONSENT.PLATFORM.010',
}

/** Cuerpo del 422 del contrato §10 (el `detail` es i18n y no se aserta literal). */
const INVALID_PARAMS_BODY = {
  type: 'error',
  title: 'Parámetros de historial inválidos',
  key: 'parametros-de-historial-invalidos',
  code: 'CONSENT.PLATFORM.011',
}

/** Fila del historial según el contrato congelado de §10. */
interface HistoryRow {
  userConsentId: number
  userName: string
  isOwner: boolean
  documentType: string
  version: string
  acceptedAt: string | null
  channel: string
  ip: string | null
  userAgent: string | null
}

interface HistoryBody {
  type: string
  tenant: { businessUnitPublicId: string; businessUnitName: string }
  data: HistoryRow[]
  meta: { total: number; perPage: number; currentPage: number; lastPage: number }
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
  const email = `qa-lah-admin-${uniqueStamp()}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  adminPerson = await Person.create({
    personFirstname: 'LegalAcceptanceHistory',
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

/** Petición autenticada como administrador de plataforma al expediente. */
async function history(
  client: ApiClient,
  publicId: string,
  query: Record<string, string | number> = {}
): Promise<ApiResponse> {
  const token = await platformToken(client)
  return client.get(HISTORY_URL(publicId)).qs(query).header('Authorization', `Bearer ${token}`)
}

/** Empresa de prueba con el sello de la corrida en el nombre. */
async function createTenant(label: string): Promise<TenantFixture> {
  const w = currentWorld()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `QA-LAH ${label} ${w.stamp}`,
    businessUnitSlug: `qa-lah-${label.toLowerCase()}-${w.stamp}`,
    businessUnitLegalName: `QA-LAH ${label} ${w.stamp} SA de CV`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  w.businessUnitIds.push(businessUnit.businessUnitId)

  const role = await Role.create({
    roleName: `QA-LAH owner ${label} ${w.stamp}`,
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
 * etapa anterior a los roles por empresa). `isPlatformAdmin` permite montar cuentas de
 * plataforma para CA-8 y CA-14.
 */
async function createAccount(
  label: string,
  userRoleId: number,
  isPlatformAdmin = false
): Promise<User> {
  const w = currentWorld()
  const email = `qa-lah-${label.toLowerCase()}-${w.stamp}@gsti-tests.local`

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
    isPlatformAdmin,
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

/** Rol adicional de la empresa (admin, empleado, root, etc.) distinto del owner. */
async function createTenantRole(tenant: TenantFixture, slug: string): Promise<Role> {
  const w = currentWorld()
  const role = await Role.create({
    roleName: `QA-LAH ${slug} ${tenant.businessUnit.businessUnitSlug}`,
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
  await db.from(table).where(idColumn, id).update({ [deletedAtColumn]: '2026-05-01 10:00:00' })
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

/**
 * Registra la aceptación digital de un documento por una cuenta, con la IP y el user
 * agent capturados (o `null` cuando el origen no los registró). Devuelve el asiento
 * para poder referenciar su `userConsentId` en las aserciones.
 */
async function acceptDocument(
  user: User,
  document: LegalDocument,
  acceptedAt: DateTime,
  ip: string | null,
  userAgent: string | null
): Promise<UserConsent> {
  return UserConsent.create({
    userId: user.userId,
    legalDocumentId: document.legalDocumentId,
    userConsentDocumentVersion: document.legalDocumentVersion,
    userConsentAcceptedAt: acceptedAt,
    userConsentIp: ip,
    userConsentUserAgent: userAgent,
  })
}

test.group('Repositorio de evidencia — filtros del historial (fail-closed)', () => {
  test('CA-8b: excludePlatformAccounts sin businessUnitId devuelve cero filas', async ({
    assert,
  }) => {
    /**
     * Objetivo: comprobar que pedir la exclusión de cuentas de plataforma sin la
     * empresa del filtro no degrada a "sin filtro": es fail-closed y devuelve vacío.
     *
     * Dado: el adaptador de evidencia y el filtro de tipos de plataforma, sin empresa.
     * Cuando: se consulta con `excludePlatformAccounts: true` y sin `businessUnitId`.
     * Entonces: cero filas y `meta.total === 0`.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], excludePlatformAccounts: true },
          { page: 1, perPage: 20 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
    assert.equal(result.meta.total, 0)
  })

  test('types con arreglo vacío devuelve cero filas (fail-closed)', async ({ assert }) => {
    /**
     * Objetivo: comprobar que un arreglo de tipos vacío NO significa "sin filtro":
     * es fail-closed y devuelve vacío.
     *
     * Dado: el adaptador de evidencia.
     * Cuando: se consulta con `types: []`.
     * Entonces: cero filas.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence({ types: [] }, { page: 1, perPage: 20 }),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
  })
})

test.group(
  'GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances — contrato del expediente',
  (group) => {
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
          await db
            .from('business_unit_users')
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
          await db
            .from('legal_documents')
            .whereIn('legal_document_id', w.legalDocumentIds)
            .delete()
        }
      } finally {
        // Va en `finally`: si algún borrado truena, el catálogo global (compartido con otras
        // suites) se restaura igual y `sae_pruebas` nunca se queda sin vigentes.
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

    test('CA-1: expediente de una empresa ordenado y con propietario marcado', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que el expediente de una empresa devuelve sus aceptaciones
       * de la más reciente a la más antigua, marcando como propietario solo a quien es
       * dueño de esa empresa.
       *
       * Dado: la empresa A con una persona dueña que aceptó Términos y Aviso y una
       * colaboradora que aceptó Términos.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: 200 con `Cache-Control: no-store`, `tenant` de A, `data` en orden
       * descendente por `acceptedAt`, `isOwner` solo en las filas de la dueña y el
       * `meta` de la primera página.
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
      const employeeRole = await createTenantRole(tenantA, 'empleado')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const member = await createAccount('AlfaEmp', employeeRole.roleId)
      await addMembership(member, tenantA, employeeRole.roleId)

      await acceptDocument(owner, terms, DateTime.fromISO('2026-03-10T09:00:00.000-06:00'), null, null)
      await acceptDocument(
        owner,
        privacy,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )
      await acceptDocument(
        member,
        terms,
        DateTime.fromISO('2026-03-12T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      assert.equal(response.header('cache-control'), 'no-store')
      const body = response.body() as HistoryBody
      assert.equal(body.type, 'success')
      assert.deepEqual(body.tenant, {
        businessUnitPublicId: tenantA.businessUnit.businessUnitPublicId,
        businessUnitName: tenantA.businessUnit.businessUnitName,
      })
      assert.deepEqual(body.meta, { total: 3, perPage: 20, currentPage: 1, lastPage: 1 })
      assert.lengthOf(body.data, 3)

      const millis = body.data.map((row) => DateTime.fromISO(row.acceptedAt as string).toMillis())
      assert.deepEqual(millis, [...millis].sort((a, b) => b - a))
      // Descendente: colaboradora (Términos 12), dueña (Aviso 11), dueña (Términos 10).
      assert.deepEqual(
        body.data.map((row) => row.isOwner),
        [false, true, true]
      )
    })

    test('CA-2: empresa inexistente o borrada responde 404 sin datos', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que pedir el expediente de una empresa que no existe —o que
       * está borrada— se rechaza con un 404 claro y sin filtrar datos de ninguna empresa.
       *
       * Dado: un UUID válido que no corresponde a ninguna empresa y una empresa borrada.
       * Cuando: el administrador de plataforma pide el historial de cada una.
       * Entonces: 404 con title/key/code del contrato de §10 y sin la llave `data`.
       */
      const tenantA = await createTenant('Alfa')
      await markDeleted(
        'business_units',
        'business_unit_id',
        tenantA.businessUnit.businessUnitId,
        'business_unit_deleted_at'
      )

      for (const publicId of [randomUUID(), tenantA.businessUnit.businessUnitPublicId]) {
        const response = await history(client, publicId)

        response.assertStatus(404)
        const body = response.body()
        assert.equal(body.type, NOT_FOUND_BODY.type)
        assert.equal(body.title, NOT_FOUND_BODY.title)
        assert.equal(body.key, NOT_FOUND_BODY.key)
        assert.equal(body.code, NOT_FOUND_BODY.code)
        assert.notProperty(body, 'data')
      }
    })

    test('CA-3: el historial de A no filtra aceptaciones de B', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar el aislamiento por empresa: el expediente de A no muestra
       * ninguna aceptación de personas ajenas a A.
       *
       * Dado: las empresas A y B, cada una con una persona dueña que aceptó Términos.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: ninguna `userConsentId` de B aparece y todas las filas son de A.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const tenantB = await createTenant('Bravo')
      const ownerA = await createTenantOwner(tenantA, 'AlfaOwner')
      const ownerB = await createTenantOwner(tenantB, 'BravoOwner')

      const consentA = await acceptDocument(
        ownerA,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )
      const consentB = await acceptDocument(
        ownerB,
        terms,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      const ids = body.data.map((row) => row.userConsentId)
      assert.include(ids, consentA.userConsentId)
      assert.notInclude(ids, consentB.userConsentId)
      for (const row of body.data) {
        assert.include(row.userName, 'AlfaOwner')
      }
    })

    test('CA-4: el consentimiento biométrico no aparece ni se cuenta', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que el expediente solo muestra Términos y Aviso: el
       * consentimiento biométrico de una persona de A se excluye en la consulta.
       *
       * Dado: una persona de A con aceptaciones de Términos, Aviso y biometría.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: la biométrica no aparece y `meta.total` no la cuenta (2 filas).
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
      const biometric = await createBiometricDocument(docVersion(w, 'B1'))
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')

      await acceptDocument(owner, terms, DateTime.fromISO('2026-03-10T09:00:00.000-06:00'), null, null)
      await acceptDocument(
        owner,
        privacy,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )
      const bioConsent = await acceptDocument(
        owner,
        biometric,
        DateTime.fromISO('2026-03-12T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.lengthOf(body.data, 2)
      assert.equal(body.meta.total, 2)
      assert.deepEqual(
        body.data.map((row) => row.documentType).sort(),
        ['privacy_notice', 'terms_conditions']
      )
      assert.notInclude(
        body.data.map((row) => row.userConsentId),
        bioConsent.userConsentId
      )
    })

    test('CA-5: IP y user agent siempre enmascarados, incluso con reveal', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que la IP y el user agent nunca se revelan en el expediente
       * (SEC-D-04): se muestran enmascarados y `?reveal=true` se ignora.
       *
       * Dado: una persona de A con una aceptación que capturó IP y user agent y otra sin
       * capturarlos.
       * Cuando: el administrador de plataforma pide el historial, y también con `reveal=true`.
       * Entonces: en ambas respuestas `ip` y `userAgent` valen `•••••` cuando hay dato,
       * y `null` cuando no lo hay.
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
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')

      await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (QA)'
      )
      await acceptDocument(
        owner,
        privacy,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )

      const publicId = tenantA.businessUnit.businessUnitPublicId
      const plain = await history(client, publicId)
      plain.assertStatus(200)
      const plainBody = plain.body() as HistoryBody
      const termsRow = plainBody.data.find((row) => row.documentType === 'terms_conditions')
      const privacyRow = plainBody.data.find((row) => row.documentType === 'privacy_notice')
      assert.equal(termsRow?.ip, '•••••')
      assert.equal(termsRow?.userAgent, '•••••')
      assert.isNull(privacyRow?.ip)
      assert.isNull(privacyRow?.userAgent)

      const revealed = await history(client, publicId, { reveal: 'true' })
      revealed.assertStatus(200)
      const revealedRow = (revealed.body() as HistoryBody).data.find(
        (row) => row.documentType === 'terms_conditions'
      )
      assert.equal(revealedRow?.ip, '•••••')
      assert.equal(revealedRow?.userAgent, '•••••')
    })

    test('CA-6: cada fila trae solo las llaves del contrato, sin datos de otras empresas', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que la fila es una proyección por lista blanca (SEC-D-06):
       * sin correo, ids internos ni empresas ajenas.
       *
       * Dado: una persona de A que también pertenece a B, con una aceptación.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: cada fila trae exactamente las llaves del contrato y la respuesta no
       * contiene el nombre, el `publicId` de B ni el correo de la persona.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const tenantB = await createTenant('Bravo')
      const employeeRoleB = await createTenantRole(tenantB, 'empleado')
      const shared = await createTenantOwner(tenantA, 'Compartida')
      await addMembership(shared, tenantB, employeeRoleB.roleId)
      await acceptDocument(
        shared,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.lengthOf(body.data, 1)
      assert.deepEqual(Object.keys(body.data[0]).sort(), [...EXPECTED_ROW_KEYS].sort())

      const serialized = JSON.stringify(body)
      assert.notInclude(serialized, tenantB.businessUnit.businessUnitName)
      assert.notInclude(serialized, tenantB.businessUnit.businessUnitPublicId)
      assert.notInclude(serialized, shared.userEmail)
    })

    test('CA-7: owner en A y empleado en B aparece en ambos con isOwner distinto', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que la marca de propietario es por empresa: la misma
       * aceptación aparece en los expedientes de sus empresas, pero solo cuenta como
       * dueño donde lo es (DA-1).
       *
       * Dado: una persona owner de A y `empleado` en B, con una aceptación.
       * Cuando: el administrador de plataforma pide el historial de A y luego el de B.
       * Entonces: la misma fila aparece en ambos; `isOwner` es true en A y false en B.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const tenantB = await createTenant('Bravo')
      const employeeRoleB = await createTenantRole(tenantB, 'empleado')
      const user = await createTenantOwner(tenantA, 'Ambas')
      await addMembership(user, tenantB, employeeRoleB.roleId)
      const consent = await acceptDocument(
        user,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )

      const inA = await history(client, tenantA.businessUnit.businessUnitPublicId)
      inA.assertStatus(200)
      const bodyA = inA.body() as HistoryBody
      assert.lengthOf(bodyA.data, 1)
      assert.equal(bodyA.data[0].userConsentId, consent.userConsentId)
      assert.isTrue(bodyA.data[0].isOwner)

      const inB = await history(client, tenantB.businessUnit.businessUnitPublicId)
      inB.assertStatus(200)
      const bodyB = inB.body() as HistoryBody
      assert.lengthOf(bodyB.data, 1)
      assert.equal(bodyB.data[0].userConsentId, consent.userConsentId)
      assert.isFalse(bodyB.data[0].isOwner)
    })

    test('CA-8: las cuentas de plataforma se excluyen del expediente', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que las cuentas de plataforma miembro de la empresa se
       * excluyen del expediente por cualquiera de los dos criterios: `is_platform_admin`
       * o rol efectivo `root` en esa empresa (regla 1).
       *
       * Dado: tres cuentas de A que aceptaron Términos — (a) administradora de plataforma
       * con membresía sin rol; (b) `users.role_id` = rol `root` global y membresía sin rol;
       * (c) membresía con rol `root` de la empresa — y una dueña de A normal.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: solo la aceptación de la dueña aparece y `meta.total` no cuenta las tres.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const rootRole = await findRootRole()
      const rootRoleA = await createTenantRole(tenantA, 'root')

      const platformAccount = await createAccount('PlatA', tenantA.role.roleId, true)
      await addMembership(platformAccount, tenantA, null)
      const rootByUser = await createAccount('RootUser', rootRole.roleId)
      await addMembership(rootByUser, tenantA, null)
      const rootByPivot = await createAccount('RootPivot', tenantA.role.roleId)
      await addMembership(rootByPivot, tenantA, rootRoleA.roleId)
      const ownerOk = await createTenantOwner(tenantA, 'OwnerOk')

      const hiddenConsents = [
        await acceptDocument(
          platformAccount,
          terms,
          DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
          null,
          null
        ),
        await acceptDocument(
          rootByUser,
          terms,
          DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
          null,
          null
        ),
        await acceptDocument(
          rootByPivot,
          terms,
          DateTime.fromISO('2026-03-12T09:00:00.000-06:00'),
          null,
          null
        ),
      ]
      const visible = await acceptDocument(
        ownerOk,
        terms,
        DateTime.fromISO('2026-03-13T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.lengthOf(body.data, 1)
      assert.equal(body.meta.total, 1)
      assert.equal(body.data[0].userConsentId, visible.userConsentId)
      for (const hidden of hiddenConsents) {
        assert.notInclude(
          body.data.map((row) => row.userConsentId),
          hidden.userConsentId
        )
      }
    })

    test('CA-9: la aceptación de una membresía retirada no aparece', async ({ client, assert }) => {
      /**
       * Objetivo: fijar el hueco heredado del BO: si la membresía de la persona en la
       * empresa está borrada, su aceptación desaparece del expediente.
       *
       * Dado: una persona de A con membresía borrada que aceptó Términos, y una dueña vigente.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: solo la aceptación de la dueña vigente aparece y `meta.total` es 1.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const gone = await createAccount('Retirada', tenantA.role.roleId)
      const membership = await addMembership(gone, tenantA, tenantA.role.roleId)
      const goneConsent = await acceptDocument(
        gone,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )
      await markDeleted(
        'business_unit_users',
        'business_unit_user_id',
        membership.businessUnitUserId,
        'business_unit_user_deleted_at'
      )
      const ownerOk = await createTenantOwner(tenantA, 'Vigente')
      await acceptDocument(
        ownerOk,
        terms,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.lengthOf(body.data, 1)
      assert.equal(body.meta.total, 1)
      assert.notInclude(
        body.data.map((row) => row.userConsentId),
        goneConsent.userConsentId
      )
    })

    test('CA-10: empresa sin aceptaciones responde vacío con su nombre', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que una empresa recién creada, sin aceptaciones, no truena:
       * responde 200 con `data: []` y el `meta` real de una primera página.
       *
       * Dado: la empresa C sin usuarios ni aceptaciones.
       * Cuando: el administrador de plataforma pide su historial.
       * Entonces: 200 con `data: []`, `meta.total = 0`, `meta.lastPage = 1` y `tenant` de C.
       */
      const tenantC = await createTenant('Charlie')

      const response = await history(client, tenantC.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.deepEqual(body.tenant, {
        businessUnitPublicId: tenantC.businessUnit.businessUnitPublicId,
        businessUnitName: tenantC.businessUnit.businessUnitName,
      })
      assert.deepEqual(body.data, [])
      assert.deepEqual(body.meta, { total: 0, perPage: 20, currentPage: 1, lastPage: 1 })
    })

    test('CA-11: paginación, validación y borde de perPage', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que los parámetros fuera de contrato se rechazan con el
       * mismo aviso, que la paginación corta el expediente y que el borde superior
       * (`perPage=100`) es válido (Review Focus 5).
       *
       * Dado: una empresa A; después, 25 aceptaciones de una misma dueña sobre 25
       * versiones propias de Términos (la tabla tiene UNIQUE (user_id, legal_document_id)).
       * Cuando: se pide con `perPage=101`, `page=0`, `perPage=abc` y un `publicId` que no
       * es UUID; y con `page=2&perPage=20`, `page=9` y `perPage=100`.
       * Entonces: los cuatro inválidos dan 422 sin datos; la página 2 trae 5 filas con
       * `lastPage=2`; `page=9` trae `data: []` con el `meta` real; `perPage=100` pasa.
       */
      const w = currentWorld()
      const tenantA = await createTenant('Alfa')
      const publicId = tenantA.businessUnit.businessUnitPublicId

      const assertInvalid = (body: Record<string, unknown>) => {
        assert.equal(body.type, INVALID_PARAMS_BODY.type)
        assert.equal(body.title, INVALID_PARAMS_BODY.title)
        assert.equal(body.key, INVALID_PARAMS_BODY.key)
        assert.equal(body.code, INVALID_PARAMS_BODY.code)
        assert.isString(body.detail)
        assert.isAbove((body.detail as string).length, 0)
        assert.notProperty(body, 'data')
      }

      const invalidQueries: Array<Record<string, string | number>> = [
        { perPage: 101 },
        { page: 0 },
        { perPage: 'abc' },
      ]
      for (const query of invalidQueries) {
        const response = await history(client, publicId, query)
        response.assertStatus(422)
        assertInvalid(response.body())
      }

      const badPath = await history(client, 'no-soy-uuid')
      badPath.assertStatus(422)
      assertInvalid(badPath.body())

      const owner = await createTenantOwner(tenantA, 'Paginada')
      for (let index = 1; index <= 25; index += 1) {
        const acceptedAt = DateTime.fromISO('2026-03-01T12:00:00.000-06:00').plus({
          minutes: index,
        })
        const document = await publishDocument(TERMS, docVersion(w, `T${index}`), acceptedAt)
        await acceptDocument(owner, document, acceptedAt, null, null)
      }

      const page2 = await history(client, publicId, { page: 2, perPage: 20 })
      page2.assertStatus(200)
      const meta2 = (page2.body() as HistoryBody).meta
      assert.lengthOf((page2.body() as HistoryBody).data, 5)
      assert.deepEqual(meta2, { total: 25, perPage: 20, currentPage: 2, lastPage: 2 })

      const page9 = await history(client, publicId, { page: 9, perPage: 20 })
      page9.assertStatus(200)
      const body9 = page9.body() as HistoryBody
      assert.deepEqual(body9.data, [])
      assert.deepEqual(body9.meta, { total: 25, perPage: 20, currentPage: 9, lastPage: 2 })

      const boundary = await history(client, publicId, { perPage: 100 })
      boundary.assertStatus(200)
      assert.equal((boundary.body() as HistoryBody).meta.perPage, 100)
      assert.lengthOf((boundary.body() as HistoryBody).data, 25)
    })

    test('CA-12: sin token responde 401', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que el expediente exige sesión: sin token responde el 401
       * del middleware `auth`, sin datos.
       *
       * Dado: una petición sin cabecera de autorización.
       * Cuando: se llama al expediente de una empresa.
       * Entonces: 401 con el cuerpo exacto del contrato.
       */
      const tenantA = await createTenant('Alfa')

      const response = await client.get(HISTORY_URL(tenantA.businessUnit.businessUnitPublicId))

      response.assertStatus(401)
      assert.deepEqual(response.body(), TOKEN_MISSING_BODY)
    })

    test('CA-13: un usuario de empresa con token del backoffice recibe 403', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que un usuario de empresa (dueño) no entra al expediente de
       * plataforma: el guard exige token de consola.
       *
       * Dado: un dueño de A autenticado por el login del backoffice.
       * Cuando: pide el historial de A.
       * Entonces: 403 con exactamente las tres llaves del guard, sin `code`.
       */
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'BOToken')
      const token = await backofficeToken(client, owner)

      const response = await client
        .get(HISTORY_URL(tenantA.businessUnit.businessUnitPublicId))
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(403)
      assert.deepEqual(response.body(), PLATFORM_FORBIDDEN_BODY)
      assert.deepEqual(Object.keys(response.body()).sort(), ['detail', 'key', 'title'])
    })

    test('CA-14: un administrador de plataforma con token del backoffice recibe 403', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que ni siquiera una cuenta administradora de plataforma pasa
       * si el token no es de la consola (`origin = 'platform'`).
       *
       * Dado: una cuenta con `isPlatformAdmin = true` autenticada por el login del backoffice.
       * Cuando: pide el historial de A.
       * Entonces: el mismo 403 exacto, sin `code`.
       */
      const tenantA = await createTenant('Alfa')
      const adminByBackoffice = await createAccount('BOAdmin', tenantA.role.roleId, true)
      const token = await backofficeToken(client, adminByBackoffice)

      const response = await client
        .get(HISTORY_URL(tenantA.businessUnit.businessUnitPublicId))
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(403)
      assert.deepEqual(response.body(), PLATFORM_FORBIDDEN_BODY)
      assert.deepEqual(Object.keys(response.body()).sort(), ['detail', 'key', 'title'])
    })

    test('Review Focus 2: una empresa inactiva conserva su historial visible', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que suspenderse (inactiva, no borrada) no oculta el
       * expediente: el historial sigue visible (§11).
       *
       * Dado: la empresa A con una aceptación y `business_unit_active = 0`.
       * Cuando: el administrador de plataforma pide su historial.
       * Entonces: 200 con su nombre, una fila y `meta.total = 1`.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'Inactiva')
      await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )
      await db
        .from('business_units')
        .where('business_unit_id', tenantA.businessUnit.businessUnitId)
        .update({ business_unit_active: 0 })

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.equal(body.tenant.businessUnitName, tenantA.businessUnit.businessUnitName)
      assert.lengthOf(body.data, 1)
      assert.equal(body.meta.total, 1)
    })

    test('Review Focus 3: la persona con user_deleted_at conserva su aceptación sin nombre', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: fijar el comportamiento heredado de `getEvidence` para una persona con
       * `user_deleted_at` (explorado contra la consulta real; §11 "hueco heredado, igual
       * que el BO"): el asiento de evidencia NO desaparece —la evidencia legal no se
       * borra—, pero el `userName` queda vacío (el preload del usuario lo excluye) y
       * `isOwner` es false (la resolución de owners exige la cuenta viva).
       *
       * Dado: dos personas dueñas de A que aceptaron Términos; a una se le marca
       * `user_deleted_at`.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: ambas filas aparecen; la de la persona borrada trae `userName: ''` e
       * `isOwner: false`; la vigente conserva nombre y `isOwner: true`.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const keeper = await createTenantOwner(tenantA, 'Vigente')
      const erased = await createTenantOwner(tenantA, 'Borrada')
      const keeperConsent = await acceptDocument(
        keeper,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        null,
        null
      )
      const erasedConsent = await acceptDocument(
        erased,
        terms,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )
      await markDeleted('users', 'user_id', erased.userId, 'user_deleted_at')

      const response = await history(client, tenantA.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const body = response.body() as HistoryBody
      assert.lengthOf(body.data, 2)
      assert.equal(body.meta.total, 2)

      const erasedRow = body.data.find((row) => row.userConsentId === erasedConsent.userConsentId)
      assert.isDefined(erasedRow)
      assert.equal(erasedRow?.userName, '')
      assert.isFalse(erasedRow?.isOwner)

      const keeperRow = body.data.find((row) => row.userConsentId === keeperConsent.userConsentId)
      assert.equal(keeperRow?.userName, 'QA Owner Vigente')
      assert.isTrue(keeperRow?.isOwner)
    })
  }
)

import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import i18nManager from '@adonisjs/i18n/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
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
import EvidenceService from '#modules/consent/evidence/evidence.service'
import PlatformConsentService from '#modules/consent/platform/platform_consent.service'
import PlatformConsentController from '#modules/consent/platform/platform_consent.controller'
import PlatformConsentError from '#exceptions/platform_consent_error'
import PiiAccessLogService from '#services/pii_access_log_service'
import { PLATFORM_ACCEPTANCE_DOCUMENT_TYPES } from '#modules/consent/platform/platform_consent.constants'
import type {
  EvidencePageDto,
  EvidenceRowDto,
} from '#modules/consent/evidence/dto/evidence.dto'
import type {
  PlatformRevealAccessor,
  PlatformRevealedEvidenceDto,
} from '#modules/consent/platform/dto/platform_legal_acceptance.dto'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { countRevealLogs, cleanupRevealLogs } from './pii/pii_permission_gate_support.js'

/**
 * USRH1790654705065 — revelar (mostrar completos) la IP y el agente de usuario de UNA
 * aceptación del expediente de una empresa, dejando registro en la bitácora de acceso a
 * datos personales.
 *
 * Primer grupo: filtro aditivo `userConsentId` del repositorio de evidencia (Task 1 del
 * plan) — acota la consulta a una sola aceptación y, sin usarlo, deja el SQL idéntico al
 * de hoy. Se prueba llamando directo al adaptador, sin HTTP.
 *
 * Segundo grupo: `PlatformConsentService#revealEvidence` (Task 2 del plan) — el orden no
 * negociable (empresa → aserciones `> 0` → lookup enmascarado → bitácora transaccional →
 * lectura en claro), el anti-IDOR fail-closed y el registro por columna con valor. Cada
 * prueba monta su propio mundo (empresas, cuentas, documentos) y lo desmonta al terminar,
 * restaurando el catálogo global de documentos vigentes de `sae_pruebas`; la bitácora de
 * la suite se borra antes que usuarios y empresas porque `pii_access_logs` tiene FK a
 * `users.user_id` y `business_units.business_unit_id`.
 *
 * El adaptador real y el servicio se consumen desde el sub-slice de plataforma, que corre
 * bajo el bypass auditado del tenant (`runUnscoped`, motivo `platform-admin`): fuera de una
 * petición HTTP el mixin de alcance de empresa lanzaría sin ese contexto. Las pruebas HTTP
 * de los grupos siguientes no necesitan envoltura: el guard de plataforma ya envuelve toda
 * la petición.
 */

const TEST_PASSWORD = 'LegalAcceptances123!'

const TERMS: LegalDocumentType = 'terms_conditions'
const PRIVACY: LegalDocumentType = 'privacy_notice'

/** Original de la clave de módulo que `revealEvidence` anota en cada fila de bitácora. */
const REVEAL_ORIGIN_MODULE = 'platform-legal-acceptances'

/** Accesor fijo de las pruebas directas del servicio (actor de plataforma + IP/UA de QA). */
const ACCESSOR_IP = '203.0.113.9'
const ACCESSOR_USER_AGENT = 'QA-Agent/1.0'

/** URL de revelado de una aceptación del expediente de una empresa. */
const REVEAL_URL = (publicId: string, userConsentId: string | number) =>
  `/api/platform/tenants/${publicId}/legal-acceptances/${userConsentId}/reveal`

/** URL del expediente de una empresa (para CA-11). */
const HISTORY_URL = (publicId: string) => `/api/platform/tenants/${publicId}/legal-acceptances`

/** Agente de usuario que envía la ayuda `reveal`; se asienta en la bitácora del revelado. */
const REQUEST_USER_AGENT = 'QA-Reveal/1.0'

/**
 * Cuerpo EXACTO del 403 del guard de plataforma (SEC-C-02). Tres llaves, sin `code`.
 * El middleware no se toca.
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

/** Cuerpo del 404 de empresa del contrato §10 (el `detail` es i18n y no se aserta literal). */
const NOT_FOUND_BODY = {
  type: 'error',
  title: 'Empresa no encontrada',
  key: 'empresa-no-encontrada',
  code: 'CONSENT.PLATFORM.010',
}

/**
 * Cuerpo del 404 de aceptación del contrato §10. El `detail` es i18n (locale `es` por
 * defecto) y forma parte del contrato: el mismo cuerpo byte a byte para otra empresa,
 * biométrico, inexistente y cuenta de plataforma.
 */
const ACCEPTANCE_NOT_FOUND_BODY = {
  type: 'error',
  title: 'Aceptación no encontrada',
  detail: 'No existe una aceptación de términos o aviso con ese identificador en esta empresa.',
  key: 'aceptacion-no-encontrada',
  code: 'CONSENT.PLATFORM.012',
}

/** Cuerpo del 422 de params inválidos del contrato §10 (el `detail` es i18n). */
const INVALID_PARAMS_BODY = {
  type: 'error',
  title: 'Parámetros de historial inválidos',
  key: 'parametros-de-historial-invalidos',
  code: 'CONSENT.PLATFORM.011',
}

/** Cuerpo del 500 del contrato §10 (el `detail` es i18n, locale `es` por defecto). */
const REVEAL_FAILED_BODY = {
  type: 'error',
  title: 'No fue posible revelar la evidencia',
  detail: 'No se pudo registrar la consulta en la bitácora; los datos no se mostraron. Intenta de nuevo.',
  key: 'no-fue-posible-revelar-la-evidencia',
  code: 'CONSENT.PLATFORM.013',
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

/** Fila cruda de `pii_access_logs` que leen las aserciones de bitácora. */
interface RawRevealLogRow {
  business_unit_id: number | string
  user_id: number | string
  pii_access_log_origin_module: string | null
  pii_access_log_accessor_ip: string
  pii_access_log_accessor_user_agent: string | null
}

/** Proyección por lista blanca de una fila de bitácora para las aserciones. */
interface RevealLogRow {
  businessUnitId: number
  userId: number
  originModule: string | null
  accessorIp: string
  accessorUserAgent: string | null
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

/** Actor de plataforma ya montado (lo exige el FK `pii_access_logs.user_id`). */
function currentAdmin(): User {
  if (!adminUser) {
    throw new Error('El actor de plataforma no está montado')
  }
  return adminUser
}

/** Accesor fijo que se pasa a `revealEvidence` en las pruebas directas del servicio. */
function accessor(): PlatformRevealAccessor {
  return {
    accessorUserId: currentAdmin().userId,
    accessorIp: ACCESSOR_IP,
    accessorUserAgent: ACCESSOR_USER_AGENT,
  }
}

/** Versión corta (columna de 20 caracteres) y única por corrida para el par tipo+versión. */
function docVersion(w: World, suffix: string): string {
  return `QA${w.stamp.slice(-9)}-${suffix}`
}

function uniqueStamp(): string {
  return `${Date.now()}${Math.floor(Math.random() * 10_000)}`
}

/**
 * Invoca `revealEvidence` bajo el bypass auditado del tenant. Devuelve la promesa del
 * servicio sin atrapar: el `runUnscoped` es síncrono y propaga el rechazo tal cual.
 */
function callReveal(
  service: PlatformConsentService,
  publicId: string,
  userConsentId: number
): Promise<PlatformRevealedEvidenceDto> {
  return TenantContext.runUnscoped(
    () => service.revealEvidence(publicId, userConsentId, accessor()),
    TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
  )
}

/** Captura el rechazo de una operación; falla explícito si no rechaza. */
async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba un rechazo y no ocurrió')
}

/**
 * Actor de plataforma: rol `root` existente + marca `isPlatformAdmin`. Se mantiene por el
 * FK de la bitácora (`user_id`), aunque las pruebas directas del servicio no hagan HTTP.
 */
async function createPlatformAdmin(): Promise<void> {
  const email = `qa-lar-admin-${uniqueStamp()}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  adminPerson = await Person.create({
    personFirstname: 'LegalAcceptanceReveal',
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
    userEmail: currentAdmin().userEmail,
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

/** Petición autenticada como administrador de plataforma al revelado de una aceptación. */
async function reveal(
  client: ApiClient,
  publicId: string,
  userConsentId: string | number,
  token?: string
): Promise<ApiResponse> {
  const authToken = token ?? (await platformToken(client))
  return client
    .post(REVEAL_URL(publicId, userConsentId))
    .header('Authorization', `Bearer ${authToken}`)
    .header('User-Agent', REQUEST_USER_AGENT)
}

/** Aserta el 404 de aceptación del contrato §10: cuerpo byte a byte y sin `data`. */
function assertAcceptanceNotFound(assert: Assert, response: ApiResponse): void {
  response.assertStatus(404)
  assert.deepEqual(response.body(), ACCEPTANCE_NOT_FOUND_BODY)
  assert.notProperty(response.body(), 'data')
}

/** Empresa de prueba con el sello de la corrida en el nombre. */
async function createTenant(label: string): Promise<TenantFixture> {
  const w = currentWorld()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `QA-LAR ${label} ${w.stamp}`,
    businessUnitSlug: `qa-lar-${label.toLowerCase()}-${w.stamp}`,
    businessUnitLegalName: `QA-LAR ${label} ${w.stamp} SA de CV`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  w.businessUnitIds.push(businessUnit.businessUnitId)

  const role = await Role.create({
    roleName: `QA-LAR owner ${label} ${w.stamp}`,
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
 * plataforma para CA-6 y CA-13.
 */
async function createAccount(label: string, userRoleId: number, isPlatformAdmin = false): Promise<User> {
  const w = currentWorld()
  const email = `qa-lar-${label.toLowerCase()}-${w.stamp}@gsti-tests.local`

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

/** Rol adicional de la empresa (empleado, root, etc.) distinto del owner. */
async function createTenantRole(tenant: TenantFixture, slug: string): Promise<Role> {
  const w = currentWorld()
  const role = await Role.create({
    roleName: `QA-LAR ${slug} ${tenant.businessUnit.businessUnitSlug}`,
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

/**
 * Documento biométrico para fijar que no se puede revelar: queda NO vigente a propósito,
 * porque publicarlo apagaría el biométrico real del catálogo compartido y el teardown solo
 * restaura Términos y Aviso.
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
 * agent capturados (o `null`/`''` cuando el origen no los registró). Devuelve el asiento
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

/**
 * Fila más reciente de `pii_access_logs` para un trío modelo/columna/recordId, proyectada
 * por lista blanca. `null` si no hay registro (oráculo de "no se escribió bitácora").
 */
async function logRow(recordId: number, column: string): Promise<RevealLogRow | null> {
  const row = (await db
    .from('pii_access_logs')
    .where('pii_access_log_model', 'UserConsent')
    .where('pii_access_log_model_column', column)
    .where('pii_access_log_record_id', recordId)
    .orderBy('pii_access_log_id', 'desc')
    .select(
      'business_unit_id',
      'user_id',
      'pii_access_log_origin_module',
      'pii_access_log_accessor_ip',
      'pii_access_log_accessor_user_agent'
    )
    .first()) as RawRevealLogRow | null

  if (!row) {
    return null
  }
  return {
    businessUnitId: Number(row.business_unit_id),
    userId: Number(row.user_id),
    originModule: row.pii_access_log_origin_module ?? null,
    accessorIp: row.pii_access_log_accessor_ip,
    accessorUserAgent: row.pii_access_log_accessor_user_agent ?? null,
  }
}

/** Doble de `EvidenceService` que cuenta llamadas y, opcionalmente, decide la página. */
interface EvidenceDouble {
  service: EvidenceService
  callCount: () => number
}

/**
 * Doble de `EvidenceService`: cuenta llamadas y produce la página que el responder decida
 * por número de llamada. Sin responder, lanza si se consulta — casos en los que el
 * servicio NO debe llegar a la evidencia.
 */
function createEvidenceDouble(
  responder?: (callNumber: number, revealAllowed: boolean) => EvidencePageDto
): EvidenceDouble {
  const service = new EvidenceService()
  let count = 0
  service.getEvidence = async (_filters, _pagination, revealAllowed) => {
    count += 1
    if (responder) {
      return responder(count, revealAllowed)
    }
    throw new Error('La evidencia no debía consultarse en este caso')
  }
  return { service, callCount: () => count }
}

/**
 * Doble de `PiiAccessLogService` que delega en el real la primera llamada a `record` y
 * lanza en la segunda — prueba del rollback fail-closed a mitad de la bitácora.
 */
function createFailingPiiLogService(): PiiAccessLogService {
  const real = new PiiAccessLogService()
  const service = new PiiAccessLogService()
  let count = 0
  service.record = async (input, trx) => {
    count += 1
    if (count === 1) {
      return real.record(input, trx)
    }
    throw new Error('Falla simulada de bitácora')
  }
  return service
}

/** Fila de evidencia completa con overrides: el servicio solo usa unos cuantos campos. */
function evidenceRow(overrides: Partial<EvidenceRowDto> = {}): EvidenceRowDto {
  return {
    userConsentId: 0,
    userId: null,
    userName: '',
    businessUnitPublicIds: [],
    businessUnitNames: [],
    legalDocumentId: 0,
    documentType: 'terms_conditions',
    version: 'QA',
    acceptedAt: null,
    ip: null,
    userAgent: null,
    channel: 'digital',
    employeeId: null,
    registeredByName: null,
    signedAt: null,
    hasAttachment: false,
    ...overrides,
  }
}

/** Página de evidencia mínima para el doble del servicio. */
function evidencePage(data: EvidenceRowDto[]): EvidencePageDto {
  return {
    data,
    meta: {
      total: data.length,
      perPage: 1,
      currentPage: 1,
      lastPage: data.length > 0 ? 1 : 0,
    },
  }
}

test.group('Repositorio de evidencia — filtro userConsentId (fail-closed)', () => {
  test('filtra por userConsentId: un id inexistente devuelve cero filas', async ({ assert }) => {
    /**
     * Objetivo: comprobar que el filtro acota la consulta a una sola aceptación por su PK:
     * un id que no existe no devuelve filas ni las cuenta.
     *
     * Dado: el adaptador de evidencia y el filtro de tipos de plataforma.
     * Cuando: se consulta con un `userConsentId` inexistente.
     * Entonces: cero filas y `meta.total === 0`.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], userConsentId: 2147483000 },
          { page: 1, perPage: 20 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
    assert.equal(result.meta.total, 0)
  })

  test('userConsentId 0 no filtra (por eso el servicio exige > 0)', async ({ assert }) => {
    /**
     * Objetivo: fijar que `userConsentId: 0` NO acota —el `.if` lo trata como ausente—,
     * por eso el servicio deberá exigir un id mayor a cero antes de confiar en el filtro.
     *
     * Dado: la BD sembrada de `sae_pruebas`.
     * Cuando: se consulta sin el filtro y con `userConsentId: 0`.
     * Entonces: ambas consultas cuentan el mismo total.
     */
    const sinFiltro = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES] },
          { page: 1, perPage: 100 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )
    const conCero = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], userConsentId: 0 },
          { page: 1, perPage: 100 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.equal(conCero.meta.total, sinFiltro.meta.total)
  })
})

test.group(
  'PlatformConsentService#revealEvidence — bitácora transaccional (fail-closed)',
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
        // Primero la bitácora de la suite: `pii_access_logs` tiene FK a `users.user_id` y
        // `business_units.business_unit_id`, así que borrar usuarios/empresas antes falla.
        for (const businessUnitId of w.businessUnitIds) {
          await cleanupRevealLogs({ businessUnitId })
        }
        for (const userId of w.userIds) {
          await cleanupRevealLogs({ userId })
        }
        // Después usuarios, empresas y documentos.
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

    test('CA-7: empresa inexistente o borrada responde empresa-no-encontrada sin tocar la evidencia', async ({
      assert,
    }) => {
      /**
       * Objetivo: comprobar que resolver el tenant del path es lo primero: si no existe o
       * está borrada, se corta con `empresa-no-encontrada` sin consultar la evidencia.
       *
       * Dado: un UUID que no corresponde a ninguna empresa y una empresa marcada borrada.
       * Cuando: se llama a `revealEvidence` para cada una, con el doble contador de evidencia.
       * Entonces: ambas rechazan con `PlatformConsentError` de key `empresa-no-encontrada`
       * y el contador del doble queda en 0 (nunca se tocó la evidencia).
       */
      const tenantA = await createTenant('Alfa')
      await markDeleted(
        'business_units',
        'business_unit_id',
        tenantA.businessUnit.businessUnitId,
        'business_unit_deleted_at'
      )
      const double = createEvidenceDouble()
      const service = new PlatformConsentService(undefined, undefined, double.service)

      for (const publicId of [randomUUID(), tenantA.businessUnit.businessUnitPublicId]) {
        const error = await captureRejection(callReveal(service, publicId, 1))
        assert.instanceOf(error, PlatformConsentError)
        assert.equal((error as PlatformConsentError).key, 'empresa-no-encontrada')
      }
      assert.equal(double.callCount(), 0)
    })

    test('Review Focus 1: userConsentId <= 0 corta antes de consultar la evidencia', async ({
      assert,
    }) => {
      /**
       * Objetivo: fijar que un `userConsentId` no positivo corta antes de la evidencia —el
       * filtro `.if` del repositorio no acota con 0— con un error interno (nunca por HTTP:
       * el validador lo corta antes).
       *
       * Dado: una empresa con el doble contador de evidencia.
       * Cuando: se llama a `revealEvidence` con `userConsentId = 0`.
       * Entonces: rechaza con un error que NO es `PlatformConsentError` (key distinta de
       * `aceptacion-no-encontrada`), el contador queda en 0 y no hay bitácora del recordId 0.
       */
      const tenantA = await createTenant('Alfa')
      const double = createEvidenceDouble()
      const service = new PlatformConsentService(undefined, undefined, double.service)

      const error = await captureRejection(
        callReveal(service, tenantA.businessUnit.businessUnitPublicId, 0)
      )
      assert.instanceOf(error, Error)
      assert.isFalse(error instanceof PlatformConsentError)
      assert.equal(double.callCount(), 0)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', 0), 0)
    })

    test('CA-1/CA-2: revela y registra una fila por columna, sin deduplicar', async ({
      assert,
    }) => {
      /**
       * Objetivo: comprobar el revelado con bitácora: una fila por columna con valor, con
       * la empresa del path, el accesor de la petición y el módulo de origen; una segunda
       * llamada vuelve a registrar (sin deduplicar).
       *
       * Dado: una dueña de A con una aceptación digital de Términos con IP y user agent.
       * Cuando: se revela dos veces la misma aceptación.
       * Entonces: ambas devuelven los valores en claro; cada columna acumula una fila por
       * llamada y la fila de bitácora trae empresa, accesor, módulo y datos esperados.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const service = new PlatformConsentService()

      const first = await callReveal(
        service,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )
      assert.deepEqual(first, {
        userConsentId: consent.userConsentId,
        ip: '189.203.10.4',
        userAgent: 'Mozilla/5.0 (X11)',
      })
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 1)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        1
      )

      const row = await logRow(consent.userConsentId, 'userConsentIp')
      assert.isNotNull(row)
      assert.equal(row?.businessUnitId, tenantA.businessUnit.businessUnitId)
      assert.isAbove(row?.businessUnitId ?? 0, 0)
      assert.equal(row?.userId, currentAdmin().userId)
      assert.equal(row?.originModule, REVEAL_ORIGIN_MODULE)
      assert.equal(row?.accessorIp, ACCESSOR_IP)
      assert.equal(row?.accessorUserAgent, ACCESSOR_USER_AGENT)

      const second = await callReveal(
        service,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )
      assert.equal(second.userConsentId, consent.userConsentId)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 2)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        2
      )
    })

    test('CA-3: columna nula no se registra; ambas nulas devuelven 200 sin bitácora', async ({
      assert,
    }) => {
      /**
       * Objetivo: comprobar que una columna `NULL` no se registra y que, con ambas nulas,
       * el revelado responde los `null` sin escribir ninguna fila de bitácora.
       *
       * Dado: una aceptación con IP y user agent nulo, y otra con ambos nulos.
       * Cuando: se revela cada una.
       * Entonces: la primera trae `userAgent: null` y una sola fila (`userConsentIp`); la
       * segunda trae ambos `null` y cero filas.
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
      const service = new PlatformConsentService()

      const withIp = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        null
      )
      const resultIp = await callReveal(
        service,
        tenantA.businessUnit.businessUnitPublicId,
        withIp.userConsentId
      )
      assert.deepEqual(resultIp, {
        userConsentId: withIp.userConsentId,
        ip: '189.203.10.4',
        userAgent: null,
      })
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', withIp.userConsentId), 1)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', withIp.userConsentId),
        0
      )

      const bothNull = await acceptDocument(
        owner,
        privacy,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        null,
        null
      )
      const resultNull = await callReveal(
        service,
        tenantA.businessUnit.businessUnitPublicId,
        bothNull.userConsentId
      )
      assert.deepEqual(resultNull, {
        userConsentId: bothNull.userConsentId,
        ip: null,
        userAgent: null,
      })
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', bothNull.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', bothNull.userConsentId),
        0
      )
    })

    test('Review Focus 3: cadena vacía se trata como sin dato (ni se registra ni se revela como dato)', async ({
      assert,
    }) => {
      /**
       * Objetivo: fijar que la cadena vacía no cuenta como dato: no se registra ni se
       * revela ninguna fila de bitácora.
       *
       * Dado: (a) una aceptación real con `user_consent_ip = ''` y
       * `user_consent_user_agent = ''` —en este repo ambas columnas están cifradas y la
       * cadena vacía se lee de vuelta como `null`— y (b) un `EvidenceService` doble que
       * devuelve la fila enmascarada con `ip: ''` y `userAgent: ''`, para ejercitar la
       * guarda `!== ''` del servicio.
       * Cuando: se revela cada una.
       * Entonces: ninguna escribe bitácora; (a) responde `null` (el descifrado colapsa la
       * cadena vacía) y (b) responde `''` (el enmascarado la conserva).
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const service = new PlatformConsentService()

      const empties = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '',
        ''
      )
      const realResult = await callReveal(
        service,
        tenantA.businessUnit.businessUnitPublicId,
        empties.userConsentId
      )
      assert.deepEqual(realResult, {
        userConsentId: empties.userConsentId,
        ip: null,
        userAgent: null,
      })
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', empties.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', empties.userConsentId),
        0
      )

      const blankId = 987654321
      const blankRow = evidenceRow({ userConsentId: blankId, ip: '', userAgent: '' })
      const double = createEvidenceDouble(() => evidencePage([blankRow]))
      const doubleService = new PlatformConsentService(undefined, undefined, double.service)
      const doubleResult = await callReveal(
        doubleService,
        tenantA.businessUnit.businessUnitPublicId,
        blankId
      )
      assert.deepEqual(doubleResult, { userConsentId: blankId, ip: '', userAgent: '' })
      assert.equal(double.callCount(), 1)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', blankId), 0)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentUserAgent', blankId), 0)
    })

    test('Review Focus 5: el registro va a nombre de la empresa del path, no del de la fila', async ({
      assert,
    }) => {
      /**
       * Objetivo: comprobar el anti-IDOR de empresa: el `businessUnitId` de la bitácora es
       * el del tenant resuelto por el path, nunca 0 ni el de otra empresa de la persona.
       *
       * Dado: una dueña de A que también es miembro de B, con una aceptación.
       * Cuando: se revela por el path de A.
       * Entonces: la fila de bitácora trae el id de A (> 0), distinto del de B.
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
      const consent = await acceptDocument(
        shared,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const service = new PlatformConsentService()

      await callReveal(service, tenantA.businessUnit.businessUnitPublicId, consent.userConsentId)

      const row = await logRow(consent.userConsentId, 'userConsentIp')
      assert.isNotNull(row)
      assert.equal(row?.businessUnitId, tenantA.businessUnit.businessUnitId)
      assert.notEqual(row?.businessUnitId, tenantB.businessUnit.businessUnitId)
      assert.isAbove(row?.businessUnitId ?? 0, 0)
    })

    test('CA-9: si la bitácora falla a la mitad, no hay dato ni registros parciales', async ({
      assert,
    }) => {
      /**
       * Objetivo: comprobar el fail-closed de la transacción: si el segundo `record` falla,
       * el primero se revierte, no hay valor revelado y se responde 500 interno.
       *
       * Dado: un `PiiAccessLogService` doble que delega el primer `record` y lanza en el segundo.
       * Cuando: se revela una aceptación con IP y user agent.
       * Entonces: rechaza con `no-fue-posible-revelar-la-evidencia` y cero filas en las dos
       * columnas (la primera quedó revertida).
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const service = new PlatformConsentService(
        undefined,
        undefined,
        undefined,
        createFailingPiiLogService()
      )

      const error = await captureRejection(
        callReveal(service, tenantA.businessUnit.businessUnitPublicId, consent.userConsentId)
      )
      assert.instanceOf(error, PlatformConsentError)
      assert.equal((error as PlatformConsentError).key, 'no-fue-posible-revelar-la-evidencia')
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })

    test('Review Focus 4: si la lectura en claro vuelve vacía, se revierte con aceptacion-no-encontrada', async ({
      assert,
    }) => {
      /**
       * Objetivo: fijar la carrera entre el registro y la lectura en claro: si la fila
       * desaparece después de los `record`, el `aceptacion-no-encontrada` revierte todo.
       *
       * Dado: un `EvidenceService` doble que devuelve la fila enmascarada la primera vez y
       * vacío la segunda.
       * Cuando: se revela.
       * Entonces: rechaza con `aceptacion-no-encontrada` y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const maskedRow = evidenceRow({
        userConsentId: consent.userConsentId,
        ip: '•••••',
        userAgent: '•••••',
      })
      const double = createEvidenceDouble((callNumber) =>
        callNumber === 1 ? evidencePage([maskedRow]) : evidencePage([])
      )
      const service = new PlatformConsentService(undefined, undefined, double.service)

      const error = await captureRejection(
        callReveal(service, tenantA.businessUnit.businessUnitPublicId, consent.userConsentId)
      )
      assert.instanceOf(error, PlatformConsentError)
      assert.equal((error as PlatformConsentError).key, 'aceptacion-no-encontrada')
      assert.equal(double.callCount(), 2)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })
  }
)

test.group(
  'POST /api/platform/tenants/:businessUnitPublicId/legal-acceptances/:userConsentId/reveal — contrato',
  (group) => {
    group.setup(async () => {
      adminToken = null
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
        // Primero la bitácora de la suite: `pii_access_logs` tiene FK a `users.user_id` y
        // `business_units.business_unit_id`, así que borrar usuarios/empresas antes falla.
        for (const businessUnitId of w.businessUnitIds) {
          await cleanupRevealLogs({ businessUnitId })
        }
        for (const userId of w.userIds) {
          await cleanupRevealLogs({ userId })
        }
        // Después usuarios, empresas y documentos.
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

    test('CA-1: revela la IP y el agente de usuario y deja exactamente dos registros con la empresa correcta', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar el contrato del revelado por HTTP: 200 con `no-store` y el dato
       * en claro, y exactamente dos filas de bitácora (una por columna) con la empresa del
       * path, el actor de plataforma, el módulo de origen y el accesor de la petición.
       *
       * Dado: una dueña de A con una aceptación digital de Términos con IP y user agent.
       * Cuando: el administrador de plataforma revela esa aceptación.
       * Entonces: 200 con las tres llaves y dos filas de bitácora coherentes.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const response = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )

      response.assertStatus(200)
      assert.equal(response.header('cache-control'), 'no-store')
      assert.deepEqual(response.body(), {
        type: 'success',
        data: {
          userConsentId: consent.userConsentId,
          ip: '189.203.10.4',
          userAgent: 'Mozilla/5.0 (X11)',
        },
      })

      const ipRow = await logRow(consent.userConsentId, 'userConsentIp')
      const uaRow = await logRow(consent.userConsentId, 'userConsentUserAgent')
      assert.isNotNull(ipRow)
      assert.isNotNull(uaRow)
      assert.equal(ipRow?.businessUnitId, tenantA.businessUnit.businessUnitId)
      assert.isAbove(ipRow?.businessUnitId ?? 0, 0)
      assert.equal(ipRow?.userId, currentAdmin().userId)
      assert.equal(ipRow?.originModule, REVEAL_ORIGIN_MODULE)
      assert.equal(ipRow?.accessorUserAgent, REQUEST_USER_AGENT)
      assert.isString(ipRow?.accessorIp)
      assert.isNotEmpty(ipRow?.accessorIp ?? '')
      assert.equal(uaRow?.accessorUserAgent, REQUEST_USER_AGENT)
      assert.equal(uaRow?.accessorIp, ipRow?.accessorIp)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 1)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        1
      )
    })

    test('CA-2: revelar otra vez deja otro registro', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que el revelado no deduplica: una segunda llamada vuelve a
       * registrar una fila por columna con valor.
       *
       * Dado: una dueña de A con una aceptación de Términos con IP y user agent.
       * Cuando: se revela dos veces la misma aceptación.
       * Entonces: cada columna acumula dos filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const first = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )
      first.assertStatus(200)
      const second = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )
      second.assertStatus(200)

      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 2)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        2
      )
    })

    test('CA-3b: una sola columna con valor registra solo esa', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que una columna sin dato (`NULL`) no se registra ni se revela:
       * solo se escribe la fila de la columna con valor.
       *
       * Dado: una dueña de A con una aceptación de Términos con IP pero sin user agent.
       * Cuando: el administrador de plataforma revela esa aceptación.
       * Entonces: 200 con `userAgent: null`, una fila de `userConsentIp` y cero de agente.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        null
      )

      const response = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )

      response.assertStatus(200)
      assert.deepEqual(response.body(), {
        type: 'success',
        data: { userConsentId: consent.userConsentId, ip: '189.203.10.4', userAgent: null },
      })
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 1)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })

    test('CA-4: la aceptación de otra empresa responde 404 sin bitácora', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar el aislamiento por empresa del revelado: pedir bajo el path de A
       * la aceptación de una persona que solo pertenece a B no la revela ni escribe bitácora.
       *
       * Dado: las empresas A y B, con una dueña solo de B que aceptó Términos.
       * Cuando: el administrador de plataforma revela esa aceptación bajo el path de A.
       * Entonces: 404 con el cuerpo exacto de aceptación y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const tenantB = await createTenant('Bravo')
      const ownerB = await createTenantOwner(tenantB, 'BravoOwner')
      const consentB = await acceptDocument(
        ownerB,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const response = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consentB.userConsentId
      )

      assertAcceptanceNotFound(assert, response)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consentB.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consentB.userConsentId),
        0
      )
    })

    test('CA-5: el consentimiento biométrico da el mismo 404 byte a byte', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que el consentimiento biométrico no forma parte del revelado:
       * no se puede revelar desde el expediente.
       *
       * Dado: una dueña de A con una aceptación biométrica.
       * Cuando: el administrador de plataforma la revela.
       * Entonces: el mismo 404 de aceptación byte a byte y cero filas de bitácora.
       */
      const w = currentWorld()
      const biometric = await createBiometricDocument(docVersion(w, 'B1'))
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const bioConsent = await acceptDocument(
        owner,
        biometric,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const response = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        bioConsent.userConsentId
      )

      assertAcceptanceNotFound(assert, response)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentIp', bioConsent.userConsentId),
        0
      )
    })

    test('CA-6: id inexistente y cuenta de plataforma dan el mismo 404', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que un id inexistente y la aceptación de una cuenta de plataforma
       * (`is_platform_admin`) responden el mismo 404 byte a byte, sin bitácora.
       *
       * Dado: una cuenta administradora de plataforma miembro de A con una aceptación.
       * Cuando: se revela con un id inexistente y con la aceptación de la cuenta de plataforma.
       * Entonces: los dos cuerpos son iguales al contrato de aceptación y cero filas.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const platformAccount = await createAccount('PlatA', tenantA.role.roleId, true)
      await addMembership(platformAccount, tenantA, null)
      const consent = await acceptDocument(
        platformAccount,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const missing = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        999999999
      )
      const platform = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )

      assertAcceptanceNotFound(assert, missing)
      assertAcceptanceNotFound(assert, platform)
      assert.deepEqual(platform.body(), missing.body())
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })

    test('CA-6b: la cuenta con rol efectivo root da el mismo 404', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que una cuenta con rol efectivo `root` en A —por el rol de la
       * membresía y, aparte, por `users.role_id` con la membresía sin rol— también responde
       * el mismo 404 byte a byte, sin bitácora.
       *
       * Dado: dos cuentas de A con una aceptación de Términos: una con membresía al rol
       * `root` de la empresa y otra con `users.role_id` = rol `root` global.
       * Cuando: el administrador de plataforma revela cada aceptación.
       * Entonces: ambos cuerpos son el mismo 404 de aceptación y cero filas.
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
      const rootByPivot = await createAccount('RootPivot', tenantA.role.roleId)
      await addMembership(rootByPivot, tenantA, rootRoleA.roleId)
      const rootByUser = await createAccount('RootUser', rootRole.roleId)
      await addMembership(rootByUser, tenantA, null)
      const pivotConsent = await acceptDocument(
        rootByPivot,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const userConsent = await acceptDocument(
        rootByUser,
        terms,
        DateTime.fromISO('2026-03-11T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const pivotResponse = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        pivotConsent.userConsentId
      )
      const userResponse = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        userConsent.userConsentId
      )

      assertAcceptanceNotFound(assert, pivotResponse)
      assertAcceptanceNotFound(assert, userResponse)
      assert.deepEqual(pivotResponse.body(), userResponse.body())
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentIp', pivotConsent.userConsentId),
        0
      )
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', pivotConsent.userConsentId),
        0
      )
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentIp', userConsent.userConsentId),
        0
      )
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', userConsent.userConsentId),
        0
      )
    })

    test('Review Focus 2: la aceptación de una membresía retirada da 404 sin bitácora', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: fijar el hueco heredado del BO: si la membresía de la persona en la empresa
       * está borrada, su aceptación no se revela —mismo 404, sin bitácora—.
       *
       * Dado: una persona de A con membresía borrada que aceptó Términos.
       * Cuando: el administrador de plataforma revela esa aceptación.
       * Entonces: el 404 de aceptación y cero filas de bitácora.
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
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      await markDeleted(
        'business_unit_users',
        'business_unit_user_id',
        membership.businessUnitUserId,
        'business_unit_user_deleted_at'
      )

      const response = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        goneConsent.userConsentId
      )

      assertAcceptanceNotFound(assert, response)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentIp', goneConsent.userConsentId),
        0
      )
    })

    test('CA-7b: empresa inexistente o borrada responde 404 empresa-no-encontrada sin bitácora', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que resolver la empresa del path es lo primero: si no existe o
       * está borrada, se corta con `empresa-no-encontrada` sin tocar la evidencia.
       *
       * Dado: un UUID que no corresponde a ninguna empresa y una empresa marcada borrada.
       * Cuando: el administrador de plataforma revela una aceptación real bajo cada path.
       * Entonces: 404 `empresa-no-encontrada` y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      await markDeleted(
        'business_units',
        'business_unit_id',
        tenantA.businessUnit.businessUnitId,
        'business_unit_deleted_at'
      )

      for (const publicId of [randomUUID(), tenantA.businessUnit.businessUnitPublicId]) {
        const response = await reveal(client, publicId, consent.userConsentId)

        response.assertStatus(404)
        const body = response.body()
        assert.equal(body.type, NOT_FOUND_BODY.type)
        assert.equal(body.title, NOT_FOUND_BODY.title)
        assert.equal(body.key, NOT_FOUND_BODY.key)
        assert.equal(body.code, NOT_FOUND_BODY.code)
        assert.notProperty(body, 'data')
      }
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })

    test('CA-8: params fuera de contrato responden 422', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que los params fuera de contrato se rechazan con el mismo aviso
       * antes de tocar la evidencia: `userConsentId` no positivo, decimal o no numérico, y un
       * `businessUnitPublicId` que no es UUID.
       *
       * Dado: una empresa A con una aceptación.
       * Cuando: se revela con `userConsentId` `0`, `-1`, `1.5` y `abc`, y con un path que no
       * es UUID.
       * Entonces: 422 sin datos y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const publicId = tenantA.businessUnit.businessUnitPublicId

      const assertInvalid = (body: Record<string, unknown>) => {
        assert.equal(body.type, INVALID_PARAMS_BODY.type)
        assert.equal(body.title, INVALID_PARAMS_BODY.title)
        assert.equal(body.key, INVALID_PARAMS_BODY.key)
        assert.equal(body.code, INVALID_PARAMS_BODY.code)
        assert.notProperty(body, 'data')
      }

      for (const badId of ['0', '-1', '1.5', 'abc']) {
        const response = await reveal(client, publicId, badId)
        response.assertStatus(422)
        assertInvalid(response.body())
      }

      const badPath = await reveal(client, 'no-soy-uuid', consent.userConsentId)
      badPath.assertStatus(422)
      assertInvalid(badPath.body())

      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })

    test('CA-10: una falla de bitácora responde 500 sin dato', async ({ assert }) => {
      /**
       * Objetivo: comprobar que si el registro en bitácora falla, el controller responde 500
       * sin dato y sin filtrar la IP ni el agente de usuario en el cuerpo.
       *
       * Dado: un `PiiAccessLogService` doble que delega el primer `record` y lanza en el
       * segundo, y un contexto HTTP con el actor de plataforma vivo.
       * Cuando: se invoca `reveal` del controller con ese servicio.
       * Entonces: 500 con el cuerpo exacto de fallo y el texto serializado sin IP ni UA.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )
      const service = new PlatformConsentService(
        undefined,
        undefined,
        undefined,
        createFailingPiiLogService()
      )

      const socket = new Socket()
      Object.defineProperty(socket, 'remoteAddress', {
        value: '203.0.113.9',
        configurable: true,
      })
      const ctx = await testUtils.createHttpContext({ req: new IncomingMessage(socket) })
      ctx.i18n = i18nManager.locale('es')
      ctx.params = {
        businessUnitPublicId: tenantA.businessUnit.businessUnitPublicId,
        userConsentId: consent.userConsentId,
      }
      const actor = new User()
      actor.userId = currentAdmin().userId
      ctx.auth = { user: actor } as HttpContext['auth']

      // Fuera de una petición HTTP real el mixin de alcance lanzaría: se emula el bypass
      // auditado que el guard de plataforma aplica a la petición (motivo `platform-admin`).
      await TenantContext.runUnscoped(
        () => new PlatformConsentController().reveal(ctx, service),
        TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
      )

      assert.equal(ctx.response.getStatus(), 500)
      const rawBody = ctx.response.getBody()
      const serialized = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
      assert.deepEqual(JSON.parse(serialized), REVEAL_FAILED_BODY)
      assert.notInclude(serialized, '189.203.10.4')
      assert.notInclude(serialized, 'Mozilla')
    })

    test('CA-11: el historial sigue enmascarado después de revelar', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que revelar no cambia el expediente: la misma fila sigue con la
       * IP y el agente de usuario enmascarados.
       *
       * Dado: una dueña de A con una aceptación con IP y user agent, ya revelada.
       * Cuando: el administrador de plataforma pide el historial de A.
       * Entonces: la fila sigue con `ip` y `userAgent` en `•••••`.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const revealed = await reveal(
        client,
        tenantA.businessUnit.businessUnitPublicId,
        consent.userConsentId
      )
      revealed.assertStatus(200)

      const token = await platformToken(client)
      const historyResponse = await client
        .get(HISTORY_URL(tenantA.businessUnit.businessUnitPublicId))
        .header('Authorization', `Bearer ${token}`)

      historyResponse.assertStatus(200)
      const body = historyResponse.body() as {
        data: Array<{ userConsentId: number; ip: string | null; userAgent: string | null }>
      }
      const row = body.data.find((entry) => entry.userConsentId === consent.userConsentId)
      assert.isDefined(row)
      assert.equal(row?.ip, '•••••')
      assert.equal(row?.userAgent, '•••••')
    })

    test('CA-12: sin token responde 401 sin bitácora', async ({ client, assert }) => {
      /**
       * Objetivo: comprobar que el revelado exige sesión: sin token responde el 401 del
       * middleware `auth`, sin escribir bitácora.
       *
       * Dado: una empresa A con una aceptación y una petición sin cabecera de autorización.
       * Cuando: se llama al revelado.
       * Entonces: 401 con el cuerpo exacto y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'AlfaOwner')
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      const response = await client.post(
        REVEAL_URL(tenantA.businessUnit.businessUnitPublicId, consent.userConsentId)
      )

      response.assertStatus(401)
      assert.deepEqual(response.body(), TOKEN_MISSING_BODY)
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
    })

    test('CA-13: un token del backoffice responde 403 sin bitácora', async ({
      client,
      assert,
    }) => {
      /**
       * Objetivo: comprobar que el guard exige token de consola: ni una cuenta dueña ni una
       * cuenta administradora de plataforma pasan con un token del backoffice.
       *
       * Dado: un dueño de A y una cuenta con `isPlatformAdmin = true`, autenticados por el
       * login del backoffice.
       * Cuando: piden el revelado de A.
       * Entonces: el 403 exacto del guard (tres llaves, sin `code`) y cero filas de bitácora.
       */
      const w = currentWorld()
      const terms = await publishDocument(
        TERMS,
        docVersion(w, 'T1'),
        DateTime.fromISO('2026-03-01T12:00:00.000-06:00')
      )
      const tenantA = await createTenant('Alfa')
      const owner = await createTenantOwner(tenantA, 'BOToken')
      const adminByBackoffice = await createAccount('BOAdmin', tenantA.role.roleId, true)
      const consent = await acceptDocument(
        owner,
        terms,
        DateTime.fromISO('2026-03-10T09:00:00.000-06:00'),
        '189.203.10.4',
        'Mozilla/5.0 (X11)'
      )

      for (const user of [owner, adminByBackoffice]) {
        const token = await backofficeToken(client, user)
        const response = await reveal(
          client,
          tenantA.businessUnit.businessUnitPublicId,
          consent.userConsentId,
          token
        )

        response.assertStatus(403)
        assert.deepEqual(response.body(), PLATFORM_FORBIDDEN_BODY)
        assert.deepEqual(Object.keys(response.body()).sort(), ['detail', 'key', 'title'])
      }
      assert.equal(await countRevealLogs('UserConsent', 'userConsentIp', consent.userConsentId), 0)
      assert.equal(
        await countRevealLogs('UserConsent', 'userConsentUserAgent', consent.userConsentId),
        0
      )
    })
  }
)

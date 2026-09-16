import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import { DOCUMENT_TEMPLATE_STATUS } from '#modules/employee-offboarding/document-templates/document_templates.constants'
import {
  buildBidiFieldName,
  buildCheckboxNamedEmployeeName,
  buildDuplicateFieldDifferentType,
  buildEncrypted,
  buildManyPagesAndFields,
  buildNoFields,
  buildSignatureField,
  buildValidTemplate,
  buildWithCatalogAdditionalActions,
  buildWithEmbeddedFile,
  buildWithJavascriptNameTree,
  buildWithOpenAction,
  buildWithWidgetAction,
  buildXfa,
} from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550387 — rechazo estructural de extremo a extremo: cada motivo
 * con su triplete y su dictamen en `data`, la fila `rejected` con su
 * consecutivo, la vigente intacta, la plantilla válida que pasa (CA-1 a CA-9
 * y CA-11) y el candado V-1 como comando de Ace (CA-10).
 *
 * Corre sobre la base y el bucket de DESARROLLO: cada intento sube su PDF al
 * almacenamiento privado (los objetos quedan huérfanos, como en las demás
 * suites). El limiter del POST es de 10 por minuto y usuario: las cargas se
 * reparten entre tres usuarios con permiso `create`.
 */

const TEST_PASSWORD = 'TemplateUploadGuards123!'
const BASE_PATH = '/api/employee-offboarding-document-templates'
const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const VERSIONS_PATH = `${BASE_PATH}/${DOCUMENT_TYPE}/versions`
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const REJECTED_TITLE = 'No se pudo aceptar la plantilla'
const BACKFILL_COMMAND = 'backfill:reject-unvalidated-document-templates'

/** Prefijo ÚNICO de las fixtures de este spec (slug de empresa y de rol). */
const FIXTURE_SLUG_PREFIX = 'plantilla-rechazo-'

/** Tabla de `User.accessTokens`: `loginAs` deja tokens que hay que retirar antes del usuario. */
const ACCESS_TOKENS_TABLE = 'api_tokens'

const execFileAsync = promisify(execFile)

const created = {
  businessUnitIds: [] as number[],
  roleIds: [] as number[],
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Plantilla rechazo ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Plantilla rechazo ${prefix} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Permisos del módulo de salidas por slug; el gate es fail-closed si faltan. */
async function findPermissions(actions: readonly string[]): Promise<SystemPermission[]> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', EMPLOYEE_OFFBOARDINGS_MODULE_SLUG)
    .first()
  if (!systemModule) {
    throw new Error(
      `Se requiere el módulo "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD (seeder 0055) para este test.`
    )
  }
  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', systemModule.systemModuleId)
    .whereIn('system_permission_slug', [...actions])
  if (permissions.length !== actions.length) {
    throw new Error(
      `Faltan permisos ${actions.join('/')} de "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD.`
    )
  }
  return permissions
}

async function createRole(
  prefix: string,
  businessUnit: BusinessUnit,
  actions: readonly string[]
): Promise<Role> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Plantilla rechazo ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec de rechazo de plantillas',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  created.roleIds.push(role.roleId)
  for (const permission of await findPermissions(actions)) {
    const grant = new RoleSystemPermission()
    grant.roleId = role.roleId
    grant.systemPermissionId = permission.systemPermissionId
    await grant.save()
  }
  return role
}

async function createUser(prefix: string, role: Role, businessUnit: BusinessUnit): Promise<User> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Rechazo',
    personLastname: 'Plantilla',
    personSecondLastname: prefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return user
}

/** Destruye en orden inverso de FK lo que cuelga de las empresas y roles dados. */
async function destroyFixtures(businessUnitIds: number[], roleIds: number[]): Promise<void> {
  if (businessUnitIds.length > 0) {
    await db.from(TEMPLATES_TABLE).whereIn('business_unit_id', businessUnitIds).delete()
  }
  if (roleIds.length > 0) {
    const users = await db
      .from(User.table)
      .select('user_id', 'person_id')
      .whereIn('role_id', roleIds)
    if (users.length > 0) {
      const userIds = users.map((row) => Number(row.user_id))
      await db.from(BusinessUnitUser.table).whereIn('user_id', userIds).delete()
      await db.from(ACCESS_TOKENS_TABLE).whereIn('tokenable_id', userIds).delete()
      await db.from(User.table).whereIn('user_id', userIds).delete()
      await db
        .from(Person.table)
        .whereIn(
          'person_id',
          users.map((row) => Number(row.person_id))
        )
        .delete()
    }
    await db.from(RoleSystemPermission.table).whereIn('role_id', roleIds).delete()
    await db.from(Role.table).whereIn('role_id', roleIds).delete()
  }
  if (businessUnitIds.length > 0) {
    await db.from(BusinessUnit.table).whereIn('business_unit_id', businessUnitIds).delete()
  }
}

async function purgeStaleFixtures(): Promise<void> {
  const staleUnits = await db
    .from(BusinessUnit.table)
    .select('business_unit_id')
    .where('business_unit_slug', 'like', `${FIXTURE_SLUG_PREFIX}%`)
  const staleRoles = await db
    .from(Role.table)
    .select('role_id')
    .where('role_slug', 'like', `${FIXTURE_SLUG_PREFIX}%`)
  await destroyFixtures(
    staleUnits.map((row) => Number(row.business_unit_id)),
    staleRoles.map((row) => Number(row.role_id))
  )
}

interface StructuralVerdict {
  stage: string
  reason: string | null
  detail: string | null
}

interface ValidationResult {
  checkedAt: string
  documentType: string
  passed: boolean
  recognized: unknown[]
  unrecognized: unknown[]
  missingRequired: unknown[]
  structural: StructuralVerdict
}

interface TemplateDto {
  employeeOffboardingDocumentTemplateId: number
  versionNumber: number
  status: string
  validationResult: ValidationResult | null
}

interface StoreBody {
  data: { employeeOffboardingDocumentTemplate: TemplateDto }
}

interface RejectedBody {
  title: string
  detail: string
  key: string
  code: string
  data: {
    employeeOffboardingDocumentTemplateId: number
    versionNumber: number
    validationResult: ValidationResult
  }
}

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

interface CatalogBody {
  data: {
    employeeOffboardingDocumentTemplates: Array<{
      documentType: string
      usesSystemTemplate: boolean
      currentVersion: TemplateDto | null
    }>
  }
}

interface VersionsBody {
  data: {
    employeeOffboardingDocumentTemplateVersions: { meta: { total: number }; data: TemplateDto[] }
  }
}

/** Fila cruda de la tabla, sin pasar por el modelo ni el mixin. */
interface TemplateRow {
  employee_offboarding_document_template_id: number
  employee_offboarding_document_template_version_number: number
  employee_offboarding_document_template_status: string
  employee_offboarding_document_template_validation_result: string | ValidationResult | null
}

function parseVerdict(row: TemplateRow): ValidationResult | null {
  const raw = row.employee_offboarding_document_template_validation_result
  if (raw === null) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as ValidationResult) : raw
}

async function findRow(id: number): Promise<TemplateRow | null> {
  const row = await db
    .from(TEMPLATES_TABLE)
    .where('employee_offboarding_document_template_id', id)
    .first()
  return (row as TemplateRow | null) ?? null
}

async function rowsOfUnit(businessUnitId: number): Promise<TemplateRow[]> {
  return (await db
    .from(TEMPLATES_TABLE)
    .where('business_unit_id', businessUnitId)
    .orderBy('employee_offboarding_document_template_version_number', 'asc')) as TemplateRow[]
}

async function currentRow(businessUnitId: number): Promise<TemplateRow | null> {
  const allRows = await rowsOfUnit(businessUnitId)
  const rows = allRows.filter(
    (row) => row.employee_offboarding_document_template_status === DOCUMENT_TEMPLATE_STATUS.CURRENT
  )
  if (rows.length > 1) throw new Error('Más de una versión vigente')
  return rows[0] ?? null
}

/** Ejecuta el comando del candado V-1 como en despliegue (proceso aparte). */
async function runBackfill(extraArgs: string[] = []): Promise<string> {
  const { stdout, stderr } = await execFileAsync('node', ['ace', BACKFILL_COMMAND, ...extraArgs], {
    cwd: app.makePath(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  })
  return `${stdout}\n${stderr}`
}

test.group('Rechazo estructural de la plantilla (USRH1789097550387)', (group) => {
  let businessUnit: BusinessUnit
  let legacyUnit: BusinessUnit
  let uploaders: User[]
  let readOnly: User
  let legacyReader: User
  let legacyRowId: number

  const fixtures: Record<string, Buffer> = {}

  const upload = (client: ApiClient, user: User, buffer: Buffer, filename: string) =>
    client
      .post(VERSIONS_PATH)
      .loginAs(user)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', buffer, { filename, contentType: 'application/pdf' })

  group.setup(async () => {
    await purgeStaleFixtures()
    businessUnit = await createBusinessUnit('propia')
    legacyUnit = await createBusinessUnit('legado')

    const writerRole = await createRole('carga', businessUnit, ['read', 'create'])
    const readerRole = await createRole('consulta', businessUnit, ['read'])
    uploaders = [
      await createUser('carga-a', writerRole, businessUnit),
      await createUser('carga-b', writerRole, businessUnit),
      await createUser('carga-c', writerRole, businessUnit),
    ]
    readOnly = await createUser('consulta', readerRole, businessUnit)
    legacyReader = await createUser('lector-legado', readerRole, legacyUnit)

    // Versión vigente SIN dictamen: subida entre USRH1788553841100 y esta HU
    const [insertedId] = await db.table(TEMPLATES_TABLE).insert({
      business_unit_id: legacyUnit.businessUnitId,
      employee_offboarding_document_template_document_type: DOCUMENT_TYPE,
      employee_offboarding_document_template_version_number: 1,
      employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
      employee_offboarding_document_template_storage_key:
        'tests/employee-offboarding-document-templates/legado.pdf',
      employee_offboarding_document_template_original_file_name: 'legado.pdf',
      employee_offboarding_document_template_file_size_bytes: 1024,
      employee_offboarding_document_template_content_sha256: 'a'.repeat(64),
      employee_offboarding_document_template_validation_result: null,
      employee_offboarding_document_template_uploaded_by_user_id: null,
    })
    legacyRowId = Number(insertedId)

    fixtures.valid = await buildValidTemplate()
    fixtures.noFields = await buildNoFields()
    fixtures.openAction = await buildWithOpenAction()
    fixtures.catalogAa = await buildWithCatalogAdditionalActions()
    fixtures.javascript = await buildWithJavascriptNameTree()
    fixtures.embedded = await buildWithEmbeddedFile()
    fixtures.submitForm = await buildWithWidgetAction('SubmitForm')
    fixtures.xfa = await buildXfa()
    fixtures.bidi = await buildBidiFieldName()
    fixtures.duplicate = await buildDuplicateFieldDifferentType()
    fixtures.tooManyPages = await buildManyPagesAndFields(31, 201)
    fixtures.checkbox = await buildCheckboxNamedEmployeeName()
    fixtures.signature = await buildSignatureField()
    fixtures.encrypted = await buildEncrypted()
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('Base: la plantilla válida entra como versión 1 vigente con dictamen estructural aprobado', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[0], fixtures.valid, 'valida.pdf')
    response.assertStatus(201)
    const dto = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.strictEqual(dto.versionNumber, 1)
    assert.strictEqual(dto.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.exists(dto.validationResult)
    assert.isTrue(dto.validationResult!.passed)
    assert.strictEqual(dto.validationResult!.documentType, DOCUMENT_TYPE)
    assert.isString(dto.validationResult!.checkedAt)
    assert.deepEqual(dto.validationResult!.recognized, [])
    assert.deepEqual(dto.validationResult!.unrecognized, [])
    assert.deepEqual(dto.validationResult!.missingRequired, [])
    assert.deepEqual(dto.validationResult!.structural, {
      stage: 'structural',
      reason: null,
      detail: null,
    })
  })

  test('CA-1: sin campos rellenables → 422 con dictamen, fila rejected v2 y la vigente intacta', async ({
    client,
    assert,
  }) => {
    const before = await currentRow(businessUnit.businessUnitId)
    assert.exists(before)

    const response = await upload(client, uploaders[0], fixtures.noFields, 'sin-campos.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.title, REJECTED_TITLE)
    assert.strictEqual(
      body.detail,
      'El archivo no tiene campos rellenables: sin ellos el sistema no puede escribir ningún dato en el documento.'
    )
    assert.strictEqual(body.key, 'plantilla-sin-campos-rellenables')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_NO_FIELDS')
    assert.strictEqual(body.data.versionNumber, 2)
    assert.isFalse(body.data.validationResult.passed)
    assert.strictEqual(body.data.validationResult.documentType, DOCUMENT_TYPE)
    assert.deepEqual(body.data.validationResult.recognized, [])
    assert.deepEqual(body.data.validationResult.unrecognized, [])
    assert.deepEqual(body.data.validationResult.missingRequired, [])
    assert.deepEqual(body.data.validationResult.structural, {
      stage: 'structural',
      reason: 'no_form_fields',
      detail: null,
    })

    // Una fila nueva rejected con su consecutivo; la vigente sigue siendo la 1
    const rejected = await findRow(body.data.employeeOffboardingDocumentTemplateId)
    assert.exists(rejected)
    assert.strictEqual(
      rejected!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.REJECTED
    )
    assert.strictEqual(rejected!.employee_offboarding_document_template_version_number, 2)
    assert.deepEqual(parseVerdict(rejected!), body.data.validationResult)
    const after = await currentRow(businessUnit.businessUnitId)
    assert.deepEqual(after, before)

    const catalog = await client
      .get(BASE_PATH)
      .loginAs(uploaders[0])
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    catalog.assertStatus(200)
    const entry = (catalog.body() as CatalogBody).data.employeeOffboardingDocumentTemplates.find(
      (item) => item.documentType === DOCUMENT_TYPE
    )
    assert.isFalse(entry!.usesSystemTemplate)
    assert.strictEqual(entry!.currentVersion?.versionNumber, 1)
  })

  test('CA-2: contenido activo del documento → 422 plantilla-con-contenido-activo con el ofensor', async ({
    client,
    assert,
  }) => {
    const cases: Array<[Buffer, string, string]> = [
      [fixtures.openAction, 'openaction.pdf', '/OpenAction'],
      [fixtures.javascript, 'javascript.pdf', '/Names/JavaScript'],
      [fixtures.embedded, 'adjunto.pdf', '/Names/EmbeddedFiles'],
      [fixtures.catalogAa, 'aa.pdf', '/AA'],
    ]
    for (const [buffer, filename, detail] of cases) {
      const response = await upload(client, uploaders[0], buffer, filename)
      response.assertStatus(422)
      const body = response.body() as RejectedBody
      assert.strictEqual(body.key, 'plantilla-con-contenido-activo', filename)
      assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_ACTIVE_CONTENT', filename)
      assert.strictEqual(body.data.validationResult.structural.reason, 'active_content')
      assert.strictEqual(body.data.validationResult.structural.detail, detail)
    }
  }).timeout(60_000)

  test('CA-3: acción de envío en un campo → 422 sin revelar la URL de destino', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.submitForm, 'envio.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-con-envio-a-terceros')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_SUBMIT_ACTION')
    assert.strictEqual(body.data.validationResult.structural.detail, 'employee_name')
    assert.notInclude(JSON.stringify(body), 'evil.example')
  })

  test('CA-4: formulario dinámico → 422 plantilla-de-formulario-dinamico', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.xfa, 'dinamico.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-de-formulario-dinamico')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_XFA')
    assert.strictEqual(body.data.validationResult.structural.reason, 'xfa')
  })

  test('CA-5: nombre de campo con marca bidi → 422 citando el nombre saneado', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.bidi, 'bidi.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-con-nombre-de-campo-invalido')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_FIELD_NAME')
    assert.strictEqual(body.data.validationResult.structural.detail, 'raro')
    assert.notInclude(JSON.stringify(body), '\u202E')
  })

  test('CA-6: dos campos folio de tipos distintos → 422 plantilla-con-campos-duplicados', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.duplicate, 'duplicado.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-con-campos-duplicados')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_DUPLICATE_FIELD')
    assert.strictEqual(body.data.validationResult.structural.detail, 'folio')
  })

  test('CA-7: 31 páginas y 201 campos → 422 plantilla-demasiado-compleja por páginas', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.tooManyPages, 'enorme.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-demasiado-compleja')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_TOO_COMPLEX')
    assert.strictEqual(body.data.validationResult.structural.detail, '31/30')
  })

  test('CA-9: casilla con nombre del catálogo → 422 plantilla-con-campo-de-tipo-no-admitido', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[2], fixtures.checkbox, 'casilla.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-con-campo-de-tipo-no-admitido')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_FIELD_TYPE')
    assert.strictEqual(body.data.validationResult.structural.reason, 'field_type')
    assert.strictEqual(body.data.validationResult.structural.detail, 'employee_name')
  })

  test('Campo de firma → 422 plantilla-con-campo-de-firma', async ({ client, assert }) => {
    const response = await upload(client, uploaders[2], fixtures.signature, 'firma.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, 'plantilla-con-campo-de-firma')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.REJECTED_SIGNATURE_FIELD')
    assert.strictEqual(body.data.validationResult.structural.detail, 'firma')
  })

  test('Frontera: el PDF cifrado lo detiene el intake antes de la revisión, sin fila', async ({
    client,
    assert,
  }) => {
    const rowsBefore = await rowsOfUnit(businessUnit.businessUnitId)
    const response = await upload(client, uploaders[2], fixtures.encrypted, 'cifrado.pdf')
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.match(body.code, /^FILE\./)
    const rowsAfter = await rowsOfUnit(businessUnit.businessUnitId)
    assert.strictEqual(rowsAfter.length, rowsBefore.length)
  })

  test('CA-8: la plantilla correcta pasa, reemplaza a la vigente y el historial conserva los rechazos', async ({
    client,
    assert,
  }) => {
    const rowsBefore = await rowsOfUnit(businessUnit.businessUnitId)
    const response = await upload(client, uploaders[2], fixtures.valid, 'valida-v2.pdf')
    response.assertStatus(201)
    const dto = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.strictEqual(dto.versionNumber, rowsBefore.length + 1)
    assert.strictEqual(dto.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.isTrue(dto.validationResult?.passed)

    const rows = await rowsOfUnit(businessUnit.businessUnitId)
    // Consecutivo real de intentos: 1..N sin huecos
    assert.deepEqual(
      rows.map((row) => row.employee_offboarding_document_template_version_number),
      rows.map((_, index) => index + 1)
    )
    const statuses = rows.map((row) => row.employee_offboarding_document_template_status)
    assert.strictEqual(statuses[0], DOCUMENT_TEMPLATE_STATUS.SUPERSEDED)
    assert.strictEqual(statuses[statuses.length - 1], DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.isTrue(
      statuses.slice(1, -1).every((status) => status === DOCUMENT_TEMPLATE_STATUS.REJECTED)
    )

    const history = await client
      .get(VERSIONS_PATH)
      .loginAs(uploaders[2])
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    history.assertStatus(200)
    const payload = (history.body() as VersionsBody).data
      .employeeOffboardingDocumentTemplateVersions
    assert.strictEqual(payload.meta.total, rows.length)
    assert.isTrue(
      payload.data
        .filter((item) => item.status === DOCUMENT_TEMPLATE_STATUS.REJECTED)
        .every((item) => item.validationResult?.structural.reason !== null)
    )
  })

  test('CA-11: sin permiso create el 403 llega antes de subir o revisar; 404 uniforme intacto', async ({
    client,
    assert,
  }) => {
    const rowsBefore = await rowsOfUnit(businessUnit.businessUnitId)
    const forbidden = await upload(client, readOnly, fixtures.noFields, 'sin-permiso.pdf')
    forbidden.assertStatus(403)
    const body = forbidden.body() as ErrorBody
    assert.strictEqual(body.key, 'sin-permiso')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.FORBIDDEN')
    const rowsAfter = await rowsOfUnit(businessUnit.businessUnitId)
    assert.strictEqual(rowsAfter.length, rowsBefore.length)

    const missing = await client
      .get(`${VERSIONS_PATH}/999999999/download-url`)
      .loginAs(readOnly)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    missing.assertStatus(404)
    assert.strictEqual((missing.body() as ErrorBody).key, 'plantilla-no-encontrada')
  })

  test('CA-10 (dry-run): el candado V-1 lista la vigente sin dictamen y no escribe', async ({
    assert,
  }) => {
    const output = await runBackfill(['--dry-run'])
    assert.include(output, `[ID ${legacyRowId}]`, output)
    assert.include(output, 'Por degradar    : 1', output)
    const row = await findRow(legacyRowId)
    assert.strictEqual(
      row!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.CURRENT
    )
    assert.isNull(parseVerdict(row!))
  }).timeout(60_000)

  test('CA-10 (en firme): la vigente sin dictamen pasa a rejected y la empresa vuelve a la plantilla del sistema', async ({
    client,
    assert,
  }) => {
    const output = await runBackfill()
    assert.include(output, 'Degradadas      : 1', output)
    const row = await findRow(legacyRowId)
    assert.strictEqual(
      row!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.REJECTED
    )
    const verdict = parseVerdict(row!)
    assert.exists(verdict)
    assert.isFalse(verdict!.passed)
    assert.deepEqual(verdict!.structural, {
      stage: 'structural',
      reason: 'unvalidated_legacy',
      detail: null,
    })

    const catalog = await client
      .get(BASE_PATH)
      .loginAs(legacyReader)
      .header('X-Business-Unit-Id', legacyUnit.businessUnitPublicId)
    catalog.assertStatus(200)
    const entry = (catalog.body() as CatalogBody).data.employeeOffboardingDocumentTemplates.find(
      (item) => item.documentType === DOCUMENT_TYPE
    )
    assert.isTrue(entry!.usesSystemTemplate)
    assert.isNull(entry!.currentVersion)
  }).timeout(60_000)

  test('CA-10 (idempotencia): la segunda corrida no cambia nada', async ({ assert }) => {
    const before = await findRow(legacyRowId)
    const output = await runBackfill()
    assert.include(output, 'Sin dictamen    : 0', output)
    assert.deepEqual(await findRow(legacyRowId), before)
  }).timeout(60_000)
})

import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
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
import DocumentTemplatesRepositoryMysql from '#modules/employee-offboarding/document-templates/document_templates.repository.mysql'
import {
  ALL_CATALOG_FIELD_NAMES,
  buildAllCatalogFields,
  buildForeignFieldName,
  buildMissingHireDate,
  buildMultiWidgetField,
  buildTypoAndMissing,
  buildTypoFieldName,
  buildValidTemplate,
  MISSING_HIRE_DATE_FIELD_NAMES,
  VALID_TEMPLATE_FIELD_NAMES,
} from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550388 — contraste de campos de extremo a extremo: la plantilla
 * completa que pasa y desplaza a la vigente (CA-1), el campo mal escrito con
 * sugerencia (CA-2), el inventado sin ella (CA-3), el obligatorio ausente con
 * su etiqueta en es/en (CA-4), el determinismo (CA-5), el repetido contado
 * una vez (CA-6), la `current` heredada sin dictamen que ya no se resuelve
 * (CA-7) y el ciclo de vida del historial.
 *
 * Corre sobre la base y el bucket de DESARROLLO (los objetos quedan
 * huérfanos, como en las demás suites). El limiter del POST es de 10 por
 * minuto y usuario: las ocho cargas se reparten entre dos usuarios.
 */

const TEST_PASSWORD = 'TemplateFieldsContrast123!'
const BASE_PATH = '/api/employee-offboarding-document-templates'
const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const VERSIONS_PATH = `${BASE_PATH}/${DOCUMENT_TYPE}/versions`
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const REJECTED_TITLE = 'No se pudo aceptar la plantilla'
const VALIDATION_FAILED_KEY = 'plantilla-con-campos-invalidos'
const VALIDATION_FAILED_CODE = 'OFFB.TEMPLATE.VALIDATION_FAILED'
const FIELDS_STAGE = { stage: 'fields', reason: null, detail: null }

/** Prefijo ÚNICO de las fixtures de este spec (slug de empresa y de rol). */
const FIXTURE_SLUG_PREFIX = 'plantilla-contraste-'

/** Tabla de `User.accessTokens`: `loginAs` deja tokens que hay que retirar antes del usuario. */
const ACCESS_TOKENS_TABLE = 'api_tokens'

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
    businessUnitName: `Plantilla contraste ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Plantilla contraste ${prefix} Legal ${stamp}`,
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
    roleName: `Plantilla contraste ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec de contraste de plantillas',
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
    personFirstname: 'Contraste',
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

interface ValidationResult {
  checkedAt: string
  documentType: string
  passed: boolean
  recognized: string[]
  unrecognized: { fieldName: string; suggestedFieldKey: string | null }[]
  missingRequired: string[]
  structural: { stage: string; reason: string | null; detail: string | null }
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

/** El dictamen sin su fecha, para comparar dos intentos del mismo archivo. */
function undated(verdict: ValidationResult): ValidationResult {
  return { ...verdict, checkedAt: '' }
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

test.group('Contraste de campos de la plantilla (USRH1789097550388)', (group) => {
  let businessUnit: BusinessUnit
  let legacyUnit: BusinessUnit
  let uploaders: User[]
  let legacyReader: User
  let legacyRowId: number
  let currentVersionId: number
  const missingHireDateRowIds: number[] = []

  const fixtures: Record<string, Buffer> = {}

  const upload = (client: ApiClient, user: User, buffer: Buffer, filename: string, locale = 'es') =>
    client
      .post(VERSIONS_PATH)
      .loginAs(user)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .header('Accept-Language', locale)
      .file('file', buffer, { filename, contentType: 'application/pdf' })

  const catalogOf = (client: ApiClient, user: User, unit: BusinessUnit) =>
    client.get(BASE_PATH).loginAs(user).header('X-Business-Unit-Id', unit.businessUnitPublicId)

  const historyOf = (client: ApiClient, user: User, unit: BusinessUnit) =>
    client.get(VERSIONS_PATH).loginAs(user).header('X-Business-Unit-Id', unit.businessUnitPublicId)

  const catalogEntry = (body: CatalogBody) =>
    body.data.employeeOffboardingDocumentTemplates.find(
      (entry) => entry.documentType === DOCUMENT_TYPE
    )

  group.setup(async () => {
    await purgeStaleFixtures()
    businessUnit = await createBusinessUnit('propia')
    legacyUnit = await createBusinessUnit('legado')
    const writerRole = await createRole('carga', businessUnit, ['read', 'create'])
    const readerRole = await createRole('consulta', legacyUnit, ['read'])
    uploaders = [
      await createUser('carga-a', writerRole, businessUnit),
      await createUser('carga-b', writerRole, businessUnit),
    ]
    legacyReader = await createUser('lector-legado', readerRole, legacyUnit)

    // Versión vigente SIN dictamen: fila creada por USRH1788553841100 antes de la cadena
    const [insertedId] = await db.table(TEMPLATES_TABLE).insert({
      business_unit_id: legacyUnit.businessUnitId,
      employee_offboarding_document_template_document_type: DOCUMENT_TYPE,
      employee_offboarding_document_template_version_number: 1,
      employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
      employee_offboarding_document_template_storage_key:
        'tests/employee-offboarding-document-templates/legado-contraste.pdf',
      employee_offboarding_document_template_original_file_name: 'legado.pdf',
      employee_offboarding_document_template_file_size_bytes: 1024,
      employee_offboarding_document_template_content_sha256: 'b'.repeat(64),
      employee_offboarding_document_template_validation_result: null,
      employee_offboarding_document_template_uploaded_by_user_id: null,
    })
    legacyRowId = Number(insertedId)

    fixtures.valid = await buildValidTemplate()
    fixtures.allCatalog = await buildAllCatalogFields()
    fixtures.typo = await buildTypoFieldName()
    fixtures.foreign = await buildForeignFieldName()
    fixtures.missingHireDate = await buildMissingHireDate()
    fixtures.typoAndMissing = await buildTypoAndMissing()
    fixtures.multiWidget = await buildMultiWidgetField()
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('Base: la plantilla con los seis obligatorios entra como versión 1 vigente con dictamen de campos', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[0], fixtures.valid, 'valida.pdf')
    response.assertStatus(201)
    const dto = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.strictEqual(dto.versionNumber, 1)
    assert.strictEqual(dto.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.isTrue(dto.validationResult?.passed)
    assert.deepEqual(dto.validationResult?.recognized, [...VALID_TEMPLATE_FIELD_NAMES])
    assert.deepEqual(dto.validationResult?.unrecognized, [])
    assert.deepEqual(dto.validationResult?.missingRequired, [])
    assert.deepEqual(dto.validationResult?.structural, FIELDS_STAGE)
    currentVersionId = dto.employeeOffboardingDocumentTemplateId
  })

  test('CA-1: los diez campos del catálogo → 201 vigente con recognized en orden de catálogo; la anterior queda superseded', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.allCatalog, 'completa.pdf')
    response.assertStatus(201)
    const dto = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.strictEqual(dto.versionNumber, 2)
    assert.strictEqual(dto.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    const verdict = dto.validationResult
    assert.exists(verdict)
    assert.isTrue(verdict!.passed)
    assert.strictEqual(verdict!.documentType, DOCUMENT_TYPE)
    assert.isString(verdict!.checkedAt)
    assert.deepEqual(verdict!.recognized, [...ALL_CATALOG_FIELD_NAMES])
    assert.deepEqual(verdict!.unrecognized, [])
    assert.deepEqual(verdict!.missingRequired, [])
    assert.deepEqual(verdict!.structural, FIELDS_STAGE)

    // Traslado de vigencia en la misma transacción
    const previous = await findRow(currentVersionId)
    assert.strictEqual(
      previous?.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.SUPERSEDED
    )
    const current = await currentRow(businessUnit.businessUnitId)
    assert.strictEqual(
      current?.employee_offboarding_document_template_id,
      dto.employeeOffboardingDocumentTemplateId
    )
    currentVersionId = dto.employeeOffboardingDocumentTemplateId
  })

  test('CA-2: employe_name → 422 plantilla-con-campos-invalidos con sugerencia employee_name; la vigente no se toca', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[0], fixtures.typo, 'error-de-dedo.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.title, REJECTED_TITLE)
    assert.strictEqual(
      body.detail,
      'El archivo tiene campos que el sistema no reconoce: employe_name.'
    )
    assert.strictEqual(body.key, VALIDATION_FAILED_KEY)
    assert.strictEqual(body.code, VALIDATION_FAILED_CODE)
    assert.strictEqual(body.data.versionNumber, 3)
    const verdict = body.data.validationResult
    assert.isFalse(verdict.passed)
    assert.strictEqual(verdict.documentType, DOCUMENT_TYPE)
    assert.deepEqual(verdict.recognized, [...VALID_TEMPLATE_FIELD_NAMES])
    assert.deepEqual(verdict.unrecognized, [
      { fieldName: 'employe_name', suggestedFieldKey: 'employee_name' },
    ])
    assert.deepEqual(verdict.missingRequired, [])
    assert.deepEqual(verdict.structural, FIELDS_STAGE)

    // La fila `rejected` existe con el MISMO dictamen que viajó en `data`
    const row = await findRow(body.data.employeeOffboardingDocumentTemplateId)
    assert.exists(row)
    assert.strictEqual(
      row!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.REJECTED
    )
    assert.deepEqual(parseVerdict(row!), verdict)

    // La vigente sigue siendo la misma y el catálogo la sigue resolviendo
    const current = await currentRow(businessUnit.businessUnitId)
    assert.strictEqual(current?.employee_offboarding_document_template_id, currentVersionId)
    const listing = await catalogOf(client, uploaders[0], businessUnit)
    listing.assertStatus(200)
    const entry = catalogEntry(listing.body() as CatalogBody)
    assert.isFalse(entry?.usesSystemTemplate)
    assert.strictEqual(
      entry?.currentVersion?.employeeOffboardingDocumentTemplateId,
      currentVersionId
    )
  })

  test('CA-3: nombre_empleado → 422 no reconocido sin sugerencia', async ({ client, assert }) => {
    const response = await upload(client, uploaders[1], fixtures.foreign, 'inventado.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, VALIDATION_FAILED_KEY)
    assert.strictEqual(body.code, VALIDATION_FAILED_CODE)
    assert.strictEqual(
      body.detail,
      'El archivo tiene campos que el sistema no reconoce: nombre_empleado.'
    )
    assert.deepEqual(body.data.validationResult.unrecognized, [
      { fieldName: 'nombre_empleado', suggestedFieldKey: null },
    ])
    assert.deepEqual(body.data.validationResult.missingRequired, [])
    const row = await findRow(body.data.employeeOffboardingDocumentTemplateId)
    assert.strictEqual(
      row?.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.REJECTED
    )
  })

  test('CA-4: sin hire_date → 422 nombrando "Fecha de ingreso"; en inglés, "Hire date"', async ({
    client,
    assert,
  }) => {
    const spanish = await upload(client, uploaders[0], fixtures.missingHireDate, 'sin-fecha.pdf')
    spanish.assertStatus(422)
    const body = spanish.body() as RejectedBody
    assert.strictEqual(body.title, REJECTED_TITLE)
    assert.strictEqual(body.detail, 'Faltan campos obligatorios: Fecha de ingreso.')
    assert.strictEqual(body.key, VALIDATION_FAILED_KEY)
    assert.strictEqual(body.code, VALIDATION_FAILED_CODE)
    assert.deepEqual(body.data.validationResult.recognized, [...MISSING_HIRE_DATE_FIELD_NAMES])
    assert.deepEqual(body.data.validationResult.unrecognized, [])
    assert.deepEqual(body.data.validationResult.missingRequired, ['hire_date'])
    missingHireDateRowIds.push(body.data.employeeOffboardingDocumentTemplateId)

    const english = await upload(
      client,
      uploaders[1],
      fixtures.missingHireDate,
      'sin-fecha-en.pdf',
      'en'
    )
    english.assertStatus(422)
    const englishBody = english.body() as RejectedBody
    assert.strictEqual(englishBody.title, 'The template could not be accepted')
    assert.strictEqual(englishBody.detail, 'Required fields are missing: Hire date.')
    assert.strictEqual(englishBody.key, VALIDATION_FAILED_KEY)
    missingHireDateRowIds.push(englishBody.data.employeeOffboardingDocumentTemplateId)
  })

  test('CA-5: el mismo archivo dos veces → dictámenes idénticos salvo checkedAt', async ({
    assert,
  }) => {
    assert.lengthOf(missingHireDateRowIds, 2)
    const first = await findRow(missingHireDateRowIds[0])
    const second = await findRow(missingHireDateRowIds[1])
    const firstVerdict = parseVerdict(first!)
    const secondVerdict = parseVerdict(second!)
    assert.exists(firstVerdict)
    assert.exists(secondVerdict)
    assert.deepEqual(undated(firstVerdict!), undated(secondVerdict!))
    // Dos intentos: dos consecutivos
    assert.notStrictEqual(
      first!.employee_offboarding_document_template_version_number,
      second!.employee_offboarding_document_template_version_number
    )
  })

  test('Ambas fallas a la vez → un solo code y el detail con las dos frases en orden', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[0], fixtures.typoAndMissing, 'dos-fallas.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, VALIDATION_FAILED_KEY)
    assert.strictEqual(body.code, VALIDATION_FAILED_CODE)
    assert.strictEqual(
      body.detail,
      'El archivo tiene campos que el sistema no reconoce: employe_name. Faltan campos obligatorios: Fecha de ingreso.'
    )
    assert.deepEqual(body.data.validationResult.recognized, [...MISSING_HIRE_DATE_FIELD_NAMES])
    assert.deepEqual(body.data.validationResult.unrecognized, [
      { fieldName: 'employe_name', suggestedFieldKey: 'employee_name' },
    ])
    assert.deepEqual(body.data.validationResult.missingRequired, ['hire_date'])
  })

  test('CA-6: un campo employee_name con tres widgets se cuenta una sola vez', async ({
    client,
    assert,
  }) => {
    const response = await upload(client, uploaders[1], fixtures.multiWidget, 'tres-widgets.pdf')
    response.assertStatus(422)
    const body = response.body() as RejectedBody
    assert.strictEqual(body.key, VALIDATION_FAILED_KEY)
    assert.deepEqual(body.data.validationResult.recognized, ['employee_name'])
    assert.deepEqual(body.data.validationResult.unrecognized, [])
    assert.deepEqual(body.data.validationResult.missingRequired, [
      'legal_name',
      'position_name',
      'hire_date',
      'separation_date',
      'folio',
    ])
    assert.strictEqual(
      body.detail,
      'Faltan campos obligatorios: Razón social de la empresa, Puesto, Fecha de ingreso, Fecha de separación, Folio.'
    )
  })

  test('CA-7: la current heredada sin dictamen no se resuelve como vigente; el historial la conserva', async ({
    client,
    assert,
  }) => {
    const repository = new DocumentTemplatesRepositoryMysql()
    assert.isNull(await repository.resolveCurrent(legacyUnit.businessUnitId, DOCUMENT_TYPE))
    assert.exists(
      await repository.findVersionInScope(legacyUnit.businessUnitId, DOCUMENT_TYPE, legacyRowId)
    )

    const listing = await catalogOf(client, legacyReader, legacyUnit)
    listing.assertStatus(200)
    const entry = catalogEntry(listing.body() as CatalogBody)
    assert.isTrue(entry?.usesSystemTemplate)
    assert.isNull(entry?.currentVersion)

    const history = await historyOf(client, legacyReader, legacyUnit)
    history.assertStatus(200)
    const payload = (history.body() as VersionsBody).data
      .employeeOffboardingDocumentTemplateVersions
    assert.strictEqual(payload.meta.total, 1)
    assert.strictEqual(payload.data[0].status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.isNull(payload.data[0].validationResult)
  })

  test('Ciclo de vida: cada intento queda con su consecutivo sin huecos, su estado terminal y su dictamen de campos', async ({
    client,
    assert,
  }) => {
    const rows = await rowsOfUnit(businessUnit.businessUnitId)
    assert.deepEqual(
      rows.map((row) => row.employee_offboarding_document_template_version_number),
      rows.map((_, index) => index + 1)
    )
    const statuses = rows.map((row) => row.employee_offboarding_document_template_status)
    assert.deepEqual(statuses.slice(0, 2), [
      DOCUMENT_TEMPLATE_STATUS.SUPERSEDED,
      DOCUMENT_TEMPLATE_STATUS.CURRENT,
    ])
    assert.isTrue(statuses.slice(2).every((status) => status === DOCUMENT_TEMPLATE_STATUS.REJECTED))
    for (const row of rows) {
      const verdict = parseVerdict(row)
      assert.exists(verdict)
      assert.deepEqual(verdict!.structural, FIELDS_STAGE)
      assert.strictEqual(
        verdict!.passed,
        row.employee_offboarding_document_template_status !== DOCUMENT_TEMPLATE_STATUS.REJECTED
      )
    }

    const history = await historyOf(client, uploaders[0], businessUnit)
    history.assertStatus(200)
    const payload = (history.body() as VersionsBody).data
      .employeeOffboardingDocumentTemplateVersions
    assert.strictEqual(payload.meta.total, rows.length)
    assert.isTrue(
      payload.data.every((item) => item.validationResult?.structural.stage === 'fields')
    )
  })
})

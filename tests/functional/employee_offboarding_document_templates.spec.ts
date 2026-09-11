import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import UploadService from '#services/upload_service'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import {
  EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE,
  REFERENCE_DATE_SOURCE,
} from '#modules/employee-offboarding/documents/documents.constants'
import { DOCUMENT_TEMPLATE_STATUS } from '#modules/employee-offboarding/document-templates/document_templates.constants'
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'

/**
 * USRH1788553841100 — plantillas propias del documento de salida: carga,
 * versionado, catálogo, historial y descarga (CA-1, CA-2, CA-3, CA-4, CA-5,
 * CA-6, CA-7, CA-8 y CA-10 del spec).
 *
 * Corre sobre la base y el bucket de DESARROLLO (mismo `.env`): sube PDFs
 * reales al almacenamiento privado; los objetos quedan huérfanos al terminar
 * (no existe borrado en el slice), igual que en las demás suites de subida.
 * Las fixtures de base se destruyen en `group.teardown` en orden inverso de FK.
 */

const TEST_PASSWORD = 'DocumentTemplates123!'
const BASE_PATH = '/api/employee-offboarding-document-templates'
const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const SIGNED_URL_EXPIRES_SECONDS = 300

/** Prefijo ÚNICO de las fixtures de este spec (slug de empresa y de rol). */
const FIXTURE_SLUG_PREFIX = 'plantilla-salida-'

/** Tabla de `User.accessTokens`: `loginAs` deja tokens que hay que retirar antes del usuario. */
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Claves EXACTAS del DTO: nunca `storageKey` ni `businessUnitId`. */
const EXPECTED_DTO_KEYS = [
  'employeeOffboardingDocumentTemplateId',
  'documentType',
  'versionNumber',
  'status',
  'originalFileName',
  'fileSizeBytes',
  'contentSha256',
  'validationResult',
  'uploadedByUserId',
  'uploadedByUserName',
  'createdAt',
]

/** Cabecera ZIP real (`PK\x03\x04`, como un `.docx`) renombrada a `.pdf`: el intake la rechaza por contenido. */
const DOCX_LIKE_BUFFER = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0)])

const created = {
  businessUnitIds: [] as number[],
  roleIds: [] as number[],
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** PDF REAL (pdf-lib): el perfil `pdf-document` recarga y re-serializa el archivo. */
async function buildPdf(marker: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(`Plantilla de prueba ${marker}`, { x: 50, y: 780, size: 14, font })
  return Buffer.from(await pdf.save())
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Plantilla salida ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Plantilla salida ${prefix} Legal ${stamp}`,
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
    roleName: `Plantilla salida ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec de plantillas de salida',
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
    personFirstname: 'Plantilla',
    personLastname: 'Salida',
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

/** Expediente con la baja ejecutada y una constancia emitida (regresión CA-4). */
async function createIssuedDocumentFixture(
  businessUnit: BusinessUnit
): Promise<{ offboarding: EmployeeOffboarding; document: EmployeeOffboardingDocument }> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: 'Prueba',
    personLastname: 'Emitida',
    personSecondLastname: 'Plantilla',
    personEmail: `colaborador-${stamp}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `PL-${stamp}`
  employee.employeeFirstName = 'Prueba'
  employee.employeeLastName = 'Emitida'
  employee.employeeSecondLastName = 'Plantilla'
  employee.employeePayrollNum = `PL-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeHireDate = DateTime.fromISO('2022-01-10')
  employee.employeeTerminatedDate = '2026-03-15'
  await employee.save()
  await db
    .from(Employee.table)
    .where('employee_id', employee.employeeId)
    .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })

  const offboarding = await EmployeeOffboarding.create({
    employeeId: employee.employeeId,
    businessUnitId: businessUnit.businessUnitId,
    employeeOffboardingPlannedDate: '2026-03-15',
    employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
    employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
    employeeOffboardingNotes: null,
    employeeOffboardingOpenedByUserId: null,
  })
  const folio = `CS-${offboarding.employeeOffboardingId}-2026-0001`
  const document = await EmployeeOffboardingDocument.create({
    employeeOffboardingId: offboarding.employeeOffboardingId,
    employeeOffboardingDocumentType: DOCUMENT_TYPE,
    employeeOffboardingDocumentFolio: folio,
    employeeOffboardingDocumentFile: `tests/employee-offboarding-documents/${folio}.pdf`,
    employeeOffboardingDocumentFileName: `${folio}.pdf`,
    employeeOffboardingDocumentSizeBytes: 2048,
    employeeOffboardingDocumentEmployeeName: 'Prueba Emitida Plantilla',
    employeeOffboardingDocumentPositionName: null,
    employeeOffboardingDocumentDepartmentName: null,
    employeeOffboardingDocumentLegalName: businessUnit.businessUnitLegalName,
    employeeOffboardingDocumentHireDate: DateTime.fromISO('2022-01-10'),
    employeeOffboardingDocumentReferenceDate: DateTime.fromISO('2026-03-15'),
    employeeOffboardingDocumentReferenceDateSource: REFERENCE_DATE_SOURCE.TERMINATED,
    employeeOffboardingDocumentSeniorityDays: 1526,
    employeeOffboardingDocumentContentHash: 'e'.repeat(64),
    employeeOffboardingDocumentIsCurrent: true,
    employeeOffboardingDocumentSupersededDocumentId: null,
    employeeOffboardingDocumentGeneratedByUserId: null,
  })
  return { offboarding, document }
}

/**
 * Destruye en orden inverso de FK todo lo que cuelga de las empresas y roles
 * dados. La usan el teardown y el setup (restos de una corrida interrumpida).
 */
async function destroyFixtures(businessUnitIds: number[], roleIds: number[]): Promise<void> {
  if (businessUnitIds.length > 0) {
    await db.from(TEMPLATES_TABLE).whereIn('business_unit_id', businessUnitIds).delete()
    const offboardings = await db
      .from(EmployeeOffboarding.table)
      .select('employee_offboarding_id')
      .whereIn('business_unit_id', businessUnitIds)
    const offboardingIds = offboardings.map((row) => Number(row.employee_offboarding_id))
    if (offboardingIds.length > 0) {
      await db
        .from(EmployeeOffboardingDocument.table)
        .whereIn('employee_offboarding_id', offboardingIds)
        .delete()
      await db
        .from(EmployeeOffboarding.table)
        .whereIn('employee_offboarding_id', offboardingIds)
        .delete()
    }
    const employees = await db
      .from(Employee.table)
      .select('employee_id', 'person_id')
      .whereIn('business_unit_id', businessUnitIds)
    if (employees.length > 0) {
      await db
        .from(Employee.table)
        .whereIn(
          'employee_id',
          employees.map((row) => Number(row.employee_id))
        )
        .delete()
      await db
        .from(Person.table)
        .whereIn(
          'person_id',
          employees.map((row) => Number(row.person_id))
        )
        .delete()
    }
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

interface TemplateDto {
  employeeOffboardingDocumentTemplateId: number
  documentType: string
  versionNumber: number
  status: string
  originalFileName: string
  fileSizeBytes: number
  contentSha256: string
  validationResult: unknown
  uploadedByUserId: number | null
  uploadedByUserName: string | null
  createdAt: string | null
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

interface StoreBody {
  data: { employeeOffboardingDocumentTemplate: TemplateDto }
}

interface DownloadBody {
  data: {
    employeeOffboardingDocumentTemplateDownload: { downloadUrl: string; expiresInSeconds: number }
  }
}

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

/** Fila cruda de la tabla, sin pasar por el modelo ni el mixin. */
interface TemplateRow {
  employee_offboarding_document_template_id: number
  employee_offboarding_document_template_status: string
  employee_offboarding_document_template_storage_key: string
  employee_offboarding_document_template_content_sha256: string
}

async function findTemplateRow(id: number): Promise<TemplateRow | null> {
  const row = await db
    .from(TEMPLATES_TABLE)
    .where('employee_offboarding_document_template_id', id)
    .first()
  return (row as TemplateRow | null) ?? null
}

async function findCurrentRow(businessUnitId: number): Promise<TemplateRow | null> {
  const row = await db
    .from(TEMPLATES_TABLE)
    .where('business_unit_id', businessUnitId)
    .where('employee_offboarding_document_template_status', DOCUMENT_TEMPLATE_STATUS.CURRENT)
    .first()
  return (row as TemplateRow | null) ?? null
}

async function countTemplates(businessUnitId: number, status?: string): Promise<number> {
  const query = db.from(TEMPLATES_TABLE).where('business_unit_id', businessUnitId)
  if (status) query.where('employee_offboarding_document_template_status', status)
  const row = await query.count('* as total').first()
  return Number((row as { total?: string | number } | undefined)?.total ?? 0)
}

test.group('Plantillas propias del documento de salida (USRH1788553841100)', (group) => {
  let businessUnit: BusinessUnit
  let otherBusinessUnit: BusinessUnit
  let uploader: User
  let readOnly: User
  let otherUploader: User
  let issuedOffboarding: EmployeeOffboarding
  let issuedDocument: EmployeeOffboardingDocument
  let pdfV1: Buffer
  let pdfV2: Buffer
  let pdfV3: Buffer

  let versionOne: TemplateDto
  let versionOneStorageKey: string

  group.setup(async () => {
    await purgeStaleFixtures()
    businessUnit = await createBusinessUnit('propia')
    otherBusinessUnit = await createBusinessUnit('ajena')

    const writerRole = await createRole('carga', businessUnit, ['read', 'create'])
    const readerRole = await createRole('consulta', businessUnit, ['read'])
    uploader = await createUser('carga', writerRole, businessUnit)
    readOnly = await createUser('consulta', readerRole, businessUnit)
    otherUploader = await createUser('carga-ajena', writerRole, otherBusinessUnit)

    const issued = await createIssuedDocumentFixture(businessUnit)
    issuedOffboarding = issued.offboarding
    issuedDocument = issued.document

    pdfV1 = await buildPdf('v1')
    pdfV2 = await buildPdf('v2')
    pdfV3 = await buildPdf('v3')
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: la primera carga crea la versión 1 vigente, sellada sobre el objeto almacenado y sin exponer la key', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', pdfV1, { filename: 'Constancia Legal v1.pdf', contentType: 'application/pdf' })
    response.assertStatus(201)

    versionOne = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.sameMembers(Object.keys(versionOne), EXPECTED_DTO_KEYS)
    assert.strictEqual(versionOne.documentType, DOCUMENT_TYPE)
    assert.strictEqual(versionOne.versionNumber, 1)
    assert.strictEqual(versionOne.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.strictEqual(versionOne.originalFileName, 'Constancia_Legal_v1.pdf')
    assert.isTrue(Number.isInteger(versionOne.fileSizeBytes) && versionOne.fileSizeBytes > 0)
    assert.match(versionOne.contentSha256, /^[0-9a-f]{64}$/)
    assert.isNull(versionOne.validationResult)
    assert.strictEqual(versionOne.uploadedByUserId, uploader.userId)
    assert.isString(versionOne.uploadedByUserName)
    assert.isNotEmpty(versionOne.uploadedByUserName)

    // Identidad del sello: sha256 del objeto TAL COMO quedó almacenado
    const row = await findTemplateRow(versionOne.employeeOffboardingDocumentTemplateId)
    assert.exists(row)
    versionOneStorageKey = row!.employee_offboarding_document_template_storage_key
    const stored = await new UploadService().readStoredFileBuffer(versionOneStorageKey)
    assert.exists(stored)
    assert.strictEqual(sha256(stored!), versionOne.contentSha256)
    assert.strictEqual(stored!.byteLength, versionOne.fileSizeBytes)
    // El intake reescribe el PDF: el sello no es el del archivo que subió el cliente
    assert.notStrictEqual(versionOne.contentSha256, sha256(pdfV1))
  })

  test('CA-2: el catálogo deja de decir "plantilla del sistema" solo para la empresa que subió', async ({
    client,
    assert,
  }) => {
    const own = await client
      .get(BASE_PATH)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    own.assertStatus(200)
    const entries = (own.body() as CatalogBody).data.employeeOffboardingDocumentTemplates
    assert.lengthOf(entries, Object.values(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE).length)
    const letter = entries.find((entry) => entry.documentType === DOCUMENT_TYPE)
    assert.exists(letter)
    assert.isFalse(letter!.usesSystemTemplate)
    assert.strictEqual(letter!.currentVersion?.versionNumber, 1)
    assert.sameMembers(Object.keys(letter!.currentVersion!), EXPECTED_DTO_KEYS)

    const foreign = await client
      .get(BASE_PATH)
      .loginAs(otherUploader)
      .header('X-Business-Unit-Id', otherBusinessUnit.businessUnitPublicId)
    foreign.assertStatus(200)
    const foreignLetter = (
      foreign.body() as CatalogBody
    ).data.employeeOffboardingDocumentTemplates.find(
      (entry) => entry.documentType === DOCUMENT_TYPE
    )
    assert.exists(foreignLetter)
    assert.isTrue(foreignLetter!.usesSystemTemplate)
    assert.isNull(foreignLetter!.currentVersion)
  })

  test('CA-3: subir de nuevo versiona; la anterior queda reemplazada con su archivo y su sello intactos', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', pdfV2, { filename: 'constancia-v2.pdf', contentType: 'application/pdf' })
    response.assertStatus(201)
    const versionTwo = (response.body() as StoreBody).data.employeeOffboardingDocumentTemplate
    assert.strictEqual(versionTwo.versionNumber, 2)
    assert.strictEqual(versionTwo.status, DOCUMENT_TEMPLATE_STATUS.CURRENT)
    assert.notStrictEqual(versionTwo.contentSha256, versionOne.contentSha256)

    const previous = await findTemplateRow(versionOne.employeeOffboardingDocumentTemplateId)
    assert.exists(previous)
    assert.strictEqual(
      previous!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.SUPERSEDED
    )
    assert.strictEqual(
      previous!.employee_offboarding_document_template_storage_key,
      versionOneStorageKey
    )
    assert.strictEqual(
      previous!.employee_offboarding_document_template_content_sha256,
      versionOne.contentSha256
    )

    // Ni dos vigentes ni cero
    assert.strictEqual(
      await countTemplates(businessUnit.businessUnitId, DOCUMENT_TEMPLATE_STATUS.CURRENT),
      1
    )
    assert.strictEqual(await countTemplates(businessUnit.businessUnitId), 2)

    const history = await client
      .get(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    history.assertStatus(200)
    const body = history.body() as VersionsBody
    assert.strictEqual(body.data.employeeOffboardingDocumentTemplateVersions.meta.total, 2)
    assert.deepEqual(
      body.data.employeeOffboardingDocumentTemplateVersions.data.map((row) => [
        row.versionNumber,
        row.status,
      ]),
      [
        [2, DOCUMENT_TEMPLATE_STATUS.CURRENT],
        [1, DOCUMENT_TEMPLATE_STATUS.SUPERSEDED],
      ]
    )
  })

  test('CA-4: subir una plantilla no mueve lo ya emitido en el expediente', async ({
    client,
    assert,
  }) => {
    const documentsPath = `/api/employee-offboardings/${issuedOffboarding.employeeOffboardingId}/documents`
    const downloadPath = `${documentsPath}/${issuedDocument.employeeOffboardingDocumentId}/download-url`
    const before = await client
      .get(documentsPath)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    before.assertStatus(200)
    const downloadBefore = await client
      .get(downloadPath)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    downloadBefore.assertStatus(200)
    const rowBefore = await db
      .from(EmployeeOffboardingDocument.table)
      .where('employee_offboarding_id', issuedOffboarding.employeeOffboardingId)
      .first()

    const response = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', pdfV3, { filename: 'constancia-v3.pdf', contentType: 'application/pdf' })
    response.assertStatus(201)

    const after = await client
      .get(documentsPath)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    after.assertStatus(200)
    assert.deepEqual(after.body().data, before.body().data)
    const downloadAfter = await client
      .get(downloadPath)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    downloadAfter.assertStatus(200)
    const issuedBefore = downloadBefore.body().data.employeeOffboardingDocumentDownload as {
      downloadUrl: string
      expiresInSeconds: number
    }
    const issuedAfter = downloadAfter.body().data.employeeOffboardingDocumentDownload as {
      downloadUrl: string
      expiresInSeconds: number
    }
    // La URL firmada cambia en cada petición (marca de tiempo): se compara sin la query
    assert.strictEqual(issuedAfter.expiresInSeconds, issuedBefore.expiresInSeconds)
    assert.strictEqual(
      new URL(issuedAfter.downloadUrl).pathname,
      new URL(issuedBefore.downloadUrl).pathname
    )
    const rowAfter = await db
      .from(EmployeeOffboardingDocument.table)
      .where('employee_offboarding_id', issuedOffboarding.employeeOffboardingId)
      .first()
    assert.deepEqual(rowAfter, rowBefore)
  })

  test('CA-5: lo que el intake no acepta se rechaza con su propio triplete FILE.* y sin fila', async ({
    client,
    assert,
  }) => {
    const totalBefore = await countTemplates(businessUnit.businessUnitId)
    const currentBefore = await findCurrentRow(businessUnit.businessUnitId)

    const disguised = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', DOCX_LIKE_BUFFER, { filename: 'contrato.pdf', contentType: 'application/pdf' })
    // Triplete PROPIO del intake (regla 1): este slice no redeclara esos códigos
    disguised.assertStatus(422)
    const disguisedBody = disguised.body() as ErrorBody
    assert.strictEqual(disguisedBody.key, 'contenido-no-corresponde')
    assert.strictEqual(disguisedBody.code, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
    assert.isString(disguisedBody.title)
    assert.isString(disguisedBody.detail)

    const oversized = Buffer.concat([pdfV1, Buffer.alloc(10 * 1024 * 1024 + 1024, 0x20)])
    const tooLarge = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', oversized, { filename: 'gigante.pdf', contentType: 'application/pdf' })
    // Entre 10 y 20 MB decide el intake; por encima del tope multipart de la
    // plataforma (20 MB) el bodyparser responde 413 antes del controller
    tooLarge.assertStatus(422)
    const tooLargeBody = tooLarge.body() as ErrorBody
    assert.strictEqual(tooLargeBody.key, 'archivo-demasiado-grande')
    assert.strictEqual(tooLargeBody.code, FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE)

    assert.strictEqual(await countTemplates(businessUnit.businessUnitId), totalBefore)
    assert.deepEqual(await findCurrentRow(businessUnit.businessUnitId), currentBefore)
  })

  test('Campo file ausente: 400 datos-invalidos con el código del slice', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .field('note', 'sin archivo')
    response.assertStatus(400)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.key, 'datos-invalidos')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.VAL_INPUT')
  })

  test('CA-6: un tipo de documento desconocido responde 422 tipo-de-documento-no-valido', async ({
    client,
    assert,
  }) => {
    const store = await client
      .post(`${BASE_PATH}/termination_agreement/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', pdfV1, { filename: 'convenio.pdf', contentType: 'application/pdf' })
    store.assertStatus(422)
    assert.deepEqual(store.body(), {
      title: 'No fue posible procesar la plantilla',
      detail: 'El tipo de documento de salida indicado no existe.',
      key: 'tipo-de-documento-no-valido',
      code: 'OFFB.TEMPLATE.TYPE_INVALID',
    })

    const history = await client
      .get(`${BASE_PATH}/termination_agreement/versions`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    history.assertStatus(422)
    assert.strictEqual((history.body() as ErrorBody).code, 'OFFB.TEMPLATE.TYPE_INVALID')
  })

  test('CA-7: una versión de otra empresa o inexistente responde el MISMO 404 uniforme', async ({
    client,
    assert,
  }) => {
    const foreignUpload = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(otherUploader)
      .header('X-Business-Unit-Id', otherBusinessUnit.businessUnitPublicId)
      .file('file', pdfV1, { filename: 'ajena.pdf', contentType: 'application/pdf' })
    foreignUpload.assertStatus(201)
    const foreignId = (foreignUpload.body() as StoreBody).data.employeeOffboardingDocumentTemplate
      .employeeOffboardingDocumentTemplateId

    const foreign = await client
      .get(`${BASE_PATH}/${DOCUMENT_TYPE}/versions/${foreignId}/download-url`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    foreign.assertStatus(404)

    const missing = await client
      .get(`${BASE_PATH}/${DOCUMENT_TYPE}/versions/999999999/download-url`)
      .loginAs(uploader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    missing.assertStatus(404)

    const foreignBody = foreign.body() as ErrorBody
    assert.strictEqual(foreignBody.key, 'plantilla-no-encontrada')
    assert.strictEqual(foreignBody.code, 'OFFB.TEMPLATE.NOT_FOUND')
    assert.deepEqual(missing.body(), foreignBody)
  })

  test('CA-8: la descarga es un enlace temporal de 300 s que no cambia el estado de la versión', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(
        `${BASE_PATH}/${DOCUMENT_TYPE}/versions/${versionOne.employeeOffboardingDocumentTemplateId}/download-url`
      )
      .loginAs(readOnly)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    response.assertStatus(200)
    const download = (response.body() as DownloadBody).data
      .employeeOffboardingDocumentTemplateDownload
    assert.sameMembers(Object.keys(download), ['downloadUrl', 'expiresInSeconds'])
    assert.strictEqual(download.expiresInSeconds, SIGNED_URL_EXPIRES_SECONDS)
    assert.match(download.downloadUrl, /^https?:\/\//)
    assert.include(download.downloadUrl, `X-Amz-Expires=${SIGNED_URL_EXPIRES_SECONDS}`)

    // Descargar una reemplazada no la vuelve vigente
    const row = await findTemplateRow(versionOne.employeeOffboardingDocumentTemplateId)
    assert.strictEqual(
      row!.employee_offboarding_document_template_status,
      DOCUMENT_TEMPLATE_STATUS.SUPERSEDED
    )
  })

  test('CA-10: sin create no se sube (403 antes de leer el archivo); con read se consulta y descarga', async ({
    client,
    assert,
  }) => {
    const totalBefore = await countTemplates(businessUnit.businessUnitId)
    const forbidden = await client
      .post(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(readOnly)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      .file('file', pdfV1, { filename: 'sin-permiso.pdf', contentType: 'application/pdf' })
    forbidden.assertStatus(403)
    const body = forbidden.body() as ErrorBody
    assert.strictEqual(body.key, 'sin-permiso')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.FORBIDDEN')
    assert.strictEqual(await countTemplates(businessUnit.businessUnitId), totalBefore)

    const catalog = await client
      .get(BASE_PATH)
      .loginAs(readOnly)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    catalog.assertStatus(200)
    const history = await client
      .get(`${BASE_PATH}/${DOCUMENT_TYPE}/versions`)
      .qs({ page: 1, limit: 10 })
      .loginAs(readOnly)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    history.assertStatus(200)
    assert.strictEqual(
      (history.body() as VersionsBody).data.employeeOffboardingDocumentTemplateVersions.meta.total,
      3
    )
  })
})

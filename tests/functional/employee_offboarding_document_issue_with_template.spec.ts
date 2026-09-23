import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import Person from '#models/person'
import Position from '#models/position'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import UploadService from '#services/upload_service'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import { DOCUMENT_TEMPLATE_STATUS } from '#modules/employee-offboarding/document-templates/document_templates.constants'
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import {
  ALL_CATALOG_FIELD_NAMES,
  buildTextFieldsTemplate,
  MISSING_HIRE_DATE_FIELD_NAMES,
} from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550389 — emisión con la plantilla propia de la empresa: el
 * documento sale sobre ella aplanado y amarrado a la versión (CA-1), sin
 * plantilla nada cambia (CA-2), cambiar la plantilla no toca lo emitido
 * (CA-3), la re-emisión usa la vigente de hoy (CA-4), la vigente no
 * recuperable es error explícito sin caída (CA-5), el dato no imprimible
 * es 422 nombrando el dato (CA-6), cada empresa con la suya (CA-7), emitir
 * o fallar no toca nada más (CA-8) y la guarda defensiva del hueco
 * obligatorio que no admite texto.
 *
 * Corre sobre la base y el bucket de DESARROLLO: sube plantillas por el
 * endpoint real y lee los objetos emitidos con `readStoredFileBuffer`; los
 * objetos quedan huérfanos, como en las demás suites de subida.
 */

const TEST_PASSWORD = 'IssueWithTemplate123!'
const OFFBOARDINGS_PATH = '/api/employee-offboardings'
const TEMPLATES_PATH = '/api/employee-offboarding-document-templates'
const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const DOCUMENTS_TABLE = 'employee_offboarding_documents'
const ISSUE_ERROR_TITLE = 'No fue posible emitir la constancia de separación'
const FIXTURE_SLUG_PREFIX = 'emision-plantilla-'
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Campos de la plantilla v1 de la empresa (CA-1): los seis obligatorios más la antigüedad. */
const TEMPLATE_V1_FIELDS = [
  'legal_name',
  'employee_name',
  'position_name',
  'hire_date',
  'separation_date',
  'seniority',
  'folio',
] as const

/** Lo que devolvía el DTO antes de esta historia, más los dos campos nuevos. */
const EXPECTED_DTO_KEYS = [
  'employeeOffboardingDocumentId',
  'employeeOffboardingId',
  'documentType',
  'folio',
  'fileName',
  'employeeName',
  'positionName',
  'departmentName',
  'legalName',
  'hireDate',
  'referenceDate',
  'referenceDateSource',
  'seniorityDays',
  'contentHash',
  'sizeBytes',
  'isCurrent',
  'issuedAt',
  'issuedByUserId',
  'issuedByUserName',
  'supersededDocumentId',
  'templateVersionId',
  'templateVersionNumber',
]

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

/**
 * Textos dibujados (`Tj`) en los streams del PDF: infla los FlateDecode y
 * decodifica las cadenas hex WinAnsi que escribe pdf-lib al fijar campos.
 */
async function extractPdfTexts(buffer: Buffer): Promise<string[]> {
  const document = await PDFDocument.load(new Uint8Array(buffer), { updateMetadata: false })
  const texts: string[] = []
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    let bytes = Buffer.from(object.contents)
    const filter = object.dict.get(PDFName.of('Filter'))
    if (filter !== undefined && String(filter) === '/FlateDecode') {
      try {
        bytes = inflateSync(bytes)
      } catch {
        continue
      }
    }
    const content = bytes.toString('latin1')
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      texts.push(Buffer.from(match[1], 'hex').toString('latin1'))
    }
  }
  return texts
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Emisión plantilla ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Emisión Plantilla ${prefix} SA de CV ${stamp}`,
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

async function createRole(prefix: string, businessUnit: BusinessUnit): Promise<Role> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Emisión plantilla ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec de emisión con plantilla propia',
    roleActive: 1,
    businessUnitId: businessUnit.businessUnitId,
    roleManagementDays: 10,
  })
  created.roleIds.push(role.roleId)
  for (const permission of await findPermissions(['read', 'create'])) {
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
    personFirstname: 'Emisor',
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

async function createPosition(businessUnit: BusinessUnit, name: string): Promise<Position> {
  const stamp = uniqueStamp()
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `EPL-${stamp}`.slice(0, 50)
  position.positionName = name
  position.positionActive = 1
  position.businessUnitId = businessUnit.businessUnitId
  await position.save()
  return position
}

interface EmployeeSeed {
  firstName: string
  lastName: string
  hireDate: string
  terminatedDate: string
}

/** Colaborador con la baja EJECUTADA (borrado lógico), como exige la emisión. */
async function createTerminatedEmployee(
  businessUnit: BusinessUnit,
  position: Position,
  seed: EmployeeSeed
): Promise<Employee> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: seed.firstName,
    personLastname: seed.lastName,
    personSecondLastname: 'Prueba',
    personEmail: `colaborador-${stamp}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EP-${stamp}`
  employee.employeeFirstName = seed.firstName
  employee.employeeLastName = seed.lastName
  employee.employeeSecondLastName = 'Prueba'
  employee.employeePayrollNum = `EP-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.positionId = position.positionId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeHireDate = DateTime.fromISO(seed.hireDate)
  employee.employeeTerminatedDate = seed.terminatedDate
  await employee.save()
  await db
    .from(Employee.table)
    .where('employee_id', employee.employeeId)
    .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
  return employee
}

async function createOffboarding(
  businessUnit: BusinessUnit,
  employee: Employee,
  plannedDate: string
): Promise<EmployeeOffboarding> {
  return await EmployeeOffboarding.create({
    employeeId: employee.employeeId,
    businessUnitId: businessUnit.businessUnitId,
    employeeOffboardingPlannedDate: plannedDate,
    employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
    employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
    employeeOffboardingNotes: null,
    employeeOffboardingOpenedByUserId: null,
  })
}

/** Destruye en orden inverso de FK lo que cuelga de las empresas y roles dados. */
async function destroyFixtures(businessUnitIds: number[], roleIds: number[]): Promise<void> {
  if (businessUnitIds.length > 0) {
    const offboardings = await db
      .from(EmployeeOffboarding.table)
      .select('employee_offboarding_id')
      .whereIn('business_unit_id', businessUnitIds)
    const offboardingIds = offboardings.map((row) => Number(row.employee_offboarding_id))
    if (offboardingIds.length > 0) {
      await db.from(DOCUMENTS_TABLE).whereIn('employee_offboarding_id', offboardingIds).delete()
      await db
        .from(EmployeeOffboarding.table)
        .whereIn('employee_offboarding_id', offboardingIds)
        .delete()
    }
    await db.from(TEMPLATES_TABLE).whereIn('business_unit_id', businessUnitIds).delete()
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
    await db.from(Position.table).whereIn('business_unit_id', businessUnitIds).delete()
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

interface DocumentDto {
  employeeOffboardingDocumentId: number
  employeeOffboardingId: number
  folio: string
  fileName: string
  legalName: string
  employeeName: string
  positionName: string | null
  seniorityDays: number
  contentHash: string
  sizeBytes: number
  isCurrent: boolean
  supersededDocumentId: number | null
  templateVersionId: number | null
  templateVersionNumber: number | null
}

interface IssueBody {
  data: { employeeOffboardingDocument: DocumentDto }
}

interface ListBody {
  data: { employeeOffboardingDocuments: DocumentDto[] }
}

interface TemplateStoreBody {
  data: {
    employeeOffboardingDocumentTemplate: {
      employeeOffboardingDocumentTemplateId: number
      versionNumber: number
    }
  }
}

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

/** Fila cruda del documento, sin pasar por el modelo. */
interface DocumentRow {
  employee_offboarding_document_id: number
  employee_offboarding_document_file: string
  employee_offboarding_document_content_hash: string
  employee_offboarding_document_is_current: number
  employee_offboarding_document_template_version_id: number | null
}

async function documentRows(offboardingId: number): Promise<DocumentRow[]> {
  return (await db
    .from(DOCUMENTS_TABLE)
    .where('employee_offboarding_id', offboardingId)
    .orderBy('employee_offboarding_document_id', 'asc')) as DocumentRow[]
}

async function readStored(key: string): Promise<Buffer> {
  const buffer = await new UploadService().readStoredFileBuffer(key)
  if (!buffer) throw new Error(`No se pudo leer el objeto ${key}`)
  return buffer
}

test.group('Emisión con la plantilla propia de la empresa (USRH1789097550389)', (group) => {
  let unitWithTemplate: BusinessUnit
  let unitWithoutTemplate: BusinessUnit
  let unitWithBrokenTemplate: BusinessUnit
  let issuerA: User
  let issuerB: User
  let issuerC: User
  let offboardingA: EmployeeOffboarding
  let offboardingCyrillic: EmployeeOffboarding
  let offboardingB: EmployeeOffboarding
  let offboardingC: EmployeeOffboarding
  let templateV1Id: number
  let templateV2Id: number
  let firstDocument: DocumentDto
  let secondDocument: DocumentDto
  let templatesSnapshot: unknown[]
  let offboardingsSnapshot: unknown[]
  let employeesSnapshot: unknown[]

  const issue = (
    client: ApiClient,
    user: User,
    unit: BusinessUnit,
    offboarding: EmployeeOffboarding,
    locale = 'es'
  ) =>
    client
      .post(`${OFFBOARDINGS_PATH}/${offboarding.employeeOffboardingId}/documents`)
      .loginAs(user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .header('Accept-Language', locale)
      // Las respuestas 5xx son casos de prueba, no fallos del cliente
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({ documentType: DOCUMENT_TYPE })

  const listHistory = (
    client: ApiClient,
    user: User,
    unit: BusinessUnit,
    offboarding: EmployeeOffboarding
  ) =>
    client
      .get(`${OFFBOARDINGS_PATH}/${offboarding.employeeOffboardingId}/documents`)
      .qs({ includeSuperseded: true })
      .loginAs(user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)

  const uploadTemplate = async (client: ApiClient, buffer: Buffer, filename: string) => {
    const response = await client
      .post(`${TEMPLATES_PATH}/${DOCUMENT_TYPE}/versions`)
      .loginAs(issuerA)
      .header('X-Business-Unit-Id', unitWithTemplate.businessUnitPublicId)
      .file('file', buffer, { filename, contentType: 'application/pdf' })
    response.assertStatus(201)
    return (response.body() as TemplateStoreBody).data.employeeOffboardingDocumentTemplate
  }

  const snapshotTables = async () => {
    templatesSnapshot = await db
      .from(TEMPLATES_TABLE)
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_offboarding_document_template_id')
    offboardingsSnapshot = await db
      .from(EmployeeOffboarding.table)
      .select(
        'employee_offboarding_id',
        'employee_offboarding_status',
        'employee_offboarding_updated_at'
      )
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_offboarding_id')
    employeesSnapshot = await db
      .from(Employee.table)
      .select('employee_id', 'employee_deleted_at', 'employee_terminated_date')
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_id')
  }

  group.setup(async () => {
    await purgeStaleFixtures()
    unitWithTemplate = await createBusinessUnit('propia')
    unitWithoutTemplate = await createBusinessUnit('sistema')
    unitWithBrokenTemplate = await createBusinessUnit('defensiva')
    issuerA = await createUser(
      'emisor-a',
      await createRole('propia', unitWithTemplate),
      unitWithTemplate
    )
    issuerB = await createUser(
      'emisor-b',
      await createRole('sistema', unitWithoutTemplate),
      unitWithoutTemplate
    )
    issuerC = await createUser(
      'emisor-c',
      await createRole('defensiva', unitWithBrokenTemplate),
      unitWithBrokenTemplate
    )

    const positionA = await createPosition(unitWithTemplate, 'Analista de Nómina')
    const positionB = await createPosition(unitWithoutTemplate, 'Analista de Nómina')
    const positionC = await createPosition(unitWithBrokenTemplate, 'Auxiliar Contable')

    // 2019-04-15 → 2026-07-31 = 7 años y 3 meses · 2664 días (valores calculados del spec)
    const employeeA = await createTerminatedEmployee(unitWithTemplate, positionA, {
      firstName: 'Ana',
      lastName: 'Ramírez',
      hireDate: '2019-04-15',
      terminatedDate: '2026-07-31',
    })
    offboardingA = await createOffboarding(unitWithTemplate, employeeA, '2026-07-31')

    // Apellido fuera de Latin-1: no codificable con la tipografía estándar
    const employeeCyrillic = await createTerminatedEmployee(unitWithTemplate, positionA, {
      firstName: 'Olga',
      lastName: 'Иванова',
      hireDate: '2020-01-01',
      terminatedDate: '2026-05-31',
    })
    offboardingCyrillic = await createOffboarding(unitWithTemplate, employeeCyrillic, '2026-05-31')

    const employeeB = await createTerminatedEmployee(unitWithoutTemplate, positionB, {
      firstName: 'Bruno',
      lastName: 'Soto',
      hireDate: '2019-04-15',
      terminatedDate: '2026-07-31',
    })
    offboardingB = await createOffboarding(unitWithoutTemplate, employeeB, '2026-07-31')

    const employeeC = await createTerminatedEmployee(unitWithBrokenTemplate, positionC, {
      firstName: 'Carla',
      lastName: 'Núñez',
      hireDate: '2021-02-01',
      terminatedDate: '2026-06-30',
    })
    offboardingC = await createOffboarding(unitWithBrokenTemplate, employeeC, '2026-06-30')

    // Versión `current` que quedó antes de las guardas de la cadena: `hire_date`
    // como casilla. Entra por almacenamiento + fila, no por el endpoint (que la
    // rechazaría), para probar la guarda defensiva del llenado.
    const base = await PDFDocument.load(
      new Uint8Array(
        await buildTextFieldsTemplate(MISSING_HIRE_DATE_FIELD_NAMES, 'Plantilla defensiva')
      ),
      { updateMetadata: false }
    )
    base
      .getForm()
      .createCheckBox('hire_date')
      .addToPage(base.getPage(0), { x: 20, y: 20, width: 20, height: 20 })
    const brokenBuffer = Buffer.from(await base.save())
    const brokenKey = await new UploadService().uploadPrivateBuffer(
      `employee-offboarding-document-templates/${unitWithBrokenTemplate.businessUnitId}/defensiva-${uniqueStamp()}.pdf`,
      brokenBuffer,
      'application/pdf'
    )
    if (!brokenKey) throw new Error('No se pudo subir la plantilla defensiva')
    await db.table(TEMPLATES_TABLE).insert({
      business_unit_id: unitWithBrokenTemplate.businessUnitId,
      employee_offboarding_document_template_document_type: DOCUMENT_TYPE,
      employee_offboarding_document_template_version_number: 1,
      employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
      employee_offboarding_document_template_storage_key: brokenKey,
      employee_offboarding_document_template_original_file_name: 'defensiva.pdf',
      employee_offboarding_document_template_file_size_bytes: brokenBuffer.byteLength,
      employee_offboarding_document_template_content_sha256: sha256(brokenBuffer),
      employee_offboarding_document_template_validation_result: JSON.stringify({
        checkedAt: '2026-01-01T00:00:00.000Z',
        documentType: DOCUMENT_TYPE,
        passed: true,
        recognized: [...MISSING_HIRE_DATE_FIELD_NAMES],
        unrecognized: [],
        missingRequired: [],
        structural: { stage: 'structural', reason: null, detail: null },
      }),
      employee_offboarding_document_template_uploaded_by_user_id: null,
    })
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: con plantilla propia vigente el documento sale sobre ella, aplanado y amarrado a la versión', async ({
    client,
    assert,
  }) => {
    const version = await uploadTemplate(
      client,
      await buildTextFieldsTemplate(TEMPLATE_V1_FIELDS, 'Plantilla empresa v1'),
      'plantilla-v1.pdf'
    )
    templateV1Id = version.employeeOffboardingDocumentTemplateId
    assert.strictEqual(version.versionNumber, 1)

    const response = await issue(client, issuerA, unitWithTemplate, offboardingA)
    response.assertStatus(201)
    firstDocument = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.sameMembers(Object.keys(firstDocument), EXPECTED_DTO_KEYS)
    assert.strictEqual(firstDocument.folio, `CS-${offboardingA.employeeOffboardingId}-2026-0001`)
    assert.strictEqual(firstDocument.templateVersionId, templateV1Id)
    assert.strictEqual(firstDocument.templateVersionNumber, 1)
    assert.strictEqual(firstDocument.seniorityDays, 2664)
    assert.isTrue(firstDocument.isCurrent)
    assert.match(firstDocument.contentHash, /^[0-9a-f]{64}$/)

    // El archivo entregado es el de la empresa: sin campos, con los datos fijados
    const [row] = await documentRows(offboardingA.employeeOffboardingId)
    assert.strictEqual(row.employee_offboarding_document_template_version_id, templateV1Id)
    const stored = await readStored(row.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), firstDocument.contentHash)
    assert.strictEqual(stored.byteLength, firstDocument.sizeBytes)
    const flattened = await PDFDocument.load(new Uint8Array(stored), { updateMetadata: false })
    assert.strictEqual(flattened.getForm().getFields().length, 0)
    const texts = await extractPdfTexts(stored)
    assert.include(texts, 'Plantilla empresa v1')
    assert.include(texts, firstDocument.folio)
    assert.include(texts, '15/04/2019')
    assert.include(texts, '31/07/2026')
    assert.include(texts, '7 años y 3 meses')
    assert.include(texts, 'Ana Ramírez Prueba')
    assert.include(texts, 'Analista de Nómina')
    assert.include(texts, unitWithTemplate.businessUnitLegalName)
  })

  test('CA-2: sin plantilla propia el documento sale con la del sistema y sin versión anotada', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerB, unitWithoutTemplate, offboardingB)
    response.assertStatus(201)
    const dto = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.sameMembers(Object.keys(dto), EXPECTED_DTO_KEYS)
    assert.isNull(dto.templateVersionId)
    assert.isNull(dto.templateVersionNumber)
    assert.strictEqual(dto.seniorityDays, 2664)
    assert.strictEqual(
      dto.fileName,
      `constancia-separacion-cs-${offboardingB.employeeOffboardingId}-2026-0001.pdf`
    )

    const [row] = await documentRows(offboardingB.employeeOffboardingId)
    assert.isNull(row.employee_offboarding_document_template_version_id)
    const stored = await readStored(row.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), dto.contentHash)
    // Render de pdfkit de la plantilla del sistema: sin formulario y con su productor
    const rendered = await PDFDocument.load(new Uint8Array(stored), { updateMetadata: false })
    assert.strictEqual(rendered.getForm().getFields().length, 0)
    assert.strictEqual(rendered.getProducer(), 'PDFKit')
  })

  test('CA-3: subir otra versión no toca lo ya emitido', async ({ client, assert }) => {
    const version = await uploadTemplate(
      client,
      await buildTextFieldsTemplate(ALL_CATALOG_FIELD_NAMES, 'Plantilla empresa v2'),
      'plantilla-v2.pdf'
    )
    templateV2Id = version.employeeOffboardingDocumentTemplateId
    assert.strictEqual(version.versionNumber, 2)

    const history = await listHistory(client, issuerA, unitWithTemplate, offboardingA)
    history.assertStatus(200)
    const [listed] = (history.body() as ListBody).data.employeeOffboardingDocuments
    assert.strictEqual(
      listed.employeeOffboardingDocumentId,
      firstDocument.employeeOffboardingDocumentId
    )
    assert.strictEqual(listed.templateVersionId, templateV1Id)
    assert.strictEqual(listed.templateVersionNumber, 1)
    assert.strictEqual(listed.contentHash, firstDocument.contentHash)
    assert.strictEqual(listed.folio, firstDocument.folio)
    assert.strictEqual(listed.sizeBytes, firstDocument.sizeBytes)

    const [row] = await documentRows(offboardingA.employeeOffboardingId)
    const stored = await readStored(row.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), firstDocument.contentHash)
  })

  test('CA-4: la re-emisión usa la vigente de hoy y la anterior conserva su versión', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerA, unitWithTemplate, offboardingA)
    response.assertStatus(201)
    secondDocument = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(secondDocument.folio, `CS-${offboardingA.employeeOffboardingId}-2026-0002`)
    assert.strictEqual(secondDocument.templateVersionId, templateV2Id)
    assert.strictEqual(secondDocument.templateVersionNumber, 2)
    assert.strictEqual(
      secondDocument.supersededDocumentId,
      firstDocument.employeeOffboardingDocumentId
    )
    assert.isTrue(secondDocument.isCurrent)

    const history = await listHistory(client, issuerA, unitWithTemplate, offboardingA)
    const documents = (history.body() as ListBody).data.employeeOffboardingDocuments
    const previous = documents.find(
      (item) => item.employeeOffboardingDocumentId === firstDocument.employeeOffboardingDocumentId
    )
    assert.isFalse(previous?.isCurrent)
    assert.strictEqual(previous?.templateVersionId, templateV1Id)
    assert.strictEqual(previous?.contentHash, firstDocument.contentHash)

    const download = await client
      .get(
        `${OFFBOARDINGS_PATH}/${offboardingA.employeeOffboardingId}/documents/${firstDocument.employeeOffboardingDocumentId}/download-url`
      )
      .loginAs(issuerA)
      .header('X-Business-Unit-Id', unitWithTemplate.businessUnitPublicId)
    download.assertStatus(200)

    const rows = await documentRows(offboardingA.employeeOffboardingId)
    const texts = await extractPdfTexts(
      await readStored(rows[1].employee_offboarding_document_file)
    )
    assert.include(texts, 'Plantilla empresa v2')
    assert.include(texts, secondDocument.folio)

    // Foto de plantillas, expedientes y bajas ANTES de los casos de error (CA-8)
    await snapshotTables()
  })

  test('CA-5: plantilla vigente no recuperable → 500 explícito, sin fila y sin caer a la del sistema', async ({
    client,
    assert,
  }) => {
    const [templateRow] = await db
      .from(TEMPLATES_TABLE)
      .where('employee_offboarding_document_template_id', templateV2Id)
    const realKey = templateRow.employee_offboarding_document_template_storage_key as string
    await db
      .from(TEMPLATES_TABLE)
      .where('employee_offboarding_document_template_id', templateV2Id)
      .update({
        employee_offboarding_document_template_storage_key: `${realKey}.movido`,
      })
    const rowsBefore = await documentRows(offboardingA.employeeOffboardingId)

    try {
      const response = await issue(client, issuerA, unitWithTemplate, offboardingA)
      response.assertStatus(500)
      const body = response.body() as ErrorBody
      assert.strictEqual(body.title, ISSUE_ERROR_TITLE)
      assert.strictEqual(body.key, 'plantilla-vigente-no-recuperable')
      assert.strictEqual(body.code, 'OFFB.DOC.TEMPLATE_UNAVAILABLE')
      assert.isString(body.detail)
      assert.isNotEmpty(body.detail)

      const rowsAfter = await documentRows(offboardingA.employeeOffboardingId)
      assert.strictEqual(rowsAfter.length, rowsBefore.length)
      const current = rowsAfter.find((row) => row.employee_offboarding_document_is_current === 1)
      assert.strictEqual(
        current?.employee_offboarding_document_id,
        secondDocument.employeeOffboardingDocumentId
      )
    } finally {
      await db
        .from(TEMPLATES_TABLE)
        .where('employee_offboarding_document_template_id', templateV2Id)
        .update({ employee_offboarding_document_template_storage_key: realKey })
    }

    // Reintentar tras restaurar el objeto emite normalmente
    const retry = await issue(client, issuerA, unitWithTemplate, offboardingA)
    retry.assertStatus(201)
    const dto = (retry.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(dto.folio, `CS-${offboardingA.employeeOffboardingId}-2026-0003`)
    assert.strictEqual(dto.templateVersionId, templateV2Id)
  })

  test('CA-6: dato no imprimible con la tipografía estándar → 422 nombrando el dato, sin fila', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerA, unitWithTemplate, offboardingCyrillic)
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, ISSUE_ERROR_TITLE)
    assert.strictEqual(body.key, 'dato-no-imprimible-en-la-plantilla')
    assert.strictEqual(body.code, 'OFFB.DOC.TEMPLATE_TEXT_UNRENDERABLE')
    assert.include(body.detail, 'Nombre del colaborador')
    assert.notInclude(body.detail, 'Иванова')

    const english = await issue(client, issuerA, unitWithTemplate, offboardingCyrillic, 'en')
    english.assertStatus(422)
    assert.include((english.body() as ErrorBody).detail, 'Employee name')

    assert.lengthOf(await documentRows(offboardingCyrillic.employeeOffboardingId), 0)
  })

  test('CA-7: la plantilla de una empresa nunca alcanza al documento de otra', async ({
    client,
    assert,
  }) => {
    const rowsA = await documentRows(offboardingA.employeeOffboardingId)
    const rowsB = await documentRows(offboardingB.employeeOffboardingId)
    assert.isTrue(
      rowsA.every((row) => row.employee_offboarding_document_template_version_id !== null)
    )
    assert.isTrue(
      rowsB.every((row) => row.employee_offboarding_document_template_version_id === null)
    )

    // El expediente manda: con el encabezado de otra empresa es el 404 uniforme de siempre
    const foreign = await issue(client, issuerA, unitWithTemplate, offboardingB)
    foreign.assertStatus(404)
    assert.strictEqual((foreign.body() as ErrorBody).key, 'expediente-no-encontrado')
    assert.lengthOf(await documentRows(offboardingB.employeeOffboardingId), rowsB.length)
  })

  test('Guarda defensiva: hueco obligatorio que no admite texto → 500 nombrando el hueco, sin fila', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerC, unitWithBrokenTemplate, offboardingC)
    response.assertStatus(500)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, ISSUE_ERROR_TITLE)
    assert.strictEqual(body.key, 'documento-no-generado-con-plantilla')
    assert.strictEqual(body.code, 'OFFB.DOC.TEMPLATE_FILL_FAILED')
    assert.include(body.detail, 'Fecha de ingreso')
    assert.lengthOf(await documentRows(offboardingC.employeeOffboardingId), 0)
  })

  test('CA-8: emitir o fallar no toca plantillas, expedientes ni bajas', async ({ assert }) => {
    const templatesNow = await db
      .from(TEMPLATES_TABLE)
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_offboarding_document_template_id')
    const offboardingsNow = await db
      .from(EmployeeOffboarding.table)
      .select(
        'employee_offboarding_id',
        'employee_offboarding_status',
        'employee_offboarding_updated_at'
      )
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_offboarding_id')
    const employeesNow = await db
      .from(Employee.table)
      .select('employee_id', 'employee_deleted_at', 'employee_terminated_date')
      .whereIn('business_unit_id', created.businessUnitIds)
      .orderBy('employee_id')
    assert.deepEqual(templatesNow, templatesSnapshot)
    assert.deepEqual(offboardingsNow, offboardingsSnapshot)
    assert.deepEqual(employeesNow, employeesSnapshot)
  })
})

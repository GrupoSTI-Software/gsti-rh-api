import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
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
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import UploadService from '#services/upload_service'
import type TenantBillingProfileService from '#services/tenant_billing_profile_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import DocumentsService from '#modules/employee-offboarding/documents/documents.service'
import { buildLegalAddressLine } from '#modules/employee-offboarding/documents/termination_agreement_pdf.service'
import { DOCUMENT_TEMPLATE_STATUS } from '#modules/employee-offboarding/document-templates/document_templates.constants'
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { buildTextFieldsTemplate } from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550394 — convenio de terminación como segundo tipo de documento
 * del expediente: no regresión de la constancia (CA-6, escrito y verde ANTES
 * de tocar el folio), emisión ordinaria con folio `CT-` propio (CA-1), la
 * constancia no se entera (CA-2), domicilio faltante = 422 sin fila (CA-3),
 * datos fiscales no consultables = 500 explícito (CA-4), plantilla propia del
 * convenio (CA-5) y tipo desconocido / sin permiso (CA-7).
 *
 * Corre sobre la base y el bucket de DESARROLLO: lee los objetos emitidos con
 * `readStoredFileBuffer`; los objetos quedan huérfanos, como en las demás
 * suites de emisión.
 */

const TEST_PASSWORD = 'TerminationAgreement123!'
const OFFBOARDINGS_PATH = '/api/employee-offboardings'
const SEPARATION_LETTER = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const TERMINATION_AGREEMENT = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.TERMINATION_AGREEMENT
const DOCUMENTS_TABLE = 'employee_offboarding_documents'
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const PROFILES_TABLE = 'tenant_billing_profiles'
const FIXTURE_SLUG_PREFIX = 'convenio-terminacion-'
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Copy VIGENTE de la constancia (USRH1787433503686/-689): CA-6 lo conserva byte por byte. */
const LETTER_ISSUE_ERROR_TITLE = 'No fue posible emitir la constancia de separación'
const LETTER_ISSUED_MESSAGE = 'La constancia de separación fue emitida correctamente'
const LETTER_ACTIVE_DETAIL = 'La constancia se emite una vez ejecutada la baja del colaborador.'

/** Copy propio del convenio (Anexo A). */
const AGREEMENT_ISSUE_ERROR_TITLE = 'No fue posible emitir el convenio de terminación'
const AGREEMENT_ISSUED_MESSAGE = 'El convenio de terminación fue emitido correctamente'
const AGREEMENT_INCOMPLETE_DETAIL =
  'Faltan datos para emitir el convenio de terminación: Domicilio fiscal de la empresa (Datos de facturación: los captura el dueño de la cuenta) y Representante legal de la empresa (Datos de facturación: los captura el dueño de la cuenta).'

/** Campos de la plantilla propia del convenio (CA-5). */
const AGREEMENT_TEMPLATE_FIELDS = [
  'folio',
  'employee_name',
  'legal_name',
  'legal_address',
  'legal_representative_name',
] as const

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

/** Desplazamiento (milésimas de em) a partir del cual un ajuste de `TJ` separa palabras y no letras. */
const WORD_GAP_THRESHOLD = -100

/**
 * Textos dibujados en los streams del PDF: infla los FlateDecode y decodifica
 * las cadenas hex WinAnsi. pdf-lib escribe `<hex> Tj`; pdfkit escribe
 * `[<hex> ajuste <hex> …] TJ`, donde un ajuste grande y negativo es un espacio
 * entre palabras (justificado) y uno pequeño es interletrado. Los fragmentos
 * se unen con espacio: una frase partida entre dos líneas vuelve a leerse entera.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const document = await PDFDocument.load(new Uint8Array(buffer), { updateMetadata: false })
  const texts: string[] = []
  const decode = (hex: string) => Buffer.from(hex, 'hex').toString('latin1')
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
      texts.push(decode(match[1]))
    }
    for (const match of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let line = ''
      for (const token of match[1].matchAll(/<([0-9A-Fa-f]+)>|(-?\d+(?:\.\d+)?)/g)) {
        if (token[1] !== undefined) {
          line += decode(token[1])
        } else if (Number(token[2]) <= WORD_GAP_THRESHOLD) {
          line += ' '
        }
      }
      texts.push(line)
    }
  }
  return texts.join(' ').replace(/\s+/g, ' ')
}

/**
 * Versión `current` de plantilla del convenio con los campos dados, entrando
 * por almacenamiento + fila (el endpoint exige los obligatorios del tipo y CA-5
 * usa cinco). El dictamen declara como reconocidos exactamente esos campos.
 */
async function installAgreementTemplate(
  businessUnit: BusinessUnit,
  fieldNames: readonly string[],
  title: string
): Promise<number> {
  const buffer = await buildTextFieldsTemplate(fieldNames, title)
  const key = await new UploadService().uploadPrivateBuffer(
    `employee-offboarding-document-templates/${businessUnit.businessUnitId}/convenio-${uniqueStamp()}.pdf`,
    buffer,
    'application/pdf'
  )
  if (!key) throw new Error('No se pudo subir la plantilla de prueba')
  const [insertedId] = await db.table(TEMPLATES_TABLE).insert({
    business_unit_id: businessUnit.businessUnitId,
    employee_offboarding_document_template_document_type: TERMINATION_AGREEMENT,
    employee_offboarding_document_template_version_number: 1,
    employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
    employee_offboarding_document_template_storage_key: key,
    employee_offboarding_document_template_original_file_name: 'convenio.pdf',
    employee_offboarding_document_template_file_size_bytes: buffer.byteLength,
    employee_offboarding_document_template_content_sha256: sha256(buffer),
    employee_offboarding_document_template_validation_result: JSON.stringify({
      checkedAt: '2026-01-01T00:00:00.000Z',
      documentType: TERMINATION_AGREEMENT,
      passed: true,
      recognized: [...fieldNames],
      unrecognized: [],
      missingRequired: [],
      structural: { stage: 'fields', reason: null, detail: null },
    }),
    employee_offboarding_document_template_uploaded_by_user_id: null,
  })
  return Number(insertedId)
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Convenio ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Convenio ${prefix} SA de CV ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Permisos del módulo de salidas por slug; el gate es fail-closed si faltan. */
async function findPermissions(actions: readonly string[]): Promise<SystemPermission[]> {
  if (actions.length === 0) return []
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', EMPLOYEE_OFFBOARDINGS_MODULE_SLUG)
    .first()
  if (!systemModule) {
    throw new Error(
      `Se requiere el módulo "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD para este test.`
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
    roleName: `Convenio ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec del convenio de terminación',
    roleActive: 1,
    businessUnitId: businessUnit.businessUnitId,
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
    personFirstname: 'Emisor',
    personLastname: 'Convenio',
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
  position.positionCode = `CT-${stamp}`.slice(0, 50)
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
  employee.employeeCode = `CT-${stamp}`
  employee.employeeFirstName = seed.firstName
  employee.employeeLastName = seed.lastName
  employee.employeeSecondLastName = 'Prueba'
  employee.employeePayrollNum = `CT-${stamp}`
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

/** Domicilio fiscal y representante de la empresa (USRH1789097550393), tal como los captura el dueño. */
const FISCAL_ADDRESS = {
  street: 'Av. Paseo de la Reforma',
  exteriorNumber: '120',
  interiorNumber: '4B',
  neighborhood: 'Juárez',
  municipality: 'Cuauhtémoc',
  state: 'Ciudad de México',
  postalCode: '06600',
  legalRepresentativeName: 'María Pérez López',
  legalRepresentativeRole: 'Apoderada legal',
} as const

async function createBillingProfile(
  businessUnit: BusinessUnit,
  address: Partial<typeof FISCAL_ADDRESS>
): Promise<void> {
  await TenantBillingProfile.create({
    businessUnitId: businessUnit.businessUnitId,
    legalName: businessUnit.businessUnitLegalName,
    street: address.street ?? null,
    exteriorNumber: address.exteriorNumber ?? null,
    interiorNumber: address.interiorNumber ?? null,
    neighborhood: address.neighborhood ?? null,
    municipality: address.municipality ?? null,
    state: address.state ?? null,
    postalCode: address.postalCode ?? null,
    legalRepresentativeName: address.legalRepresentativeName ?? null,
    legalRepresentativeRole: address.legalRepresentativeRole ?? null,
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
    await db.from(PROFILES_TABLE).whereIn('business_unit_id', businessUnitIds).delete()
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
  documentType: string
  folio: string
  fileName: string
  referenceDate: string | null
  seniorityDays: number
  contentHash: string
  sizeBytes: number
  isCurrent: boolean
  supersededDocumentId: number | null
  templateVersionId: number | null
  totalAmount: string | null
}

interface IssueBody {
  message: string
  data: { employeeOffboardingDocument: DocumentDto }
}

interface ListBody {
  data: { employeeOffboardingDocuments: DocumentDto[] }
}

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

interface DocumentRow {
  employee_offboarding_document_id: number
  employee_offboarding_document_type: string
  employee_offboarding_document_folio: string
  employee_offboarding_document_file: string
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

test.group('Convenio de terminación (USRH1789097550394)', (group) => {
  let unitComplete: BusinessUnit
  let unitNoAddress: BusinessUnit
  let unitTemplate: BusinessUnit
  let issuer: User
  let reader: User
  let issuerNoAddress: User
  let issuerTemplate: User
  let offboardingComplete: EmployeeOffboarding
  let offboardingNoAddress: EmployeeOffboarding
  let offboardingTemplate: EmployeeOffboarding
  let agreementTemplateId: number
  let letterFirst: DocumentDto
  let agreementFirst: DocumentDto

  const issue = (
    client: ApiClient,
    user: User,
    unit: BusinessUnit,
    offboarding: EmployeeOffboarding,
    documentType: string,
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
      .json({ documentType })

  const listHistory = (
    client: ApiClient,
    user: User,
    unit: BusinessUnit,
    offboarding: EmployeeOffboarding,
    query: Record<string, unknown> = { includeSuperseded: true }
  ) =>
    client
      .get(`${OFFBOARDINGS_PATH}/${offboarding.employeeOffboardingId}/documents`)
      .qs(query)
      .loginAs(user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)

  group.setup(async () => {
    await purgeStaleFixtures()
    unitComplete = await createBusinessUnit('completa')
    unitNoAddress = await createBusinessUnit('sin-domicilio')
    unitTemplate = await createBusinessUnit('plantilla')
    issuer = await createUser(
      'emisor',
      await createRole('emisor', unitComplete, ['read', 'create']),
      unitComplete
    )
    reader = await createUser(
      'lector',
      await createRole('lector', unitComplete, ['read']),
      unitComplete
    )
    issuerNoAddress = await createUser(
      'emisor-sd',
      await createRole('sin-domicilio', unitNoAddress, ['read', 'create']),
      unitNoAddress
    )
    issuerTemplate = await createUser(
      'emisor-pl',
      await createRole('plantilla', unitTemplate, ['read', 'create']),
      unitTemplate
    )
    await createBillingProfile(unitComplete, FISCAL_ADDRESS)
    await createBillingProfile(unitTemplate, FISCAL_ADDRESS)
    // La empresa sin domicilio no tiene perfil fiscal: razón social de business_units y el resto en null
    agreementTemplateId = await installAgreementTemplate(
      unitTemplate,
      AGREEMENT_TEMPLATE_FIELDS,
      'Plantilla convenio empresa'
    )

    // 2021-03-03 → 2026-09-15 = 5 años y 6 meses · 2022 días (valores calculados del spec)
    const seed = {
      firstName: 'Ana',
      lastName: 'Ramírez',
      hireDate: '2021-03-03',
      terminatedDate: '2026-09-15',
    }
    offboardingComplete = await createOffboarding(
      unitComplete,
      await createTerminatedEmployee(
        unitComplete,
        await createPosition(unitComplete, 'Analista de Nómina'),
        seed
      ),
      '2026-09-15'
    )
    offboardingNoAddress = await createOffboarding(
      unitNoAddress,
      await createTerminatedEmployee(
        unitNoAddress,
        await createPosition(unitNoAddress, 'Analista de Nómina'),
        seed
      ),
      '2026-09-15'
    )
    offboardingTemplate = await createOffboarding(
      unitTemplate,
      await createTerminatedEmployee(
        unitTemplate,
        await createPosition(unitTemplate, 'Analista de Nómina'),
        seed
      ),
      '2026-09-15'
    )
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-6: la constancia sale byte a byte como antes de esta rebanada (folio, nombre, copy y contenido)', async ({
    client,
    assert,
  }) => {
    const id = offboardingComplete.employeeOffboardingId
    const response = await issue(
      client,
      issuer,
      unitComplete,
      offboardingComplete,
      SEPARATION_LETTER
    )
    response.assertStatus(201)
    const body = response.body() as IssueBody
    assert.strictEqual(body.message, LETTER_ISSUED_MESSAGE)
    letterFirst = body.data.employeeOffboardingDocument
    assert.strictEqual(letterFirst.documentType, SEPARATION_LETTER)
    assert.strictEqual(letterFirst.folio, `CS-${id}-2026-0001`)
    assert.strictEqual(letterFirst.fileName, `constancia-separacion-cs-${id}-2026-0001.pdf`)
    assert.strictEqual(letterFirst.seniorityDays, 2022)
    assert.isNull(letterFirst.templateVersionId)

    const [row] = await documentRows(id)
    const stored = await readStored(row.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), letterFirst.contentHash)
    const text = await extractPdfText(stored)
    assert.include(text, 'CONSTANCIA DE SEPARACIÓN')
    assert.include(text, 'artículo 132, fracción VIII')
    assert.include(text, '5 años y 6 meses')
    assert.include(text, 'Ana Ramírez Prueba')
    assert.include(text, unitComplete.businessUnitLegalName)
    // Nada del convenio se cuela en la constancia: ni domicilio ni representante
    assert.notInclude(text, 'CONVENIO')
    assert.notInclude(text, FISCAL_ADDRESS.street)
    assert.notInclude(text, FISCAL_ADDRESS.legalRepresentativeName)

    // Segunda constancia: consecutivo `CS-` propio; los errores conservan su copy
    const second = await issue(client, issuer, unitComplete, offboardingComplete, SEPARATION_LETTER)
    second.assertStatus(201)
    assert.strictEqual(
      (second.body() as IssueBody).data.employeeOffboardingDocument.folio,
      `CS-${id}-2026-0002`
    )
    const history = await listHistory(client, issuer, unitComplete, offboardingComplete)
    history.assertStatus(200)
    const documents = (history.body() as ListBody).data.employeeOffboardingDocuments
    assert.lengthOf(documents, 2)
    assert.lengthOf(
      documents.filter((document) => document.isCurrent),
      1
    )
  })

  test('CA-6: el copy de los errores de la constancia es literalmente el de hoy', async ({
    client,
    assert,
  }) => {
    // Colaborador ACTIVO (sin baja ejecutada): el 422 conserva título y detalle
    const position = await createPosition(unitComplete, 'Auxiliar')
    const stamp = uniqueStamp()
    const person = await Person.create({
      personFirstname: 'Bruno',
      personLastname: 'Activo',
      personSecondLastname: 'Prueba',
      personEmail: `activo-${stamp}@gsti-tests.local`,
    })
    const employee = new Employee()
    employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
    employee.employeeCode = `CTA-${stamp}`
    employee.employeeFirstName = 'Bruno'
    employee.employeeLastName = 'Activo'
    employee.employeeSecondLastName = 'Prueba'
    employee.employeePayrollNum = `CTA-${stamp}`
    employee.companyId = 1
    employee.personId = person.personId
    employee.positionId = position.positionId
    employee.businessUnitId = unitComplete.businessUnitId
    employee.payrollBusinessUnitId = unitComplete.businessUnitId
    employee.employeeHireDate = DateTime.fromISO('2022-01-10')
    await employee.save()
    const offboardingActive = await createOffboarding(unitComplete, employee, '2026-09-30')

    const response = await issue(client, issuer, unitComplete, offboardingActive, SEPARATION_LETTER)
    response.assertStatus(422)
    assert.deepEqual(response.body(), {
      title: LETTER_ISSUE_ERROR_TITLE,
      detail: LETTER_ACTIVE_DETAIL,
      key: 'baja-no-ejecutada',
      code: 'OFFB.DOC.EMPLOYEE_STILL_ACTIVE',
    })
    assert.lengthOf(await documentRows(offboardingActive.employeeOffboardingId), 0)
  })
  test('CA-1: el convenio sale con folio CT- propio, las dos partes y la relación circunstanciada', async ({
    client,
    assert,
  }) => {
    const id = offboardingComplete.employeeOffboardingId
    const response = await issue(
      client,
      issuer,
      unitComplete,
      offboardingComplete,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    const body = response.body() as IssueBody
    assert.strictEqual(body.message, AGREEMENT_ISSUED_MESSAGE)
    agreementFirst = body.data.employeeOffboardingDocument
    assert.strictEqual(agreementFirst.documentType, TERMINATION_AGREEMENT)
    // Serie propia: las dos constancias de CA-6 no consumen consecutivo del convenio
    assert.strictEqual(agreementFirst.folio, `CT-${id}-2026-0001`)
    assert.strictEqual(agreementFirst.fileName, `convenio-terminacion-ct-${id}-2026-0001.pdf`)
    assert.isNull(agreementFirst.templateVersionId)
    assert.strictEqual(agreementFirst.referenceDate, '2026-09-15')
    assert.strictEqual(agreementFirst.seniorityDays, 2022)
    assert.match(agreementFirst.contentHash, /^[0-9a-f]{64}$/)
    assert.isAbove(agreementFirst.sizeBytes, 0)
    assert.isTrue(agreementFirst.isCurrent)
    assert.isNull(agreementFirst.supersededDocumentId)

    const rows = await documentRows(id)
    const row = rows.find(
      (item) => item.employee_offboarding_document_type === TERMINATION_AGREEMENT
    )
    assert.exists(row)
    const stored = await readStored(row!.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), agreementFirst.contentHash)
    assert.strictEqual(stored.byteLength, agreementFirst.sizeBytes)
    const rendered = await PDFDocument.load(new Uint8Array(stored), { updateMetadata: false })
    assert.strictEqual(rendered.getForm().getFields().length, 0)
    assert.strictEqual(rendered.getProducer(), 'PDFKit')

    const text = await extractPdfText(stored)
    assert.include(text, 'CONVENIO DE TERMINACIÓN DE LA RELACIÓN DE TRABAJO')
    assert.include(text, agreementFirst.folio)
    // Las dos partes: razón social, domicilio y representante con su cargo; la persona con puesto y adscripción
    assert.include(text, unitComplete.businessUnitLegalName)
    assert.include(text, buildLegalAddressLine(FISCAL_ADDRESS))
    assert.include(
      text,
      'Av. Paseo de la Reforma 120, Int. 4B, Juárez, Cuauhtémoc, Ciudad de México, C.P. 06600'
    )
    assert.include(text, 'María Pérez López, en su carácter de Apoderada legal')
    assert.include(text, 'Ana Ramírez Prueba')
    assert.include(text, 'Analista de Nómina')
    // Relación circunstanciada: ingreso, separación y antigüedad
    assert.include(text, '03/03/2021')
    assert.include(text, '15/09/2026')
    assert.include(text, '5 años y 6 meses')
    // Regla 4: la validez la da la ratificación fuera del sistema; nada dice que ya esté ratificado
    assert.include(text, 'artículo 33 de la Ley Federal del Trabajo')
    assert.include(text, 'Centro de Conciliación o el Tribunal laboral')
    assert.notInclude(text.toLowerCase(), 'ya ratificado')
    assert.notInclude(text.toLowerCase(), 'queda ratificado')
    // Regla 5: sin RFC del patrón ni datos sensibles del colaborador
    assert.notInclude(text, 'RFC')
    // USRH1789097550395: el convenio imprime la suma de los importes capturados; sin pendientes sale en cero
    assert.include(text, '$0.00')
    assert.include(text, '(CERO PESOS 00/100 M.N.)')
    assert.strictEqual(agreementFirst.totalAmount, '0.00')
  })

  test('CA-2: la constancia no se entera — su consecutivo y su vigencia siguen intactos', async ({
    client,
    assert,
  }) => {
    const id = offboardingComplete.employeeOffboardingId
    const letter = await issue(client, issuer, unitComplete, offboardingComplete, SEPARATION_LETTER)
    letter.assertStatus(201)
    const dto = (letter.body() as IssueBody).data.employeeOffboardingDocument
    // El convenio no movió el consecutivo CS-: la tercera constancia es la 0003
    assert.strictEqual(dto.folio, `CS-${id}-2026-0003`)

    const history = await listHistory(client, issuer, unitComplete, offboardingComplete)
    history.assertStatus(200)
    const documents = (history.body() as ListBody).data.employeeOffboardingDocuments
    const letters = documents.filter((document) => document.documentType === SEPARATION_LETTER)
    const agreements = documents.filter(
      (document) => document.documentType === TERMINATION_AGREEMENT
    )
    assert.lengthOf(letters, 3)
    assert.lengthOf(agreements, 1)
    // Exactamente una vigente por tipo; el convenio no reemplazó ninguna constancia
    assert.lengthOf(
      letters.filter((document) => document.isCurrent),
      1
    )
    assert.lengthOf(
      agreements.filter((document) => document.isCurrent),
      1
    )
    assert.strictEqual(
      agreements[0].employeeOffboardingDocumentId,
      agreementFirst.employeeOffboardingDocumentId
    )
    assert.isNull(agreements[0].supersededDocumentId)
    const previousLetter = letters.find(
      (document) =>
        document.employeeOffboardingDocumentId === letterFirst.employeeOffboardingDocumentId
    )
    assert.strictEqual(previousLetter?.contentHash, letterFirst.contentHash)

    // Acotado por tipo
    const onlyAgreements = await listHistory(client, issuer, unitComplete, offboardingComplete, {
      includeSuperseded: true,
      documentType: TERMINATION_AGREEMENT,
    })
    onlyAgreements.assertStatus(200)
    const listed = (onlyAgreements.body() as ListBody).data.employeeOffboardingDocuments
    assert.lengthOf(listed, 1)
    assert.strictEqual(listed[0].documentType, TERMINATION_AGREEMENT)

    // Descarga por el mismo enlace temporal que la constancia
    const download = await client
      .get(
        `${OFFBOARDINGS_PATH}/${id}/documents/${agreementFirst.employeeOffboardingDocumentId}/download-url`
      )
      .loginAs(issuer)
      .header('X-Business-Unit-Id', unitComplete.businessUnitPublicId)
    download.assertStatus(200)
    assert.strictEqual(
      download.body().data.employeeOffboardingDocumentDownload.expiresInSeconds,
      300
    )
  })

  test('CA-3: sin domicilio ni representante capturados no se emite nada y el aviso dice quién los captura', async ({
    client,
    assert,
  }) => {
    const response = await issue(
      client,
      issuerNoAddress,
      unitNoAddress,
      offboardingNoAddress,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(422)
    assert.deepEqual(response.body(), {
      title: AGREEMENT_ISSUE_ERROR_TITLE,
      detail: AGREEMENT_INCOMPLETE_DETAIL,
      // Candado R-6: el key es el que el backoffice reconoce como aviso persistente
      key: 'constancia-incompleta',
      code: 'OFFB.DOC.INCOMPLETE',
    })
    assert.lengthOf(await documentRows(offboardingNoAddress.employeeOffboardingId), 0)

    const english = await issue(
      client,
      issuerNoAddress,
      unitNoAddress,
      offboardingNoAddress,
      TERMINATION_AGREEMENT,
      'en'
    )
    english.assertStatus(422)
    const body = english.body() as ErrorBody
    assert.strictEqual(body.title, 'The termination agreement could not be issued')
    assert.include(body.detail, 'Company tax address (Billing data: captured by the account owner)')
    assert.include(
      body.detail,
      'Company legal representative (Billing data: captured by the account owner)'
    )

    // La constancia de esa misma empresa se emite: el domicilio no es dato suyo
    const letter = await issue(
      client,
      issuerNoAddress,
      unitNoAddress,
      offboardingNoAddress,
      SEPARATION_LETTER
    )
    letter.assertStatus(201)
  })

  test('CA-4: si los datos fiscales no se pueden consultar es un 500 propio, sin fila y sin disfrazarse de dato faltante', async ({
    assert,
  }) => {
    const failingBillingService = {
      getFiscalIdentityForDocuments: async () => {
        throw new Error('fallo simulado de base de datos')
      },
    } as unknown as TenantBillingProfileService
    const service = new DocumentsService(
      i18nManager.locale('es'),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      failingBillingService
    )
    const rowsBefore = await documentRows(offboardingComplete.employeeOffboardingId)

    let thrown: unknown = null
    try {
      await service.issue(
        offboardingComplete.employeeOffboardingId,
        TERMINATION_AGREEMENT,
        [unitComplete.businessUnitId],
        issuer.userId
      )
    } catch (error: unknown) {
      thrown = error
    }
    assert.instanceOf(thrown, EmployeeOffboardingServiceError)
    const error = thrown as EmployeeOffboardingServiceError
    assert.strictEqual(error.httpStatus, 500)
    assert.strictEqual(error.key, 'datos-fiscales-no-disponibles')
    assert.strictEqual(error.errorCode, 'OFFB.DOC.FISCAL_IDENTITY_UNAVAILABLE')
    assert.strictEqual(error.title, AGREEMENT_ISSUE_ERROR_TITLE)
    assert.strictEqual(
      error.message,
      'No fue posible consultar los datos fiscales de la empresa. Intenta de nuevo.'
    )
    assert.lengthOf(
      await documentRows(offboardingComplete.employeeOffboardingId),
      rowsBefore.length
    )

    // El mismo fallo no toca a la constancia: ella no consulta el perfil fiscal
    const letter = await service.issue(
      offboardingComplete.employeeOffboardingId,
      SEPARATION_LETTER,
      [unitComplete.businessUnitId],
      issuer.userId
    )
    assert.strictEqual(letter.documentType, SEPARATION_LETTER)
    assert.strictEqual(letter.folio, `CS-${offboardingComplete.employeeOffboardingId}-2026-0004`)
  })

  test('CA-5: con plantilla propia del convenio sale sobre ella; si no se recupera, 500 sin caída a la del sistema', async ({
    client,
    assert,
  }) => {
    const id = offboardingTemplate.employeeOffboardingId
    const response = await issue(
      client,
      issuerTemplate,
      unitTemplate,
      offboardingTemplate,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    const dto = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(dto.templateVersionId, agreementTemplateId)
    assert.strictEqual(dto.folio, `CT-${id}-2026-0001`)

    const [row] = await documentRows(id)
    const stored = await readStored(row.employee_offboarding_document_file)
    const flattened = await PDFDocument.load(new Uint8Array(stored), { updateMetadata: false })
    assert.strictEqual(flattened.getForm().getFields().length, 0)
    const text = await extractPdfText(stored)
    assert.include(text, 'Plantilla convenio empresa')
    assert.include(text, dto.folio)
    assert.include(text, 'Ana Ramírez Prueba')
    assert.include(text, unitTemplate.businessUnitLegalName)
    assert.include(text, buildLegalAddressLine(FISCAL_ADDRESS))
    assert.include(text, FISCAL_ADDRESS.legalRepresentativeName)

    const [templateRow] = await db
      .from(TEMPLATES_TABLE)
      .where('employee_offboarding_document_template_id', agreementTemplateId)
    const realKey = templateRow.employee_offboarding_document_template_storage_key as string
    await db
      .from(TEMPLATES_TABLE)
      .where('employee_offboarding_document_template_id', agreementTemplateId)
      .update({ employee_offboarding_document_template_storage_key: `${realKey}.movido` })
    try {
      const broken = await issue(
        client,
        issuerTemplate,
        unitTemplate,
        offboardingTemplate,
        TERMINATION_AGREEMENT
      )
      broken.assertStatus(500)
      const body = broken.body() as ErrorBody
      assert.strictEqual(body.title, AGREEMENT_ISSUE_ERROR_TITLE)
      assert.strictEqual(body.key, 'plantilla-vigente-no-recuperable')
      assert.strictEqual(body.code, 'OFFB.DOC.TEMPLATE_UNAVAILABLE')
      assert.lengthOf(await documentRows(id), 1)
    } finally {
      await db
        .from(TEMPLATES_TABLE)
        .where('employee_offboarding_document_template_id', agreementTemplateId)
        .update({ employee_offboarding_document_template_storage_key: realKey })
    }
  })

  test('CA-7: tipo desconocido responde 400 y sin permiso create el 403 llega antes de validar, para los dos tipos', async ({
    client,
    assert,
  }) => {
    const unknown = await issue(client, issuer, unitComplete, offboardingComplete, 'convenio')
    unknown.assertStatus(400)
    const unknownBody = unknown.body() as ErrorBody
    assert.strictEqual(unknownBody.key, 'datos-invalidos')
    assert.strictEqual(unknownBody.code, 'OFFB.DOC.VAL_INPUT')

    for (const documentType of [SEPARATION_LETTER, TERMINATION_AGREEMENT, 'convenio']) {
      const forbidden = await issue(client, reader, unitComplete, offboardingComplete, documentType)
      forbidden.assertStatus(403)
      const body = forbidden.body() as ErrorBody
      assert.strictEqual(body.key, 'sin-permiso')
      assert.strictEqual(body.code, 'OFFB.DOC.FORBIDDEN')
    }

    // Con permiso read el historial mezcla los dos tipos con exactamente una vigente por tipo
    const history = await listHistory(client, reader, unitComplete, offboardingComplete)
    history.assertStatus(200)
    const documents = (history.body() as ListBody).data.employeeOffboardingDocuments
    assert.sameMembers(
      [...new Set(documents.map((document) => document.documentType))],
      [SEPARATION_LETTER, TERMINATION_AGREEMENT]
    )
  })
})

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
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import UploadService from '#services/upload_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import DocumentsService from '#modules/employee-offboarding/documents/documents.service'
import DocumentsRepositoryMysql from '#modules/employee-offboarding/documents/documents.repository.mysql'
import { fieldsForDocumentType } from '#modules/employee-offboarding/documents/document_fields.constants'
import { AMOUNTS_DISCLAIMER } from '#modules/employee-offboarding/documents/termination_agreement_pdf.service'
import { EMPLOYEE_OFFBOARDING_ITEM_STATUS } from '#modules/employee-offboarding/offboardings/offboardings.constants'
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { buildTextFieldsTemplate } from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550395 — la suma de los importes capturados en el convenio, en
 * número y en letra: convenio con importes (CA-1), suma cero que se emite
 * (CA-2), los no cumplidos cuentan y los eliminados no (CA-3), el papel
 * entregado no cambia y la re-emisión sale con la cifra nueva (CA-4), la
 * constancia no cambia ni consulta la suma (CA-5), la guarda corre antes que
 * la suma (CA-6) y los marcadores en la plantilla propia, con la leyenda como
 * hueco obligatorio (CA-7, CA-7b). CA-8 vive en el spec unitario del helper.
 *
 * Corre sobre la base y el bucket de DESARROLLO: lee los objetos emitidos con
 * `readStoredFileBuffer`; los objetos quedan huérfanos, como en las demás
 * suites de emisión.
 */

const TEST_PASSWORD = 'AgreementAmounts123!'
const OFFBOARDINGS_PATH = '/api/employee-offboardings'
const SEPARATION_LETTER = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const TERMINATION_AGREEMENT = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.TERMINATION_AGREEMENT
const DOCUMENTS_TABLE = 'employee_offboarding_documents'
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const PROFILES_TABLE = 'tenant_billing_profiles'
const FIXTURE_SLUG_PREFIX = 'convenio-importes-'
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Copy propio del convenio (USRH1789097550394); esta historia no lo cambia. */
const AGREEMENT_ISSUE_ERROR_TITLE = 'No fue posible emitir el convenio de terminación'
const TEMPLATES_PATH = '/api/employee-offboarding-document-templates'

/** Los huecos del convenio, tal como los declara el catálogo (los once obligatorios incluidos). */
const AGREEMENT_TEMPLATE_FIELDS = fieldsForDocumentType(TERMINATION_AGREEMENT).map(
  (field) => field.key
)

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

/** Pendiente del expediente con importe capturado (o sin él), cumplido o no, vivo o eliminado. */
interface ItemSeed {
  amount: string | null
  status: (typeof EMPLOYEE_OFFBOARDING_ITEM_STATUS)[keyof typeof EMPLOYEE_OFFBOARDING_ITEM_STATUS]
  deleted?: boolean
}

async function createItems(
  offboarding: EmployeeOffboarding,
  seeds: readonly ItemSeed[]
): Promise<EmployeeOffboardingItem[]> {
  const items: EmployeeOffboardingItem[] = []
  for (const [index, seed] of seeds.entries()) {
    const item = await EmployeeOffboardingItem.create({
      employeeOffboardingId: offboarding.employeeOffboardingId,
      offboardingConceptId: null,
      employeeSupplyId: null,
      employeeOffboardingItemName: `Pendiente ${index + 1}`,
      employeeOffboardingItemStatus: seed.status,
      employeeOffboardingItemAmount: seed.amount,
      employeeOffboardingItemNote: null,
      employeeOffboardingItemCompletedAt:
        seed.status === EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED ? DateTime.utc() : null,
      employeeOffboardingItemCompletedByUserId: null,
    })
    if (seed.deleted) {
      await db
        .from(EmployeeOffboardingItem.table)
        .where('employee_offboarding_item_id', item.employeeOffboardingItemId)
        .update({
          employee_offboarding_item_deleted_at: DateTime.utc().toSQL({ includeOffset: false }),
        })
    }
    items.push(item)
  }
  return items
}

/** Foto de los importes y estados de los pendientes del expediente (regla 11). */
async function itemsSnapshot(offboarding: EmployeeOffboarding): Promise<unknown[]> {
  return await db
    .from(EmployeeOffboardingItem.table)
    .select(
      'employee_offboarding_item_id',
      'employee_offboarding_item_amount',
      'employee_offboarding_item_status',
      'employee_offboarding_item_deleted_at'
    )
    .where('employee_offboarding_id', offboarding.employeeOffboardingId)
    .orderBy('employee_offboarding_item_id')
}

/** Cadena decimal del importe tal como la devuelve MySQL para `decimal(14,2)`. */
const AMOUNT_43250_80 = '43250.80'
const WORDS_43250_80 = '(CUARENTA Y TRES MIL DOSCIENTOS CINCUENTA PESOS 80/100 M.N.)'

test.group('Suma de importes en el convenio (USRH1789097550395)', (group) => {
  let unitAmounts: BusinessUnit
  let unitNoAddress: BusinessUnit
  let unitTemplate: BusinessUnit
  let issuer: User
  let issuerNoAddress: User
  let issuerTemplate: User
  let offboardingAmounts: EmployeeOffboarding
  let offboardingZero: EmployeeOffboarding
  let offboardingMixed: EmployeeOffboarding
  let offboardingNoAddress: EmployeeOffboarding
  let offboardingTemplate: EmployeeOffboarding
  let mixedCompletedItem: EmployeeOffboardingItem
  let largestAmountItem: EmployeeOffboardingItem
  let agreementFirst: DocumentDto
  let mixedFirstFolio: string

  const issue = (
    client: ApiClient,
    user: User,
    unit: BusinessUnit,
    offboarding: EmployeeOffboarding,
    documentType: string
  ) =>
    client
      .post(`${OFFBOARDINGS_PATH}/${offboarding.employeeOffboardingId}/documents`)
      .loginAs(user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .header('Accept-Language', 'es')
      // Las respuestas 5xx son casos de prueba, no fallos del cliente
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({ documentType })

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

  const uploadAgreementTemplate = (client: ApiClient, buffer: Buffer, filename: string) =>
    client
      .post(`${TEMPLATES_PATH}/${TERMINATION_AGREEMENT}/versions`)
      .loginAs(issuerTemplate)
      .header('X-Business-Unit-Id', unitTemplate.businessUnitPublicId)
      .file('file', buffer, { filename, contentType: 'application/pdf' })

  /** Servicio con el repositorio real envuelto para contar las lecturas de la suma (CA-5, CA-6). */
  const serviceWithSumSpy = () => {
    const repository = new DocumentsRepositoryMysql()
    const calls = { sum: 0 }
    const spied = new Proxy(repository, {
      get(target, property, receiver) {
        if (property === 'sumItemAmounts') {
          return async (offboardingId: number) => {
            calls.sum += 1
            return await target.sumItemAmounts(offboardingId)
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    return { service: new DocumentsService(i18nManager.locale('es'), spied), calls }
  }

  group.setup(async () => {
    await purgeStaleFixtures()
    unitAmounts = await createBusinessUnit('importes')
    unitNoAddress = await createBusinessUnit('sin-domicilio')
    unitTemplate = await createBusinessUnit('plantilla')
    issuer = await createUser(
      'emisor',
      await createRole('emisor', unitAmounts, ['read', 'create']),
      unitAmounts
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
    await createBillingProfile(unitAmounts, FISCAL_ADDRESS)
    await createBillingProfile(unitTemplate, FISCAL_ADDRESS)
    // La empresa sin domicilio no tiene perfil fiscal: la guarda bloquea antes de la suma

    const seed = {
      firstName: 'Ana',
      lastName: 'Ramírez',
      hireDate: '2021-03-03',
      terminatedDate: '2026-09-15',
    }
    const newCase = async (unit: BusinessUnit) =>
      createOffboarding(
        unit,
        await createTerminatedEmployee(
          unit,
          await createPosition(unit, 'Analista de Nómina'),
          seed
        ),
        '2026-09-15'
      )

    // CA-1/CA-4: 38 000.00 + 4 250.80 + 1 000.00 = 43 250.80
    offboardingAmounts = await newCase(unitAmounts)
    const amountItems = await createItems(offboardingAmounts, [
      { amount: '38000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
      { amount: '4250.80', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
      { amount: '1000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING },
    ])
    largestAmountItem = amountItems[0]

    // CA-2: pendientes sin importe capturado
    offboardingZero = await newCase(unitAmounts)
    await createItems(offboardingZero, [
      { amount: null, status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING },
      { amount: null, status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
    ])

    // CA-3: 1 200.00 cumplido + 800.00 pendiente; 5 000.00 eliminado no cuenta
    offboardingMixed = await newCase(unitAmounts)
    const mixedItems = await createItems(offboardingMixed, [
      { amount: '1200.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
      { amount: '800.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING },
      { amount: '5000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING, deleted: true },
    ])
    mixedCompletedItem = mixedItems[0]

    // CA-6: con importes pero sin domicilio fiscal
    offboardingNoAddress = await newCase(unitNoAddress)
    await createItems(offboardingNoAddress, [
      { amount: '38000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
    ])

    // CA-7: plantilla propia con los tres marcadores
    offboardingTemplate = await newCase(unitTemplate)
    await createItems(offboardingTemplate, [
      { amount: '38000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
      { amount: '4250.80', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED },
      { amount: '1000.00', status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING },
    ])
  })

  group.teardown(async () => {
    const offboardingRows = await db
      .from(EmployeeOffboarding.table)
      .select('employee_offboarding_id')
      .whereIn('business_unit_id', created.businessUnitIds)
    const offboardingIds = offboardingRows.map((row) => Number(row.employee_offboarding_id))
    if (offboardingIds.length > 0) {
      await db
        .from(EmployeeOffboardingItem.table)
        .whereIn('employee_offboarding_id', offboardingIds)
        .delete()
    }
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: el convenio imprime la suma en número y en letra con la leyenda, y la guarda como cadena', async ({
    client,
    assert,
  }) => {
    const id = offboardingAmounts.employeeOffboardingId
    const response = await issue(
      client,
      issuer,
      unitAmounts,
      offboardingAmounts,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    agreementFirst = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(agreementFirst.folio, `CT-${id}-2026-0001`)
    assert.strictEqual(agreementFirst.totalAmount, AMOUNT_43250_80)
    assert.isString(agreementFirst.totalAmount)
    assert.notProperty(agreementFirst, 'totalAmountInWords')

    const [row] = await documentRows(id)
    const stored = await readStored(row.employee_offboarding_document_file)
    const text = await extractPdfText(stored)
    assert.include(text, '$43,250.80')
    assert.include(text, WORDS_43250_80)
    assert.include(text, AMOUNTS_DISCLAIMER)
    // Sin desglose por concepto ni datos prohibidos (regla 9)
    assert.notInclude(text, 'Pendiente 1')
    assert.notInclude(text, '$38,000.00')
    assert.notInclude(text, '$4,250.80')
    assert.notInclude(text, 'RFC')
    assert.notInclude(text.toLowerCase(), 'sueldo')
    assert.notInclude(text.toLowerCase(), 'percepci')
  })

  test('CA-2: la suma cero se emite con $0.00, su letra y la misma leyenda, sin error ni aviso', async ({
    client,
    assert,
  }) => {
    const response = await issue(
      client,
      issuer,
      unitAmounts,
      offboardingZero,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    const body = response.body() as IssueBody & Record<string, unknown>
    assert.strictEqual(body.data.employeeOffboardingDocument.totalAmount, '0.00')
    assert.notProperty(body, 'key')
    assert.notProperty(body, 'code')
    assert.notProperty(body, 'detail')

    const [row] = await documentRows(offboardingZero.employeeOffboardingId)
    const text = await extractPdfText(await readStored(row.employee_offboarding_document_file))
    assert.include(text, '$0.00')
    assert.include(text, '(CERO PESOS 00/100 M.N.)')
    assert.include(text, AMOUNTS_DISCLAIMER)
  })

  test('CA-3: los pendientes no cumplidos cuentan igual, los eliminados no, y revertir no cambia la suma', async ({
    client,
    assert,
  }) => {
    const first = await issue(client, issuer, unitAmounts, offboardingMixed, TERMINATION_AGREEMENT)
    first.assertStatus(201)
    const dto = (first.body() as IssueBody).data.employeeOffboardingDocument
    mixedFirstFolio = dto.folio
    assert.strictEqual(dto.totalAmount, '2000.00')
    const [row] = await documentRows(offboardingMixed.employeeOffboardingId)
    const text = await extractPdfText(await readStored(row.employee_offboarding_document_file))
    assert.include(text, '$2,000.00')
    assert.include(text, '(DOS MIL PESOS 00/100 M.N.)')

    // Revertir el cumplido conserva su importe (regla 4)
    await db
      .from(EmployeeOffboardingItem.table)
      .where('employee_offboarding_item_id', mixedCompletedItem.employeeOffboardingItemId)
      .update({
        employee_offboarding_item_status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING,
        employee_offboarding_item_completed_at: null,
      })
    const second = await issue(client, issuer, unitAmounts, offboardingMixed, TERMINATION_AGREEMENT)
    second.assertStatus(201)
    const reissued = (second.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(reissued.totalAmount, '2000.00')
    assert.notStrictEqual(reissued.folio, mixedFirstFolio)
  })

  test('CA-4: el papel entregado no cambia; la re-emisión sale con la cifra nueva y no toca los importes', async ({
    client,
    assert,
  }) => {
    const id = offboardingAmounts.employeeOffboardingId
    await db
      .from(EmployeeOffboardingItem.table)
      .where('employee_offboarding_item_id', largestAmountItem.employeeOffboardingItemId)
      .update({ employee_offboarding_item_amount: '2000.00' })
    const itemsBefore = await itemsSnapshot(offboardingAmounts)

    const history = await listHistory(client, issuer, unitAmounts, offboardingAmounts)
    history.assertStatus(200)
    const previous = (history.body() as ListBody).data.employeeOffboardingDocuments.find(
      (document) =>
        document.employeeOffboardingDocumentId === agreementFirst.employeeOffboardingDocumentId
    )
    assert.strictEqual(previous?.totalAmount, AMOUNT_43250_80)
    assert.strictEqual(previous?.contentHash, agreementFirst.contentHash)

    // 2 000.00 + 4 250.80 + 1 000.00 = 7 250.80
    const response = await issue(
      client,
      issuer,
      unitAmounts,
      offboardingAmounts,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    const reissued = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(reissued.folio, `CT-${id}-2026-0002`)
    assert.strictEqual(reissued.totalAmount, '7250.80')
    assert.strictEqual(reissued.supersededDocumentId, agreementFirst.employeeOffboardingDocumentId)

    const after = await listHistory(client, issuer, unitAmounts, offboardingAmounts)
    const documents = (after.body() as ListBody).data.employeeOffboardingDocuments
    const old = documents.find(
      (document) =>
        document.employeeOffboardingDocumentId === agreementFirst.employeeOffboardingDocumentId
    )
    assert.isFalse(old?.isCurrent)
    assert.strictEqual(old?.totalAmount, AMOUNT_43250_80)
    assert.strictEqual(old?.contentHash, agreementFirst.contentHash)
    const rows = await documentRows(id)
    const oldRow = rows.find(
      (row) => row.employee_offboarding_document_id === agreementFirst.employeeOffboardingDocumentId
    )
    const newRow = rows.find(
      (row) => row.employee_offboarding_document_id === reissued.employeeOffboardingDocumentId
    )
    const stored = await readStored(oldRow!.employee_offboarding_document_file)
    assert.strictEqual(sha256(stored), agreementFirst.contentHash)
    const text = await extractPdfText(await readStored(newRow!.employee_offboarding_document_file))
    assert.include(text, '$7,250.80')
    assert.include(text, '(SIETE MIL DOSCIENTOS CINCUENTA PESOS 80/100 M.N.)')
    assert.deepEqual(await itemsSnapshot(offboardingAmounts), itemsBefore)
  })

  test('CA-5: la constancia no cambia — totalAmount null, sin importe en el PDF y sin consultar la suma', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuer, unitAmounts, offboardingAmounts, SEPARATION_LETTER)
    response.assertStatus(201)
    const dto = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.isNull(dto.totalAmount)
    const rows = await documentRows(offboardingAmounts.employeeOffboardingId)
    const row = rows.find(
      (item) => item.employee_offboarding_document_id === dto.employeeOffboardingDocumentId
    )
    const text = await extractPdfText(await readStored(row!.employee_offboarding_document_file))
    assert.include(text, 'CONSTANCIA DE SEPARACIÓN')
    assert.notInclude(text, '$')
    assert.notInclude(text, 'M.N.')
    assert.notInclude(text, AMOUNTS_DISCLAIMER)

    // La consulta de suma no se ejecuta para la constancia y sí, una vez, para el convenio
    const letter = serviceWithSumSpy()
    await letter.service.issue(
      offboardingAmounts.employeeOffboardingId,
      SEPARATION_LETTER,
      [unitAmounts.businessUnitId],
      issuer.userId
    )
    assert.strictEqual(letter.calls.sum, 0)
    const agreement = serviceWithSumSpy()
    const issued = await agreement.service.issue(
      offboardingAmounts.employeeOffboardingId,
      TERMINATION_AGREEMENT,
      [unitAmounts.businessUnitId],
      issuer.userId
    )
    assert.strictEqual(agreement.calls.sum, 1)
    assert.strictEqual(issued.totalAmount, '7250.80')
  })

  test('CA-6: sin domicilio fiscal la guarda bloquea antes de la suma: 422, sin fila y sin consulta', async ({
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
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, AGREEMENT_ISSUE_ERROR_TITLE)
    assert.include(
      body.detail,
      'Domicilio fiscal de la empresa (Datos de facturación: los captura el dueño de la cuenta)'
    )
    assert.strictEqual(body.key, 'constancia-incompleta')
    assert.strictEqual(body.code, 'OFFB.DOC.INCOMPLETE')
    assert.lengthOf(await documentRows(offboardingNoAddress.employeeOffboardingId), 0)

    const spy = serviceWithSumSpy()
    let thrown: unknown = null
    try {
      await spy.service.issue(
        offboardingNoAddress.employeeOffboardingId,
        TERMINATION_AGREEMENT,
        [unitNoAddress.businessUnitId],
        issuerNoAddress.userId
      )
    } catch (error: unknown) {
      thrown = error
    }
    assert.instanceOf(thrown, EmployeeOffboardingServiceError)
    assert.strictEqual(spy.calls.sum, 0)
  })

  test('CA-7b: una plantilla de convenio sin la leyenda se rechaza y no llega a vigente', async ({
    client,
    assert,
  }) => {
    const withoutDisclaimer = AGREEMENT_TEMPLATE_FIELDS.filter(
      (key) => key !== 'amounts_disclaimer'
    )
    const response = await uploadAgreementTemplate(
      client,
      await buildTextFieldsTemplate(withoutDisclaimer, 'Plantilla convenio sin leyenda'),
      'convenio-sin-leyenda.pdf'
    )
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.key, 'plantilla-con-campos-invalidos')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.VALIDATION_FAILED')
    assert.include(body.detail, 'Leyenda del importe capturado')
    const currents = await db
      .from(TEMPLATES_TABLE)
      .where('business_unit_id', unitTemplate.businessUnitId)
      .where('employee_offboarding_document_template_status', 'current')
    assert.lengthOf(currents, 0)
  })

  test('CA-7: la plantilla propia con los tres marcadores los recibe rellenos igual que la del sistema', async ({
    client,
    assert,
  }) => {
    const upload = await uploadAgreementTemplate(
      client,
      await buildTextFieldsTemplate(AGREEMENT_TEMPLATE_FIELDS, 'Plantilla convenio con importes'),
      'convenio-importes.pdf'
    )
    upload.assertStatus(201)

    const response = await issue(
      client,
      issuerTemplate,
      unitTemplate,
      offboardingTemplate,
      TERMINATION_AGREEMENT
    )
    response.assertStatus(201)
    const dto = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.isNotNull(dto.templateVersionId)
    assert.strictEqual(dto.totalAmount, AMOUNT_43250_80)

    const [row] = await documentRows(offboardingTemplate.employeeOffboardingId)
    const stored = await readStored(row.employee_offboarding_document_file)
    const flattened = await PDFDocument.load(new Uint8Array(stored), { updateMetadata: false })
    assert.strictEqual(flattened.getForm().getFields().length, 0)
    const text = await extractPdfText(stored)
    assert.include(text, 'Plantilla convenio con importes')
    assert.include(text, '$43,250.80')
    assert.include(text, 'CUARENTA Y TRES MIL DOSCIENTOS CINCUENTA PESOS 80/100 M.N.')
    assert.include(text, AMOUNTS_DISCLAIMER)
  })
})

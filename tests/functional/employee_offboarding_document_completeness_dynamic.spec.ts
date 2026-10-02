import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
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
import { buildTextFieldsTemplate } from '../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550392 — guarda de completitud dinámica: cero cambio sin
 * plantilla propia (CA-1, escrito y verde ANTES de tocar la guarda), la
 * plantilla que usa menos datos deja de bloquear (CA-2), la que imprime la
 * antigüedad exige sus fechas (CA-3), orden estable (CA-5), faltante ≠
 * inconsistente (CA-6) y reglas de resolución intactas (CA-7). CA-4 vive en
 * el spec de la función pura junto a este archivo.
 *
 * Corre sobre la base y el bucket de DESARROLLO: las plantillas de prueba
 * entran por almacenamiento + fila (no por el endpoint), porque el contraste
 * de USRH1789097550388 exige los seis obligatorios y aquí se necesitan
 * plantillas que usen menos campos.
 */

const TEST_PASSWORD = 'CompletenessDynamic123!'
const OFFBOARDINGS_PATH = '/api/employee-offboardings'
const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const TEMPLATES_TABLE = 'employee_offboarding_document_templates'
const DOCUMENTS_TABLE = 'employee_offboarding_documents'
const ISSUE_ERROR_TITLE = 'No fue posible emitir la constancia de separación'
const INCOMPLETE_KEY = 'constancia-incompleta'
const INCOMPLETE_CODE = 'OFFB.DOC.INCOMPLETE'
const FIXTURE_SLUG_PREFIX = 'guarda-dinamica-'
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Texto vigente de `resources/langs/es.json` (USRH1787433503689), que CA-1 conserva byte por byte. */
const DETAIL_POSITION_AND_HIRE_DATE =
  'No es posible emitir la constancia de separación. Falta capturar: el puesto (pestaña Trabajo de la ficha) y la fecha de ingreso (pestaña Trabajo de la ficha).'
const DETAIL_POSITION =
  'No es posible emitir la constancia de separación. Falta capturar: el puesto (pestaña Trabajo de la ficha).'
const DETAIL_HIRE_DATE =
  'No es posible emitir la constancia de separación. Falta capturar: la fecha de ingreso (pestaña Trabajo de la ficha).'

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

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Guarda dinámica ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Guarda Dinamica ${prefix} SA de CV ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

async function findPermissions(actions: readonly string[]): Promise<SystemPermission[]> {
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

async function createRole(prefix: string, businessUnit: BusinessUnit): Promise<Role> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Guarda dinámica ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec de guarda de completitud dinámica',
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
    personLastname: 'Guarda',
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

async function createPosition(businessUnit: BusinessUnit): Promise<Position> {
  const stamp = uniqueStamp()
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `GD-${stamp}`.slice(0, 50)
  position.positionName = 'Analista de Nómina'
  position.positionActive = 1
  position.businessUnitId = businessUnit.businessUnitId
  await position.save()
  return position
}

interface EmployeeSeed {
  lastName: string
  /** `null` = puesto sin capturar. */
  position: Position | null
  /** `null` = fecha de ingreso sin capturar. */
  hireDate: string | null
  /** `null` = baja ejecutada sin fecha escrita (piloto/sobrecargo). */
  terminatedDate: string | null
}

/** Colaborador con la baja EJECUTADA (borrado lógico), como exige la emisión. */
async function createTerminatedEmployee(
  businessUnit: BusinessUnit,
  seed: EmployeeSeed
): Promise<Employee> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: 'Prueba',
    personLastname: seed.lastName,
    personSecondLastname: 'Guarda',
    personEmail: `colaborador-${stamp}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `GD-${stamp}`
  employee.employeeFirstName = 'Prueba'
  employee.employeeLastName = seed.lastName
  employee.employeeSecondLastName = 'Guarda'
  employee.employeePayrollNum = `GD-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.positionId = seed.position?.positionId ?? null
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeHireDate = seed.hireDate ? DateTime.fromISO(seed.hireDate) : null
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

/**
 * Versión `current` con los campos dados, entrando por almacenamiento + fila:
 * el endpoint la rechazaría (USRH1789097550388 exige los seis obligatorios) y
 * aquí se necesitan plantillas que usen MENOS campos. El dictamen declara
 * como reconocidos exactamente los campos del archivo.
 */
async function installTemplate(
  businessUnit: BusinessUnit,
  fieldNames: readonly string[]
): Promise<number> {
  const buffer = await buildTextFieldsTemplate(fieldNames, `Plantilla guarda ${fieldNames.length}`)
  const key = await new UploadService().uploadPrivateBuffer(
    `employee-offboarding-document-templates/${businessUnit.businessUnitId}/guarda-${uniqueStamp()}.pdf`,
    buffer,
    'application/pdf'
  )
  if (!key) throw new Error('No se pudo subir la plantilla de prueba')
  const [insertedId] = await db.table(TEMPLATES_TABLE).insert({
    business_unit_id: businessUnit.businessUnitId,
    employee_offboarding_document_template_document_type: DOCUMENT_TYPE,
    employee_offboarding_document_template_version_number: 1,
    employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
    employee_offboarding_document_template_storage_key: key,
    employee_offboarding_document_template_original_file_name: 'guarda.pdf',
    employee_offboarding_document_template_file_size_bytes: buffer.byteLength,
    employee_offboarding_document_template_content_sha256: sha256(buffer),
    employee_offboarding_document_template_validation_result: JSON.stringify({
      checkedAt: '2026-01-01T00:00:00.000Z',
      documentType: DOCUMENT_TYPE,
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

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

interface IssueBody {
  data: {
    employeeOffboardingDocument: {
      employeeOffboardingDocumentId: number
      referenceDateSource: string
      templateVersionId: number | null
      departmentName: string | null
    }
  }
}

async function documentCount(offboardingId: number): Promise<number> {
  const rows = await db.from(DOCUMENTS_TABLE).where('employee_offboarding_id', offboardingId)
  return rows.length
}

test.group('Guarda de completitud dinámica (USRH1789097550392)', (group) => {
  let unitSystem: BusinessUnit
  let unitNoPosition: BusinessUnit
  let unitSeniority: BusinessUnit
  let issuerSystem: User
  let issuerNoPosition: User
  let issuerSeniority: User
  let caseSystemMissingBoth: EmployeeOffboarding
  let caseSystemMissingPosition: EmployeeOffboarding
  let caseNoPositionTemplate: EmployeeOffboarding
  let caseSeniorityMissingHire: EmployeeOffboarding
  let caseSeniorityInverted: EmployeeOffboarding
  let casePlannedNoDepartment: EmployeeOffboarding
  let templateNoPositionId: number

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
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({ documentType: DOCUMENT_TYPE })

  group.setup(async () => {
    await purgeStaleFixtures()
    unitSystem = await createBusinessUnit('sistema')
    unitNoPosition = await createBusinessUnit('sin-puesto')
    unitSeniority = await createBusinessUnit('antiguedad')
    issuerSystem = await createUser('emisor-s', await createRole('sistema', unitSystem), unitSystem)
    issuerNoPosition = await createUser(
      'emisor-p',
      await createRole('sin-puesto', unitNoPosition),
      unitNoPosition
    )
    issuerSeniority = await createUser(
      'emisor-a',
      await createRole('antiguedad', unitSeniority),
      unitSeniority
    )
    const positionSeniority = await createPosition(unitSeniority)
    const positionNoPosition = await createPosition(unitNoPosition)

    // Plantilla que NO usa el puesto (CA-2) y plantilla que imprime la antigüedad sin la fecha de ingreso (CA-3)
    templateNoPositionId = await installTemplate(unitNoPosition, [
      'legal_name',
      'employee_name',
      'hire_date',
      'separation_date',
      'folio',
    ])
    await installTemplate(unitSeniority, [
      'legal_name',
      'employee_name',
      'position_name',
      'separation_date',
      'seniority',
      'folio',
    ])

    // Sin plantilla propia: sin puesto y sin fecha de ingreso (CA-1, CA-5)
    caseSystemMissingBoth = await createOffboarding(
      unitSystem,
      await createTerminatedEmployee(unitSystem, {
        lastName: 'Ambos',
        position: null,
        hireDate: null,
        terminatedDate: '2026-07-31',
      }),
      '2026-07-31'
    )
    // Sin plantilla propia: con fecha de ingreso y sin puesto (CA-2, segunda mitad)
    caseSystemMissingPosition = await createOffboarding(
      unitSystem,
      await createTerminatedEmployee(unitSystem, {
        lastName: 'SinPuesto',
        position: null,
        hireDate: '2019-04-15',
        terminatedDate: '2026-07-31',
      }),
      '2026-07-31'
    )
    // Con plantilla que no usa el puesto: con fecha de ingreso y sin puesto (CA-2)
    caseNoPositionTemplate = await createOffboarding(
      unitNoPosition,
      await createTerminatedEmployee(unitNoPosition, {
        lastName: 'Plantilla',
        position: null,
        hireDate: '2019-04-15',
        terminatedDate: '2026-07-31',
      }),
      '2026-07-31'
    )
    // Con plantilla que imprime la antigüedad: sin fecha de ingreso (CA-3)
    caseSeniorityMissingHire = await createOffboarding(
      unitSeniority,
      await createTerminatedEmployee(unitSeniority, {
        lastName: 'SinIngreso',
        position: positionSeniority,
        hireDate: null,
        terminatedDate: '2026-07-31',
      }),
      '2026-07-31'
    )
    // Con plantilla propia: separación anterior al ingreso (CA-6)
    caseSeniorityInverted = await createOffboarding(
      unitSeniority,
      await createTerminatedEmployee(unitSeniority, {
        lastName: 'Invertido',
        position: positionSeniority,
        hireDate: '2024-11-18',
        terminatedDate: '2024-03-05',
      }),
      '2024-03-05'
    )
    // Con plantilla propia: baja sin fecha escrita, fecha tentativa capturada, sin departamento (CA-7)
    casePlannedNoDepartment = await createOffboarding(
      unitNoPosition,
      await createTerminatedEmployee(unitNoPosition, {
        lastName: 'Piloto',
        position: positionNoPosition,
        hireDate: '2020-01-10',
        terminatedDate: null,
      }),
      '2026-06-30'
    )
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: sin plantilla propia el aviso es exactamente el de hoy y no se produce nada', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerSystem, unitSystem, caseSystemMissingBoth)
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, ISSUE_ERROR_TITLE)
    assert.strictEqual(body.detail, DETAIL_POSITION_AND_HIRE_DATE)
    assert.strictEqual(body.key, INCOMPLETE_KEY)
    assert.strictEqual(body.code, INCOMPLETE_CODE)
    assert.strictEqual(await documentCount(caseSystemMissingBoth.employeeOffboardingId), 0)
  })

  test('CA-5: dos intentos seguidos leen idéntico carácter por carácter', async ({
    client,
    assert,
  }) => {
    const first = await issue(client, issuerSystem, unitSystem, caseSystemMissingBoth)
    const second = await issue(client, issuerSystem, unitSystem, caseSystemMissingBoth)
    first.assertStatus(422)
    second.assertStatus(422)
    assert.strictEqual((first.body() as ErrorBody).detail, (second.body() as ErrorBody).detail)
    assert.strictEqual((first.body() as ErrorBody).detail, DETAIL_POSITION_AND_HIRE_DATE)
  })

  test('CA-2: la plantilla que no usa el puesto deja de bloquear; sin plantilla propia sigue bloqueando', async ({
    client,
    assert,
  }) => {
    const withTemplate = await issue(
      client,
      issuerNoPosition,
      unitNoPosition,
      caseNoPositionTemplate
    )
    withTemplate.assertStatus(201)
    const dto = (withTemplate.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(dto.templateVersionId, templateNoPositionId)

    const withoutTemplate = await issue(client, issuerSystem, unitSystem, caseSystemMissingPosition)
    withoutTemplate.assertStatus(422)
    const body = withoutTemplate.body() as ErrorBody
    assert.strictEqual(body.key, INCOMPLETE_KEY)
    assert.strictEqual(body.detail, DETAIL_POSITION)
    assert.strictEqual(await documentCount(caseSystemMissingPosition.employeeOffboardingId), 0)
  })

  test('CA-3: la plantilla que imprime la antigüedad exige la fecha de ingreso aunque no la imprima', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerSeniority, unitSeniority, caseSeniorityMissingHire)
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.key, INCOMPLETE_KEY)
    assert.strictEqual(body.code, INCOMPLETE_CODE)
    assert.strictEqual(body.detail, DETAIL_HIRE_DATE)
    assert.strictEqual(await documentCount(caseSeniorityMissingHire.employeeOffboardingId), 0)

    const english = await issue(
      client,
      issuerSeniority,
      unitSeniority,
      caseSeniorityMissingHire,
      'en'
    )
    english.assertStatus(422)
    assert.include((english.body() as ErrorBody).detail, 'the hire date (Work tab of the record)')
  })

  test('CA-6: faltante e inconsistente siguen siendo cosas distintas bajo plantilla propia', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerSeniority, unitSeniority, caseSeniorityInverted)
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.key, 'fechas-de-la-constancia-incoherentes')
    assert.strictEqual(body.code, 'OFFB.DOC.DATE_RANGE_INVALID')
    assert.strictEqual(await documentCount(caseSeniorityInverted.employeeOffboardingId), 0)
  })

  test('CA-7: la cascada a la fecha tentativa y la unidad de adscripción siguen intactas', async ({
    client,
    assert,
  }) => {
    const response = await issue(client, issuerNoPosition, unitNoPosition, casePlannedNoDepartment)
    response.assertStatus(201)
    const dto = (response.body() as IssueBody).data.employeeOffboardingDocument
    assert.strictEqual(dto.referenceDateSource, 'planned')
    assert.isNull(dto.departmentName)
    assert.strictEqual(dto.templateVersionId, templateNoPositionId)
  })
})

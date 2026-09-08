import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import {
  EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE,
  REFERENCE_DATE_SOURCE,
} from '#modules/employee-offboarding/documents/documents.constants'
import {
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'

/**
 * USRH1788579938608 — marca `hasSeparationLetter` y filtro
 * `withoutSeparationLetter` del listado de salidas (CA-1, CA-2, CA-3, CA-6 y
 * CA-7 del spec, más el aislamiento por empresa del DoD).
 *
 * Corre sobre la base de desarrollo con fixtures PROPIAS: dos empresas, un
 * rol con `read` sobre `employee-offboardings` (módulo sembrado por 0055), un
 * rol sin permiso, colaboradores con la baja ejecutada (borrado lógico) o
 * solo programada, expedientes, pendientes y documentos. Todo se destruye en
 * `group.teardown` en orden inverso de FK.
 */

const TEST_PASSWORD = 'SeparationLetterList123!'
const LIST_PATH = '/api/employee-offboardings'

/** Prefijo ÚNICO de las fixtures de este spec (slug de empresa y de rol). */
const FIXTURE_SLUG_PREFIX = 'constancia-listado-'

/** Tabla de `User.accessTokens`: `loginAs` deja tokens que hay que retirar antes del usuario. */
const ACCESS_TOKENS_TABLE = 'api_tokens'

/**
 * Raíces de las fixtures del grupo. Todo lo demás (usuarios, personas,
 * colaboradores, expedientes, documentos) cuelga de ellas por FK y se
 * resuelve al destruir, así una corrida interrumpida no deja huérfanos.
 */
const created = {
  businessUnitIds: [] as number[],
  roleIds: [] as number[],
}

/**
 * Destruye en orden inverso de FK todo lo que cuelga de las empresas y roles
 * dados. La usan el teardown (raíces del grupo) y el setup (restos de una
 * corrida anterior interrumpida: las pruebas escriben sobre la base de
 * desarrollo).
 */
async function destroyFixtures(businessUnitIds: number[], roleIds: number[]): Promise<void> {
  if (businessUnitIds.length > 0) {
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
        .from(EmployeeOffboardingItem.table)
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
        .whereIn('employee_id', employees.map((row) => Number(row.employee_id)))
        .delete()
      await db
        .from(Person.table)
        .whereIn('person_id', employees.map((row) => Number(row.person_id)))
        .delete()
    }
  }
  if (roleIds.length > 0) {
    const users = await db.from(User.table).select('user_id', 'person_id').whereIn('role_id', roleIds)
    if (users.length > 0) {
      const userIds = users.map((row) => Number(row.user_id))
      await db.from(BusinessUnitUser.table).whereIn('user_id', userIds).delete()
      await db.from(ACCESS_TOKENS_TABLE).whereIn('tokenable_id', userIds).delete()
      await db.from(User.table).whereIn('user_id', userIds).delete()
      await db
        .from(Person.table)
        .whereIn('person_id', users.map((row) => Number(row.person_id)))
        .delete()
    }
    await db.from(RoleSystemPermission.table).whereIn('role_id', roleIds).delete()
    await db.from(Role.table).whereIn('role_id', roleIds).delete()
  }
  if (businessUnitIds.length > 0) {
    await db.from(BusinessUnit.table).whereIn('business_unit_id', businessUnitIds).delete()
  }
}

/** Restos de una corrida anterior interrumpida, localizados por el prefijo único de slug. */
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

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Constancia listado ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Constancia listado ${prefix} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Permiso `read` del módulo de salidas; el gate es fail-closed si falta. */
async function findReadPermission(): Promise<SystemPermission> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', EMPLOYEE_OFFBOARDINGS_MODULE_SLUG)
    .first()
  if (!systemModule) {
    throw new Error(
      `Se requiere el módulo "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD (seeder 0055) para este test.`
    )
  }
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', systemModule.systemModuleId)
    .where('system_permission_slug', 'read')
    .first()
  if (!permission) {
    throw new Error(`Se requiere el permiso "read" de "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD.`)
  }
  return permission
}

async function createRole(prefix: string, businessUnit: BusinessUnit, withRead: boolean): Promise<Role> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Constancia listado ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec del listado de salidas',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  created.roleIds.push(role.roleId)
  if (withRead) {
    const permission = await findReadPermission()
    const grant = new RoleSystemPermission()
    grant.roleId = role.roleId
    grant.systemPermissionId = permission.systemPermissionId
    await grant.save()
  }
  return role
}

/** Usuario con acceso a la empresa por la pivote `business_unit_users`. */
async function createUser(prefix: string, role: Role, businessUnit: BusinessUnit): Promise<User> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Lector',
    personLastname: 'Listado',
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

interface EmployeeSeed {
  /** Apellido: la búsqueda del listado casa por nombre completo. */
  lastName: string
  /**
   * Fecha real de baja. Con valor, la baja queda EJECUTADA (borrado lógico
   * del colaborador, que es lo que el listado lee como `terminationExecuted`);
   * `null` = baja programada y no ejecutada.
   */
  terminatedDate: string | null
}

async function createEmployee(businessUnit: BusinessUnit, seed: EmployeeSeed): Promise<Employee> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: 'Prueba',
    personLastname: seed.lastName,
    personSecondLastname: 'Listado',
    personEmail: `colaborador-${stamp}@gsti-tests.local`,
  })

  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `CL-${stamp}`
  employee.employeeFirstName = 'Prueba'
  employee.employeeLastName = seed.lastName
  employee.employeeSecondLastName = 'Listado'
  employee.employeePayrollNum = `CL-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeHireDate = DateTime.fromISO('2022-01-10')
  employee.employeeTerminatedDate = seed.terminatedDate
  await employee.save()

  if (seed.terminatedDate !== null) {
    await db
      .from(Employee.table)
      .where('employee_id', employee.employeeId)
      .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
  }
  return employee
}

interface OffboardingSeed extends EmployeeSeed {
  status?: string
  /** Fecha tentativa; respaldo de la fecha de referencia cuando no hay baja real. */
  plannedDate: string
  /** Estados de los pendientes a crear. */
  items: string[]
  /** Constancia vigente y viva desde el arranque. */
  withCurrentLetter?: boolean
}

async function createOffboarding(
  businessUnit: BusinessUnit,
  seed: OffboardingSeed
): Promise<EmployeeOffboarding> {
  const employee = await createEmployee(businessUnit, seed)
  const offboarding = await EmployeeOffboarding.create({
    employeeId: employee.employeeId,
    businessUnitId: businessUnit.businessUnitId,
    employeeOffboardingPlannedDate: seed.plannedDate,
    employeeOffboardingStatus: seed.status ?? EMPLOYEE_OFFBOARDING_STATUS.OPEN,
    employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
    employeeOffboardingNotes: null,
    employeeOffboardingOpenedByUserId: null,
  })

  for (const [index, status] of seed.items.entries()) {
    await EmployeeOffboardingItem.create({
      employeeOffboardingId: offboarding.employeeOffboardingId,
      offboardingConceptId: null,
      employeeSupplyId: null,
      employeeOffboardingItemName: `Pendiente ${index + 1}`,
      employeeOffboardingItemStatus: status,
      employeeOffboardingItemAmount: null,
      employeeOffboardingItemNote: null,
      employeeOffboardingItemCompletedAt:
        status === EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED ? DateTime.utc() : null,
      employeeOffboardingItemCompletedByUserId: null,
    })
  }

  if (seed.withCurrentLetter) {
    await createDocument(offboarding, { sequence: 1, isCurrent: true })
  }
  return offboarding
}

/** Emisión de constancia con el folio del generador vivo `CS-{id}-{año}-{NNNN}`. */
async function createDocument(
  offboarding: EmployeeOffboarding,
  options: { sequence: number; isCurrent: boolean }
): Promise<EmployeeOffboardingDocument> {
  const folio = `CS-${offboarding.employeeOffboardingId}-2026-${String(options.sequence).padStart(4, '0')}`
  return await EmployeeOffboardingDocument.create({
    employeeOffboardingId: offboarding.employeeOffboardingId,
    employeeOffboardingDocumentType: EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER,
    employeeOffboardingDocumentFolio: folio,
    employeeOffboardingDocumentFile: `tests/employee-offboarding-documents/${folio}.pdf`,
    employeeOffboardingDocumentFileName: `${folio}.pdf`,
    employeeOffboardingDocumentSizeBytes: 1024,
    employeeOffboardingDocumentEmployeeName: 'Prueba Garcia Listado',
    employeeOffboardingDocumentPositionName: null,
    employeeOffboardingDocumentDepartmentName: null,
    employeeOffboardingDocumentLegalName: 'Constancia listado Legal',
    employeeOffboardingDocumentHireDate: DateTime.fromISO('2022-01-10'),
    employeeOffboardingDocumentReferenceDate: DateTime.fromISO('2026-08-15'),
    employeeOffboardingDocumentReferenceDateSource: REFERENCE_DATE_SOURCE.TERMINATED,
    employeeOffboardingDocumentSeniorityDays: 1678,
    employeeOffboardingDocumentContentHash: 'f'.repeat(64),
    employeeOffboardingDocumentIsCurrent: options.isCurrent,
    employeeOffboardingDocumentSupersededDocumentId: null,
    employeeOffboardingDocumentGeneratedByUserId: null,
  })
}

type ListRow = Record<string, unknown> & { employeeOffboardingId: number }

function rowsOf(body: Record<string, any>): ListRow[] {
  return body.data.employeeOffboardings.data as ListRow[]
}

function metaOf(body: Record<string, any>): { total: number } {
  return body.data.employeeOffboardings.meta
}

function findRow(rows: ListRow[], offboarding: EmployeeOffboarding): ListRow | undefined {
  return rows.find((row) => row.employeeOffboardingId === offboarding.employeeOffboardingId)
}

test.group('Listado de salidas — constancia de separación (USRH1788579938608)', (group) => {
  let businessUnit: BusinessUnit
  let otherBusinessUnit: BusinessUnit
  let reader: User
  let noAccessUser: User
  let otherReader: User

  // CA-1
  let issued: EmployeeOffboarding
  let missing: EmployeeOffboarding
  // CA-2
  let reissued: EmployeeOffboarding
  let reissuedCurrentDocument: EmployeeOffboardingDocument
  // CA-3 (junto con `issued`, `missing` y `reissued`)
  let matchesAll: EmployeeOffboarding
  let otherName: EmployeeOffboarding
  let closedCase: EmployeeOffboarding
  let issuedGarcia: EmployeeOffboarding
  let notExecuted: EmployeeOffboarding
  // Otra empresa
  let foreignMissing: EmployeeOffboarding

  group.setup(async () => {
    await purgeStaleFixtures()
    businessUnit = await createBusinessUnit('propia')
    otherBusinessUnit = await createBusinessUnit('ajena')

    const readerRole = await createRole('lector', businessUnit, true)
    const noAccessRole = await createRole('sin-permiso', businessUnit, false)
    reader = await createUser('lector', readerRole, businessUnit)
    noAccessUser = await createUser('sin-permiso', noAccessRole, businessUnit)
    otherReader = await createUser('lector-ajeno', readerRole, otherBusinessUnit)

    // Fechas de referencia distintas y descendentes: fijan el orden esperado
    issued = await createOffboarding(businessUnit, {
      lastName: 'Perez',
      terminatedDate: '2026-08-30',
      plannedDate: '2026-08-30',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED, EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
      withCurrentLetter: true,
    })
    missing = await createOffboarding(businessUnit, {
      lastName: 'Perez',
      terminatedDate: '2026-08-29',
      plannedDate: '2026-08-29',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING, EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })
    reissued = await createOffboarding(businessUnit, {
      lastName: 'Perez',
      terminatedDate: '2026-08-28',
      plannedDate: '2026-08-28',
      items: [
        EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED,
        EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING,
        EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING,
      ],
    })
    await createDocument(reissued, { sequence: 1, isCurrent: false })
    reissuedCurrentDocument = await createDocument(reissued, { sequence: 2, isCurrent: true })

    matchesAll = await createOffboarding(businessUnit, {
      lastName: 'Garcia',
      terminatedDate: '2026-08-27',
      plannedDate: '2026-08-27',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })
    otherName = await createOffboarding(businessUnit, {
      lastName: 'Lopez',
      terminatedDate: '2026-08-26',
      plannedDate: '2026-08-26',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })
    closedCase = await createOffboarding(businessUnit, {
      lastName: 'Garcia',
      terminatedDate: '2026-08-25',
      plannedDate: '2026-08-25',
      status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED,
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })
    issuedGarcia = await createOffboarding(businessUnit, {
      lastName: 'Garcia',
      terminatedDate: '2026-08-24',
      plannedDate: '2026-08-24',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
      withCurrentLetter: true,
    })
    notExecuted = await createOffboarding(businessUnit, {
      lastName: 'Garcia',
      terminatedDate: null,
      plannedDate: '2026-12-15',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })

    foreignMissing = await createOffboarding(otherBusinessUnit, {
      lastName: 'Garcia',
      terminatedDate: '2026-08-31',
      plannedDate: '2026-08-31',
      items: [EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING],
    })
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: el renglón dice si tiene constancia vigente sin inflar el avance ni filtrar detalle', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(LIST_PATH)
      .qs({ page: 1, limit: 20 })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const rows = rowsOf(response.body())

    const issuedRow = findRow(rows, issued)
    assert.exists(issuedRow)
    assert.strictEqual(issuedRow!.hasSeparationLetter, true)
    assert.strictEqual(issuedRow!.terminationExecuted, true)
    assert.strictEqual(issuedRow!.itemsTotal, 2)
    assert.strictEqual(issuedRow!.itemsCompleted, 1)
    assert.strictEqual(issuedRow!.itemsOpen, 1)
    assert.strictEqual(issuedRow!.itemsOverdue, 1)

    const missingRow = findRow(rows, missing)
    assert.exists(missingRow)
    assert.strictEqual(missingRow!.hasSeparationLetter, false)
    assert.strictEqual(missingRow!.terminationExecuted, true)
    assert.strictEqual(missingRow!.itemsTotal, 2)
    assert.strictEqual(missingRow!.itemsCompleted, 0)
    assert.strictEqual(missingRow!.itemsOpen, 2)
    assert.strictEqual(missingRow!.itemsOverdue, 2)

    // Confidencialidad: ningún renglón trae folio, fecha de emisión, hash,
    // key de S3, autor ni id del documento
    for (const row of rows) {
      const leaked = Object.keys(row).filter((key) => /document|folio|hash|storage|file/i.test(key))
      assert.deepEqual(leaked, [])
    }
  })

  test('CA-2: una emisión reemplazada no vuelve faltante al expediente; la única viva borrada sí', async ({
    client,
    assert,
  }) => {
    const before = await client
      .get(LIST_PATH)
      .qs({ page: 1, limit: 20 })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    before.assertStatus(200)
    const beforeRows = rowsOf(before.body())

    const occurrences = beforeRows.filter(
      (row) => row.employeeOffboardingId === reissued.employeeOffboardingId
    )
    assert.lengthOf(occurrences, 1)
    assert.strictEqual(occurrences[0].hasSeparationLetter, true)
    // Dos documentos NO duplican los pendientes (3, no 6)
    assert.strictEqual(occurrences[0].itemsTotal, 3)
    assert.strictEqual(occurrences[0].itemsCompleted, 1)
    assert.strictEqual(occurrences[0].itemsOpen, 2)

    await db
      .from(EmployeeOffboardingDocument.table)
      .where(
        'employee_offboarding_document_id',
        reissuedCurrentDocument.employeeOffboardingDocumentId
      )
      .update({
        employee_offboarding_document_deleted_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
    try {
      const after = await client
        .get(LIST_PATH)
        .qs({ page: 1, limit: 20 })
        .loginAs(reader)
        .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
      after.assertStatus(200)
      const afterRow = findRow(rowsOf(after.body()), reissued)
      assert.exists(afterRow)
      assert.strictEqual(afterRow!.hasSeparationLetter, false)
    } finally {
      await db
        .from(EmployeeOffboardingDocument.table)
        .where(
          'employee_offboarding_document_id',
          reissuedCurrentDocument.employeeOffboardingDocumentId
        )
        .update({ employee_offboarding_document_deleted_at: null })
    }
  })

  test('CA-3: el filtro aísla a los faltantes con baja ejecutada y respeta búsqueda y estado', async ({
    client,
    assert,
  }) => {
    const combined = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true, status: 'open', search: 'GARC' })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    combined.assertStatus(200)
    const combinedRows = rowsOf(combined.body())
    assert.deepEqual(
      combinedRows.map((row) => row.employeeOffboardingId),
      [matchesAll.employeeOffboardingId]
    )
    assert.strictEqual(metaOf(combined.body()).total, 1)
    // La baja sin ejecutar nunca aparece aunque case la búsqueda y esté abierta
    assert.notExists(findRow(combinedRows, notExecuted))

    // Solo el filtro nuevo: todas las faltantes con baja ejecutada, en orden de
    // fecha de referencia descendente (desempate por id)
    const onlyFilter = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true, limit: 20 })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    onlyFilter.assertStatus(200)
    assert.deepEqual(
      rowsOf(onlyFilter.body()).map((row) => row.employeeOffboardingId),
      [
        missing.employeeOffboardingId,
        matchesAll.employeeOffboardingId,
        otherName.employeeOffboardingId,
        closedCase.employeeOffboardingId,
      ]
    )
    assert.strictEqual(metaOf(onlyFilter.body()).total, 4)

    // Sin el filtro vuelven todas las salidas de la empresa
    const all = await client
      .get(LIST_PATH)
      .qs({ page: 1, limit: 20 })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    all.assertStatus(200)
    assert.strictEqual(metaOf(all.body()).total, 8)
    assert.exists(findRow(rowsOf(all.body()), issuedGarcia))
    assert.exists(findRow(rowsOf(all.body()), notExecuted))
  })

  test('CA-6: un valor no booleano del filtro responde 400 datos-invalidos sin código propio', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: 'quizas' })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)

    response.assertStatus(400)
    assert.strictEqual(response.body().key, 'datos-invalidos')
    assert.strictEqual(response.body().code, 'OFFB.CASE.VAL_INPUT')
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
  })

  test('CA-7: sin permiso read responde 403 y fuera del alcance de empresa 404 BU.NOT.001', async ({
    client,
    assert,
  }) => {
    const forbidden = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true })
      .loginAs(noAccessUser)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    forbidden.assertStatus(403)
    assert.strictEqual(forbidden.body().key, 'sin-permiso')
    assert.strictEqual(forbidden.body().code, 'OFFB.CASE.FORBIDDEN')

    const outOfScope = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true })
      .loginAs(reader)
      .header('X-Business-Unit-Id', otherBusinessUnit.businessUnitPublicId)
    outOfScope.assertStatus(404)
    assert.strictEqual(outOfScope.body().key, 'BU.NOT.001')
  })

  test('Multi-tenant: la marca y el filtro no cruzan empresas', async ({ client, assert }) => {
    const own = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true, limit: 20 })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    own.assertStatus(200)
    assert.notExists(findRow(rowsOf(own.body()), foreignMissing))

    const foreign = await client
      .get(LIST_PATH)
      .qs({ withoutSeparationLetter: true, limit: 20 })
      .loginAs(otherReader)
      .header('X-Business-Unit-Id', otherBusinessUnit.businessUnitPublicId)
    foreign.assertStatus(200)
    assert.deepEqual(
      rowsOf(foreign.body()).map((row) => row.employeeOffboardingId),
      [foreignMissing.employeeOffboardingId]
    )
    assert.strictEqual(findRow(rowsOf(foreign.body()), foreignMissing)!.hasSeparationLetter, false)
  })
})

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import RoleSystemPermission from '#models/role_system_permission'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'
import {
  grantModuleAction,
  type ModuleActionGrant,
} from './employees/sensitive_read_by_category_support.js'
import {
  EMPLOYEE_WORK_SCHEDULE,
  type EmployeeWorkSchedule,
} from '#constants/employee_work_schedule'
import { TELEWORK_CHECKLIST_ANSWER_RESULT } from '#constants/telework_checklist'

/**
 * Tests funcionales — superficie HTTP de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870), Tarea 4.
 *
 * Cubre los 12 grupos del brief: 401 sin sesión (1); la matriz de permisos del
 * módulo `telework-checklists` con el helper compartido (CA-10); y el contrato
 * HTTP de registro/consulta con un actor `root` que omite el guard (CA-1 a CA-7,
 * CA-9, CA-11 y los Review Focus 2 y 4). El núcleo de dominio ya está probado en
 * `tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts`;
 * aquí se verifica la capa HTTP: envoltura de respuesta, el `label` resuelto por
 * i18n, el 403 sin `detail` del helper, el 422 de Vine y el aislamiento.
 *
 * Convenciones (molde `tests/functional/telework_compliance_settings.spec.ts`):
 * actores con email único por timestamp, `ensureRole`, `grantModuleAction` con
 * retiro de la concesión solo si el spec la creó, y cleanup explícito en
 * `group.teardown`. El header `X-Business-Unit-Id` lleva el código público UUID
 * de la empresa, nunca el id interno. Los empleados se crean por tabla dentro de
 * `TenantContext.run` (el mixin lo exige) y las fechas de calendario van en CDMX.
 */

const TEST_PASSWORD = 'TeleworkChecklistHttp123!'
const BUSINESS_ZONE = 'America/Mexico_City'
const MODULE_SLUG = 'telework-checklists'
const ROOT_ROLE = 'root'
const NO_PERMISSION_ROLE = 'empleado'
/** Módulo del catálogo que sí declara `gestion`: prueba que el bypass no cruza de módulo. */
const OTHER_MODULE_WITH_GESTION = 'telework-policy'
const TODAY_ISO = DateTime.now().setZone(BUSINESS_ZONE).startOf('day').toISODate() ?? ''
const TOMORROW_ISO =
  DateTime.now().setZone(BUSINESS_ZONE).startOf('day').plus({ days: 1 }).toISODate() ?? ''

interface TestActor {
  user: User
  person: Person
  roleId: number
}

interface CatalogItem {
  itemId: number
  code: string
  order: number
}

interface Scenario {
  businessUnit: BusinessUnit
  pedroId: number
  pedro2Id: number
  rosaId: number
  liveLocationId: number
  deadLocationId: number
  rosaLocationId: number
  items: CatalogItem[]
}

/** Hooks mínimos del grupo de Japa que usa el armador de escenario. */
interface ScenarioGroup {
  setup(handler: () => Promise<void>): unknown
  teardown(handler: () => Promise<void>): unknown
  each: { setup(handler: () => Promise<void>): unknown }
}

let scenario: Scenario
let root: TestActor

async function createTestActor(roleSlug: TestRoleSlug, emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkChecklist'
  person.personLastname = 'Http'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const role = await ensureRole(roleSlug)

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person, roleId: role.roleId }
}

/** Suelta al actor de sus empresas: la FK `business_unit_users` lo impide después. */
async function detachTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
}

/**
 * Borra la cuenta y su persona. Debe correr DESPUÉS de borrar las aplicaciones:
 * la FK `fk_twca_applied_by_user` (`RESTRICT`) las referencia.
 */
async function deleteTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function cleanupTestActor(actor: TestActor | null): Promise<void> {
  await detachTestActor(actor)
  await deleteTestActor(actor)
}

/** Retira la concesión solo si este spec la creó (rol compartido). */
async function revokeGrant(grant: ModuleActionGrant | null): Promise<void> {
  if (grant?.created) {
    await RoleSystemPermission.query()
      .where('role_system_permission_id', grant.grant.roleSystemPermissionId)
      .delete()
  }
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `TeleworkChecklist Http ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `telework-checklist-http-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `TeleworkChecklist Http ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()
  return businessUnit
}

/**
 * Inserta un colaborador por tabla (sin hooks de alta del modelo: el spec no
 * necesita rama/bitácora). Persona, departamento y puesto van por modelo dentro
 * de `TenantContext` porque el mixin lo exige.
 */
async function insertEmployee(
  businessUnitId: number,
  schedule: EmployeeWorkSchedule,
  prefix: string
): Promise<{ employeeId: number; personId: number }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const code = `TWC-${prefix}-${stamp}`.slice(0, 40)

  return TenantContext.run([businessUnitId], async () => {
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'TeleworkChecklist',
      personSecondLastname: prefix,
      personEmail: `twc-employee-${prefix}-${stamp}@gsti-tests.local`,
      businessUnitId,
    })
    const department = await createDepartmentFixture(businessUnitId, `Dept ${prefix}`)
    const position = await createPositionFixture(businessUnitId, `Pos ${prefix}`)

    const inserted = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: code,
      employee_code: code,
      employee_first_name: 'Empleado',
      employee_last_name: 'TeleworkChecklist',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      payroll_business_unit_id: businessUnitId,
      department_id: department.departmentId,
      position_id: position.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: schedule,
      employee_business_email: `twc-employee-${prefix}-${stamp}@gsti-tests.local`,
      employee_created_at: new Date(),
    })

    return { employeeId: Number(inserted[0]), personId: person.personId }
  })
}

/** Inserta un lugar de teletrabajo por tabla; `active=false` lo deja dado de baja. */
async function insertTeleworkLocation(
  businessUnitId: number,
  employeeId: number,
  active: boolean
): Promise<number> {
  const inserted = await db.table('employee_telework_locations').insert({
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    employee_telework_location_street: 'Calle de Prueba 123',
    employee_telework_location_city: 'Ciudad de México',
    employee_telework_location_state: 'Ciudad de México',
    employee_telework_location_active: active,
    employee_telework_location_created_at: new Date(),
    employee_telework_location_deleted_at: active ? null : new Date(),
  })
  return Number(inserted[0])
}

async function listCatalogItems(): Promise<CatalogItem[]> {
  const rows = await db
    .from('telework_checklist_items')
    .where('telework_checklist_item_is_active', true)
    .orderBy('telework_checklist_item_order', 'asc')
    .select('telework_checklist_item_id', 'telework_checklist_item_code', 'telework_checklist_item_order')
  return rows.map((row) => ({
    itemId: Number(row.telework_checklist_item_id),
    code: String(row.telework_checklist_item_code),
    order: Number(row.telework_checklist_item_order),
  }))
}

async function createScenario(prefix: string): Promise<Scenario> {
  const businessUnit = await createBusinessUnit(prefix)
  const businessUnitId = businessUnit.businessUnitId

  const pedro = await insertEmployee(businessUnitId, EMPLOYEE_WORK_SCHEDULE.HYBRID, `${prefix}-pedro`)
  const pedro2 = await insertEmployee(
    businessUnitId,
    EMPLOYEE_WORK_SCHEDULE.HYBRID,
    `${prefix}-pedro2`
  )
  const rosa = await insertEmployee(businessUnitId, EMPLOYEE_WORK_SCHEDULE.ONSITE, `${prefix}-rosa`)

  const liveLocationId = await insertTeleworkLocation(businessUnitId, pedro.employeeId, true)
  const deadLocationId = await insertTeleworkLocation(businessUnitId, pedro.employeeId, false)
  const rosaLocationId = await insertTeleworkLocation(businessUnitId, rosa.employeeId, true)

  const items = await listCatalogItems()

  return {
    businessUnit,
    pedroId: pedro.employeeId,
    pedro2Id: pedro2.employeeId,
    rosaId: rosa.employeeId,
    liveLocationId,
    deadLocationId,
    rosaLocationId,
    items,
  }
}

async function cleanupScenario(target: Scenario | null): Promise<void> {
  if (!target) return
  const businessUnitId = target.businessUnit.businessUnitId

  await db.from('telework_checklist_answers').where('business_unit_id', businessUnitId).delete()
  await db
    .from('telework_checklist_applications')
    .where('business_unit_id', businessUnitId)
    .delete()
  await db.from('telework_compliance_settings').where('business_unit_id', businessUnitId).delete()
  await db
    .from('employee_telework_locations')
    .where('business_unit_id', businessUnitId)
    .delete()

  const employees = (await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .select('person_id')) as { person_id: number }[]
  const personIds = employees.map((row) => Number(row.person_id))
  await db.from('employees').where('business_unit_id', businessUnitId).delete()
  if (personIds.length > 0) {
    await Person.query().whereIn('person_id', personIds).delete()
  }

  await cleanupOrgChartFixtures(businessUnitId)
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function clearApplications(businessUnitId: number): Promise<void> {
  await db.from('telework_checklist_answers').where('business_unit_id', businessUnitId).delete()
  await db.from('telework_checklist_applications').where('business_unit_id', businessUnitId).delete()
  await db.from('telework_compliance_settings').where('business_unit_id', businessUnitId).delete()
}

async function countApplications(businessUnitId: number): Promise<number> {
  const row = await db
    .from('telework_checklist_applications')
    .where('business_unit_id', businessUnitId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function countAnswers(businessUnitId: number): Promise<number> {
  const row = await db
    .from('telework_checklist_answers')
    .where('business_unit_id', businessUnitId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function countVigente(businessUnitId: number, employeeId: number): Promise<number> {
  const row = await db
    .from('telework_checklist_applications')
    .where('business_unit_id', businessUnitId)
    .where('employee_id', employeeId)
    .where('telework_checklist_application_status', 'vigente')
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

function expectedExpiry(isoDay: string, months: number): string {
  return DateTime.fromISO(isoDay, { zone: BUSINESS_ZONE }).plus({ months }).toISODate() ?? ''
}

function buildAnswers(items: CatalogItem[], nonCompliantItemId?: number): Record<string, unknown>[] {
  return items.map((item) => ({
    itemId: item.itemId,
    result:
      item.itemId === nonCompliantItemId
        ? TELEWORK_CHECKLIST_ANSWER_RESULT.NON_COMPLIANT
        : TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT,
  }))
}

function visitBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: scenario.pedroId,
    appliedAt: TODAY_ISO,
    inspectorName: 'Inspector de la Comisión',
    answers: buildAnswers(scenario.items),
    ...overrides,
  }
}

function getItems(client: ApiClient, user: User, businessUnit: BusinessUnit) {
  return client
    .get('/api/nom037/telework-checklists/items')
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
}

function getEmployee(
  client: ApiClient,
  user: User,
  businessUnit: BusinessUnit,
  employeeId: number
) {
  return client
    .get(`/api/nom037/telework-checklists/employees/${employeeId}`)
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
}

function getDetail(
  client: ApiClient,
  user: User,
  businessUnit: BusinessUnit,
  applicationId: number
) {
  return client
    .get(`/api/nom037/telework-checklists/${applicationId}`)
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
}

function postVisit(
  client: ApiClient,
  user: User,
  businessUnit: BusinessUnit,
  body: Record<string, unknown>
) {
  return client
    .post('/api/nom037/telework-checklists')
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    .json(body)
}

/**
 * Arma el escenario compartido (empresa + Pedro y Pedro2 híbridos + Rosa
 * presencial + lugares vivo/muerto/de Rosa) y un actor `root` para cada grupo,
 * con limpieza por prueba (aplicaciones y ajustes) y al cerrar el grupo.
 */
function useScenario(group: ScenarioGroup, prefix: string): void {
  group.setup(async () => {
    scenario = await createScenario(prefix)
    root = await createTestActor(ROOT_ROLE, `root-${prefix}`)
    await root.user.related('businessUnits').attach([scenario.businessUnit.businessUnitId])
  })

  group.each.setup(async () => {
    await clearApplications(scenario.businessUnit.businessUnitId)
  })

  group.teardown(async () => {
    // Orden por FKs: soltar al actor de la empresa, borrar aplicaciones y
    // empleados, borrar la empresa, y hasta el final la cuenta del actor.
    await detachTestActor(root)
    await cleanupScenario(scenario)
    await deleteTestActor(root)
  })
}

// ─── Grupo 1: 401 sin sesión ────────────────────────────────────────────────
test.group('telework-checklists — 401 sin sesión', () => {
  test('Objetivo: GET items sin sesión responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-checklists/items')
    response.assertStatus(401)
  })

  test('Objetivo: GET employees/:employeeId sin sesión responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-checklists/employees/1')
    response.assertStatus(401)
  })

  test('Objetivo: GET /:applicationId sin sesión responde 401', async ({ client }) => {
    const response = await client.get('/api/nom037/telework-checklists/1')
    response.assertStatus(401)
  })

  test('Objetivo: POST /api/nom037/telework-checklists sin sesión responde 401', async ({
    client,
  }) => {
    const response = await client.post('/api/nom037/telework-checklists').json({})
    response.assertStatus(401)
  })
})

// ─── Grupo 2: CA-10 — permisos ──────────────────────────────────────────────
test.group('telework-checklists — permisos (CA-10)', (group) => {
  useScenario(group, 'permisos')

  test('Objetivo: CA-10 — sin permiso de lectura los dos GET de datos responden 403 sin detail', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'sin-permiso')
    try {
      await actor.user.related('businessUnits').attach([scenario.businessUnit.businessUnitId])

      const readEmployee = await getEmployee(
        client,
        actor.user,
        scenario.businessUnit,
        scenario.pedroId
      )
      readEmployee.assertStatus(403)
      const employeeBody = readEmployee.body()
      assert.equal(employeeBody.type, 'error')
      assert.equal(employeeBody.key, 'sin-permiso')
      assert.equal(employeeBody.errorCode, 'TWC.AUTH.001')
      assert.isNull(employeeBody.data)
      assert.notProperty(employeeBody, 'detail')

      const readDetail = await getDetail(client, actor.user, scenario.businessUnit, 999999)
      readDetail.assertStatus(403)
      assert.equal(readDetail.body().key, 'sin-permiso')
      assert.equal(readDetail.body().errorCode, 'TWC.AUTH.001')
      assert.notProperty(readDetail.body(), 'detail')
    } finally {
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: CA-10 — con read sin create, GET responde 200 y POST 403 sin escribir', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'solo-read')
    let grant: ModuleActionGrant | null = null
    try {
      await actor.user.related('businessUnits').attach([scenario.businessUnit.businessUnitId])
      grant = await grantModuleAction(actor.roleId, MODULE_SLUG, 'read')

      const read = await getEmployee(client, actor.user, scenario.businessUnit, scenario.pedroId)
      read.assertStatus(200)
      assert.equal(read.body().data.employeeId, scenario.pedroId)

      const write = await postVisit(client, actor.user, scenario.businessUnit, visitBody())
      write.assertStatus(403)
      assert.equal(write.body().key, 'sin-permiso')
      assert.equal(write.body().errorCode, 'TWC.AUTH.001')

      assert.equal(await countApplications(scenario.businessUnit.businessUnitId), 0)
    } finally {
      await revokeGrant(grant)
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: CA-10 — GET items responde 200 a cualquier autenticado de la empresa', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'items-cualquiera')
    let grant: ModuleActionGrant | null = null
    try {
      await actor.user.related('businessUnits').attach([scenario.businessUnit.businessUnitId])

      // Sin permiso del módulo.
      const withoutPermission = await getItems(client, actor.user, scenario.businessUnit)
      withoutPermission.assertStatus(200)
      assert.lengthOf(withoutPermission.body().data, 7)

      // Con permiso del módulo.
      grant = await grantModuleAction(actor.roleId, MODULE_SLUG, 'read')
      const withPermission = await getItems(client, actor.user, scenario.businessUnit)
      withPermission.assertStatus(200)
      assert.lengthOf(withPermission.body().data, 7)
      assert.equal(
        withPermission.body().data[0].label,
        'Iluminación suficiente del área de trabajo'
      )

      // §11: cada punto del catálogo trae su `order` con el número que le corresponde.
      const orderByItemId = new Map(scenario.items.map((item) => [item.itemId, item.order]))
      const data = withPermission.body().data as { itemId: number; order: number }[]
      data.forEach((item) => {
        assert.equal(item.order, orderByItemId.get(item.itemId))
      })
      assert.deepEqual(
        data.map((item) => item.order),
        scenario.items.map((item) => item.order)
      )
    } finally {
      await revokeGrant(grant)
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: CA-10 — un rol con gestion en otro módulo sigue recibiendo 403 aquí', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'gestion-otro-modulo')
    let grant: ModuleActionGrant | null = null
    try {
      await actor.user.related('businessUnits').attach([scenario.businessUnit.businessUnitId])
      grant = await grantModuleAction(actor.roleId, OTHER_MODULE_WITH_GESTION, 'gestion')

      const read = await getEmployee(client, actor.user, scenario.businessUnit, scenario.pedroId)
      read.assertStatus(403)
      assert.equal(read.body().key, 'sin-permiso')
      assert.equal(read.body().errorCode, 'TWC.AUTH.001')

      const write = await postVisit(client, actor.user, scenario.businessUnit, visitBody())
      write.assertStatus(403)
      assert.equal(write.body().errorCode, 'TWC.AUTH.001')
    } finally {
      await revokeGrant(grant)
      await cleanupTestActor(actor)
    }
  })
})

// ─── Grupo 3: CA-1 — visita feliz con un no cumple ──────────────────────────
test.group('telework-checklists — visita feliz (CA-1)', (group) => {
  useScenario(group, 'ca1')

  test('Objetivo: CA-1 — una visita con un no cumple responde 201 con el detalle y sus respuestas', async ({
    client,
    assert,
  }) => {
    const nonCompliant = scenario.items[0].itemId
    const response = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ appliedAt: TODAY_ISO, answers: buildAnswers(scenario.items, nonCompliant) })
    )

    response.assertStatus(201)
    const payload = response.body()
    assert.equal(payload.type, 'success')
    assert.equal(payload.data.mode, 'visita_csh')
    assert.equal(payload.data.status, 'vigente')
    assert.equal(payload.data.overallResult, 'no_aprobada')
    assert.equal(payload.data.revalidationPeriodMonths, 12)
    assert.equal(payload.data.appliedAt, TODAY_ISO)
    assert.equal(payload.data.expiresAt, expectedExpiry(TODAY_ISO, 12))
    assert.equal(payload.data.appliedByUserId, root.user.userId)
    assert.lengthOf(payload.data.answers, 7)

    const illuminated = payload.data.answers.find(
      (answer: { code: string }) => answer.code === 'iluminacion'
    )
    assert.equal(illuminated.label, 'Iluminación suficiente del área de trabajo')

    assert.equal(await countAnswers(scenario.businessUnit.businessUnitId), 7)
  })
})

// ─── Grupo 4: CA-7 — la forma la fija el servidor ───────────────────────────
test.group('telework-checklists — la forma la fija el servidor (CA-7)', (group) => {
  useScenario(group, 'ca7')

  test('Objetivo: CA-7 — el body con mode autoaplicada y photos no cambia el mode del servidor', async ({
    client,
    assert,
  }) => {
    const response = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ mode: 'autoaplicada', photos: [] })
    )

    response.assertStatus(201)
    assert.equal(response.body().data.mode, 'visita_csh')
  })
})

// ─── Grupo 5: CA-2 — snapshot por HTTP ──────────────────────────────────────
test.group('telework-checklists — snapshot de la periodicidad (CA-2)', (group) => {
  useScenario(group, 'ca2')

  test('Objetivo: CA-2 — cambiar la periodicidad a 6 meses mueve la nueva visita pero no la anterior', async ({
    client,
    assert,
  }) => {
    const first = await postVisit(client, root.user, scenario.businessUnit, visitBody())
    first.assertStatus(201)
    assert.equal(first.body().data.revalidationPeriodMonths, 12)
    assert.equal(first.body().data.expiresAt, expectedExpiry(TODAY_ISO, 12))

    const put = await client
      .put('/api/nom037/telework-settings')
      .loginAs(root.user)
      .header('X-Business-Unit-Id', scenario.businessUnit.businessUnitPublicId)
      .json({
        revalidationPeriodMonths: 6,
        expirationNoticeDays: 15,
        electricityAllowanceDefault: null,
        internetAllowanceDefault: null,
        ownEquipmentFeeDefault: null,
      })
    put.assertStatus(200)

    const second = await postVisit(client, root.user, scenario.businessUnit, visitBody())
    second.assertStatus(201)
    assert.equal(second.body().data.revalidationPeriodMonths, 6)
    assert.equal(second.body().data.expiresAt, expectedExpiry(TODAY_ISO, 6))

    const previous = await getDetail(
      client,
      root.user,
      scenario.businessUnit,
      first.body().data.applicationId
    )
    previous.assertStatus(200)
    assert.equal(previous.body().data.revalidationPeriodMonths, 12)
    assert.equal(previous.body().data.expiresAt, expectedExpiry(TODAY_ISO, 12))
  })
})

// ─── Grupo 6: CA-3 — reemplazo y consulta ───────────────────────────────────
test.group('telework-checklists — reemplazo y consulta (CA-3)', (group) => {
  useScenario(group, 'ca3')

  test('Objetivo: CA-3 — una nueva visita reemplaza a la vigente y el historial trae ambas', async ({
    client,
    assert,
  }) => {
    const first = await postVisit(client, root.user, scenario.businessUnit, visitBody())
    first.assertStatus(201)
    const second = await postVisit(client, root.user, scenario.businessUnit, visitBody())
    second.assertStatus(201)

    const listed = await getEmployee(client, root.user, scenario.businessUnit, scenario.pedroId)
    listed.assertStatus(200)
    const data = listed.body().data
    assert.equal(data.employeeId, scenario.pedroId)
    assert.equal(data.current.applicationId, second.body().data.applicationId)
    assert.lengthOf(data.history, 2)
    assert.equal(data.history[0].applicationId, second.body().data.applicationId)
    assert.equal(data.history[1].applicationId, first.body().data.applicationId)
    assert.equal(data.history[1].status, 'reemplazada')
  })
})

// ─── Grupo 7: CA-4 — cobertura inválida no guarda nada ──────────────────────
test.group('telework-checklists — cobertura inválida (CA-4)', (group) => {
  useScenario(group, 'ca4')

  test('Objetivo: CA-4 — faltantes, duplicados y desconocidos responden 422 sin escribir', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnit.businessUnitId
    const answers = buildAnswers(scenario.items)

    const missing = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: answers.slice(0, -1) })
    )
    missing.assertStatus(422)
    assert.equal(missing.body().key, 'respuestas-incompletas')
    assert.equal(missing.body().code, 'TWC.VAL.002')
    assert.deepEqual(missing.body().data.missingItemCodes, [
      scenario.items[scenario.items.length - 1].code,
    ])

    const duplicated = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: [...answers, { ...answers[0] }] })
    )
    duplicated.assertStatus(422)
    assert.equal(duplicated.body().key, 'respuesta-duplicada')
    assert.equal(duplicated.body().code, 'TWC.VAL.003')

    const unknown = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: [...answers, { itemId: 999999, result: 'cumple' }] })
    )
    unknown.assertStatus(422)
    assert.equal(unknown.body().key, 'punto-no-reconocido')
    assert.equal(unknown.body().code, 'TWC.VAL.004')
    assert.equal(unknown.body().data.itemId, 999999)

    assert.equal(await countApplications(businessUnitId), 0)
    assert.equal(await countAnswers(businessUnitId), 0)
  })
})

// ─── Grupo 8: CA-5 — datos de la visita ─────────────────────────────────────
test.group('telework-checklists — datos de la visita (CA-5)', (group) => {
  useScenario(group, 'ca5')

  test('Objetivo: CA-5 — visitador ausente, fecha futura y lugar inválido se rechazan sin escribir', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnit.businessUnitId

    const noInspector = await postVisit(client, root.user, scenario.businessUnit, {
      ...visitBody(),
      inspectorName: undefined,
    })
    noInspector.assertStatus(422)
    assert.equal(noInspector.body().key, 'visitador-requerido')
    assert.equal(noInspector.body().code, 'TWC.VAL.006')

    const future = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ appliedAt: TOMORROW_ISO })
    )
    future.assertStatus(422)
    assert.equal(future.body().key, 'fecha-de-aplicacion-invalida')
    assert.equal(future.body().code, 'TWC.VAL.005')

    const foreignLocation = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ teleworkLocationId: scenario.rosaLocationId })
    )
    foreignLocation.assertStatus(422)
    assert.equal(foreignLocation.body().key, 'lugar-de-teletrabajo-invalido')
    assert.equal(foreignLocation.body().code, 'TWC.VAL.007')

    const deadLocation = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ teleworkLocationId: scenario.deadLocationId })
    )
    deadLocation.assertStatus(422)
    assert.equal(deadLocation.body().key, 'lugar-de-teletrabajo-invalido')
    assert.equal(deadLocation.body().code, 'TWC.VAL.007')

    // Sin header de empresa: responde el error del middleware antes del controller.
    const noHeader = await client
      .post('/api/nom037/telework-checklists')
      .loginAs(root.user)
      .json(visitBody())
    noHeader.assertStatus(400)
    assert.equal(noHeader.body().key, 'BU.VAL.000')

    assert.equal(await countApplications(businessUnitId), 0)
  })
})

// ─── Grupo 9: CA-6 — presencial ─────────────────────────────────────────────
test.group('telework-checklists — gating de teletrabajador (CA-6)', (group) => {
  useScenario(group, 'ca6')

  test('Objetivo: CA-6 — registrar para un colaborador presencial responde 422 sin filas', async ({
    client,
    assert,
  }) => {
    const response = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ employeeId: scenario.rosaId })
    )

    response.assertStatus(422)
    assert.equal(response.body().key, 'solo-teletrabajadores')
    assert.equal(response.body().code, 'TWC.VAL.GATING.001')
    assert.equal(await countApplications(scenario.businessUnit.businessUnitId), 0)
  })
})

// ─── Grupo 10: Review Focus 2 — Vine manda en lo malformado ─────────────────
test.group('telework-checklists — Vine manda en lo malformado (Review Focus 2)', (group) => {
  useScenario(group, 'vine')

  test('Objetivo: Review Focus 2 — answers vacío, result inventado e itemId cero responden entrada-invalida', async ({
    client,
    assert,
  }) => {
    const emptyAnswers = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: [] })
    )
    emptyAnswers.assertStatus(422)
    assert.equal(emptyAnswers.body().key, 'entrada-invalida')
    assert.equal(emptyAnswers.body().code, 'TWC.VAL.001')
    assert.isArray(emptyAnswers.body().data.errors)

    const badResult = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: [{ itemId: scenario.items[0].itemId, result: 'talvez' }] })
    )
    badResult.assertStatus(422)
    assert.equal(badResult.body().key, 'entrada-invalida')
    assert.equal(badResult.body().code, 'TWC.VAL.001')
    assert.isArray(badResult.body().data.errors)

    const badItemId = await postVisit(
      client,
      root.user,
      scenario.businessUnit,
      visitBody({ answers: [{ itemId: 0, result: 'cumple' }] })
    )
    badItemId.assertStatus(422)
    assert.equal(badItemId.body().key, 'entrada-invalida')
    assert.equal(badItemId.body().code, 'TWC.VAL.001')
    assert.isArray(badItemId.body().data.errors)
  })
})

// ─── Grupo 11: CA-9 — aislamiento ───────────────────────────────────────────
test.group('telework-checklists — aislamiento entre empresas (CA-9)', (group) => {
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let pedroAId: number
  let actorA: TestActor
  let actorB: TestActor
  let items: CatalogItem[]

  group.setup(async () => {
    businessUnitA = await createBusinessUnit('aislamiento-a')
    businessUnitB = await createBusinessUnit('aislamiento-b')
    const pedro = await insertEmployee(
      businessUnitA.businessUnitId,
      EMPLOYEE_WORK_SCHEDULE.HYBRID,
      'aislamiento-pedro'
    )
    pedroAId = pedro.employeeId
    actorA = await createTestActor(ROOT_ROLE, 'aislamiento-a')
    await actorA.user.related('businessUnits').attach([businessUnitA.businessUnitId])
    actorB = await createTestActor(ROOT_ROLE, 'aislamiento-b')
    await actorB.user.related('businessUnits').attach([businessUnitB.businessUnitId])
    items = await listCatalogItems()
  })

  group.teardown(async () => {
    // Orden por FKs: soltar actores, borrar aplicaciones y empleados, borrar
    // empresas, y hasta el final las cuentas de los actores.
    await detachTestActor(actorA)
    await detachTestActor(actorB)
    for (const businessUnit of [businessUnitA, businessUnitB]) {
      await db
        .from('telework_checklist_answers')
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
      await db
        .from('telework_checklist_applications')
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
      await db
        .from('employee_telework_locations')
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
      const employees = (await db
        .from('employees')
        .where('business_unit_id', businessUnit.businessUnitId)
        .select('person_id')) as { person_id: number }[]
      const personIds = employees.map((row) => Number(row.person_id))
      await db.from('employees').where('business_unit_id', businessUnit.businessUnitId).delete()
      if (personIds.length > 0) {
        await Person.query().whereIn('person_id', personIds).delete()
      }
      await cleanupOrgChartFixtures(businessUnit.businessUnitId)
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
    await deleteTestActor(actorA)
    await deleteTestActor(actorB)
  })

  test('Objetivo: CA-9 — lo de otra empresa se comporta como inexistente', async ({
    client,
    assert,
  }) => {
    // Pedro (empresa A) y una visita suya, creados con el actor de la empresa A.
    const visit = await postVisit(client, actorA.user, businessUnitA, {
      employeeId: pedroAId,
      appliedAt: TODAY_ISO,
      inspectorName: 'Inspector',
      answers: buildAnswers(items),
    })
    visit.assertStatus(201)
    const applicationId = visit.body().data.applicationId

    // El actor de la empresa B pide el historial, el detalle y el registro de Pedro.
    const foreignEmployee = await getEmployee(client, actorB.user, businessUnitB, pedroAId)
    foreignEmployee.assertStatus(404)
    assert.equal(foreignEmployee.body().key, 'colaborador-no-encontrado')
    assert.equal(foreignEmployee.body().code, 'TWC.NF.001')

    const foreignDetail = await getDetail(client, actorB.user, businessUnitB, applicationId)
    foreignDetail.assertStatus(404)
    assert.equal(foreignDetail.body().key, 'aplicacion-no-encontrada')
    assert.equal(foreignDetail.body().code, 'TWC.NF.002')

    const foreignPost = await postVisit(client, actorB.user, businessUnitB, {
      employeeId: pedroAId,
      appliedAt: TODAY_ISO,
      inspectorName: 'Inspector',
      answers: buildAnswers(items),
    })
    foreignPost.assertStatus(404)
    assert.equal(foreignPost.body().key, 'colaborador-no-encontrado')
    assert.equal(foreignPost.body().code, 'TWC.NF.001')

    // El cuerpo es idéntico al de un id inexistente.
    const nonexistent = await getEmployee(client, actorB.user, businessUnitB, 999999)
    nonexistent.assertStatus(404)
    assert.deepEqual(foreignEmployee.body(), nonexistent.body())
  })
})

// ─── Grupo 12: CA-11 y Review Focus 4 — concurrencia ────────────────────────
test.group('telework-checklists — concurrencia (CA-11 y Review Focus 4)', (group) => {
  useScenario(group, 'concurrencia')

  test('Objetivo: CA-11 — dos POST simultáneos del mismo empleado dejan una sola vigente', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnit.businessUnitId

    const [first, second] = await Promise.all([
      postVisit(client, root.user, scenario.businessUnit, visitBody()),
      postVisit(client, root.user, scenario.businessUnit, visitBody()),
    ])

    const statuses = [first.status(), second.status()]
    const created = statuses.filter((status) => status === 201).length
    assert.isAtLeast(created, 1)
    if (created === 1) {
      assert.include(statuses, 409)
    }

    assert.equal(await countVigente(businessUnitId, scenario.pedroId), 1)
  })

  test('Objetivo: Review Focus 4 — dos POST simultáneos de empleados distintos dejan dos vigentes', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnit.businessUnitId

    const [first, second] = await Promise.all([
      postVisit(
        client,
        root.user,
        scenario.businessUnit,
        visitBody({ employeeId: scenario.pedroId })
      ),
      postVisit(
        client,
        root.user,
        scenario.businessUnit,
        visitBody({ employeeId: scenario.pedro2Id })
      ),
    ])

    first.assertStatus(201)
    second.assertStatus(201)
    assert.equal(await countVigente(businessUnitId, scenario.pedroId), 1)
    assert.equal(await countVigente(businessUnitId, scenario.pedro2Id), 1)
  })
})

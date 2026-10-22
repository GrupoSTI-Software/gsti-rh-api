import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'
import { TELEWORK_CHECKLIST_ANSWER_RESULT } from '#constants/telework_checklist'
import TeleworkChecklistService from '#modules/telework-checklist/telework_checklist.service'
import { teleworkChecklistCreateValidator } from '#modules/telework-checklist/validators/telework_checklist_create.validator'

/**
 * Tests funcionales — matriz HTTP de la invalidación de la lista vigente al
 * guardar un lugar de teletrabajo (VLRH-H1791306078668, Tarea 4).
 *
 * Cubre el contrato del §11 del spec sobre `POST`, `PUT` y `DELETE`
 * `/api/nom037/telework-locations`: el campo `data.teleworkChecklistInvalidated`
 * siempre presente y booleano, y la matriz de los casos 1-5, 7-9, 11-16, 18, 19
 * y 21-24 del anexo A, más los criterios CA-11, CA-13, CA-15, CA-16 y los
 * Review Focus 4 (RF4) y 5 (RF5). La regla pura vive en
 * `tests/unit/utils/telework_location_change.spec.ts` y la atomicidad con puerto
 * falso en `tests/unit/services/employee_telework_location_service.spec.ts`.
 *
 * Convenciones (molde `tests/functional/telework_checklist.spec.ts`): actores con
 * correo único por timestamp, `ensureRole`, el header `X-Business-Unit-Id` con el
 * **código público UUID** de la empresa (nunca el id interno), empleados creados
 * por tabla dentro de `TenantContext.run` (el mixin lo exige), fechas de
 * calendario en CDMX y teardown ordenado por FKs. La lista vigente se siembra con
 * `TeleworkChecklistService#registerVisit` (no por HTTP) para que cada caso
 * arranque del estado exacto que describe el anexo.
 *
 * RF5 —desviación documentada—: el plan esperaba que un actor con membresía en
 * dos empresas (`scope [A, B]`) pudiera crear el lugar de un empleado de B con el
 * header de A y con eso invalidar la lista de B. Eso no es alcanzable por HTTP:
 * `business_unit_scope_middleware.ts:129` fija `ctx.businessUnitScope` en
 * `[requestedId]`, es decir **solo** la empresa del header, así que el empleado de
 * la otra empresa nunca entra al alcance y la petición responde 404
 * `empleado-no-encontrado` sin tocar ninguna lista (verificado contra la BD de
 * pruebas). El caso fija ese comportamiento real; la propiedad que el plan quería
 * pinnera —la empresa de la lista sale de la fila del empleado, no del header—
 * solo se puede ejercitar con un `scope` de varias empresas, que ninguna ruta
 * entrega hoy.
 */

const TEST_PASSWORD = 'TeleworkLocationInvalidation123!'
const BUSINESS_ZONE = 'America/Mexico_City'
const ROOT_ROLE = 'root'
/** Rol sin permisos: las tres rutas solo exigen `auth` + `businessScope`. */
const MEMBER_ROLE = 'empleado'
const TODAY_ISO = DateTime.now().setZone(BUSINESS_ZONE).startOf('day').toISODate() ?? ''
const YESTERDAY_ISO =
  DateTime.now().setZone(BUSINESS_ZONE).startOf('day').minus({ days: 1 }).toISODate() ?? ''
const LOCATIONS_PATH = '/api/nom037/telework-locations'

/** Las tres rutas del contrato comparten el prefijo y el header de empresa. */
interface TestActor {
  user: User
  person: Person
}

interface CatalogItem {
  itemId: number
  code: string
  order: number
}

/** Fila persistida de la lista, en las columnas que la matriz necesita. */
interface ApplicationRow {
  telework_checklist_application_id: number
  telework_checklist_application_status: string
  telework_checklist_application_invalidation_reason: string | null
  telework_checklist_application_invalidated_at: string | Date | null
  telework_checklist_application_invalidated_by_user_id: number | null
}

/** Fila persistida del lugar (lectura cruda: ve también las bajas lógicas). */
interface LocationRow {
  employee_telework_location_id: number
  employee_telework_location_street: string
  employee_telework_location_active: number
  employee_telework_location_deleted_at: string | Date | null
  employee_telework_location_is_fixed_agreed: number
}

/** Domicilio parametrizable del lugar sembrado por tabla. */
interface LocationRowOverrides {
  type?: string
  street?: string
  externalNumber?: string | null
  internalNumber?: string | null
  settlement?: string | null
  city?: string
  state?: string
  country?: string
  zipcode?: string | null
  isFixedAgreed?: boolean
  active?: boolean
}

interface Scenario {
  businessUnitA: BusinessUnit
  businessUnitB: BusinessUnit
  pedroId: number
  foreignEmployeeId: number
  items: CatalogItem[]
}

interface ScenarioGroup {
  setup(handler: () => Promise<void>): unknown
  teardown(handler: () => Promise<void>): unknown
  each: { setup(handler: () => Promise<void>): unknown }
}

let scenario: Scenario
let root: TestActor
/** Actor con membresía en A y B (alcance de dos empresas en `fullScope`). */
let bothUnits: TestActor

/** Distingue «no mandé el campo» de «lo mandé en null» al sembrar por tabla. */
function pick<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value
}

async function createTestActor(roleSlug: TestRoleSlug, emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkLocation'
  person.personLastname = 'Invalidation'
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

  return { user, person }
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `TWL Invalidation ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `twl-invalidation-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `TWL Invalidation ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()
  return businessUnit
}

/**
 * Inserta un colaborador por tabla (sin hooks de alta del modelo). Persona,
 * departamento y puesto van por modelo dentro de `TenantContext` porque el
 * mixin lo exige; `schedule` decide el gating de teletrabajador.
 */
async function insertEmployee(
  businessUnitId: number,
  schedule: string,
  prefix: string
): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const code = `TWL-${prefix}-${stamp}`.slice(0, 40)

  return TenantContext.run([businessUnitId], async () => {
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'TWL',
      personSecondLastname: prefix,
      personEmail: `twl-employee-${prefix}-${stamp}@gsti-tests.local`,
      businessUnitId,
    })
    const department = await createDepartmentFixture(businessUnitId, `Dept ${prefix}`)
    const position = await createPositionFixture(businessUnitId, `Pos ${prefix}`)

    const inserted = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: code,
      employee_code: code,
      employee_first_name: 'Empleado',
      employee_last_name: 'TWL',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      payroll_business_unit_id: businessUnitId,
      department_id: department.departmentId,
      position_id: position.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: schedule,
      employee_business_email: `twl-employee-${prefix}-${stamp}@gsti-tests.local`,
      employee_created_at: new Date(),
    })

    return Number(inserted[0])
  })
}

/**
 * Inserta un lugar de teletrabajo por tabla con domicilio parametrizable (la
 * versión del molde trae calle fija; aquí cada caso necesita su propio
 * domicilio). `active: false` lo deja dado de baja lógica.
 */
async function insertLocation(
  businessUnitId: number,
  employeeId: number,
  overrides: LocationRowOverrides = {}
): Promise<number> {
  const active = overrides.active ?? true
  const inserted = await db.table('employee_telework_locations').insert({
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    employee_telework_location_type: pick(overrides.type, 'home'),
    employee_telework_location_street: pick(overrides.street, 'Calle de Prueba 123'),
    employee_telework_location_external_number: pick(overrides.externalNumber, '15'),
    employee_telework_location_internal_number: pick(overrides.internalNumber, null),
    employee_telework_location_settlement: pick(overrides.settlement, null),
    employee_telework_location_city: pick(overrides.city, 'Ciudad de México'),
    employee_telework_location_state: pick(overrides.state, 'Ciudad de México'),
    employee_telework_location_country: pick(overrides.country, 'México'),
    employee_telework_location_zipcode: pick(overrides.zipcode, '06000'),
    employee_telework_location_is_fixed_agreed: overrides.isFixedAgreed ?? false,
    employee_telework_location_has_internet: true,
    employee_telework_location_has_adequate_equipment: true,
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
    .select(
      'telework_checklist_item_id',
      'telework_checklist_item_code',
      'telework_checklist_item_order'
    )
  return rows.map((row) => ({
    itemId: Number(row.telework_checklist_item_id),
    code: String(row.telework_checklist_item_code),
    order: Number(row.telework_checklist_item_order),
  }))
}

async function applicationRow(
  businessUnitId: number,
  employeeId: number
): Promise<ApplicationRow | null> {
  const row = await db
    .from('telework_checklist_applications')
    .where('business_unit_id', businessUnitId)
    .where('employee_id', employeeId)
    .orderBy('telework_checklist_application_id', 'desc')
    .first()
  return row as ApplicationRow | null
}

async function locationRow(locationId: number): Promise<LocationRow | null> {
  const row = await db
    .from('employee_telework_locations')
    .where('employee_telework_location_id', locationId)
    .first()
  return row as LocationRow | null
}

async function countAnswers(businessUnitId: number): Promise<number> {
  const row = await db
    .from('telework_checklist_answers')
    .where('business_unit_id', businessUnitId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function countLocations(businessUnitId: number, employeeId: number): Promise<number> {
  const row = await db
    .from('employee_telework_locations')
    .where('business_unit_id', businessUnitId)
    .where('employee_id', employeeId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

/**
 * Siembra la lista vigente del colaborador con la visita de la CSH (mismo
 * camino que el molde: el validador arma el input y cubre los puntos activos).
 * `teleworkLocationId` null deja la lista **sin lugar ligado**, que es la
 * variante de los casos 11-16 y 18-19.
 */
async function seedCurrent(
  businessUnitId: number,
  employeeId: number,
  teleworkLocationId: number | null
): Promise<number> {
  const input = await teleworkChecklistCreateValidator.validate({
    employeeId,
    appliedAt: TODAY_ISO,
    inspectorName: 'Inspector de la Comisión',
    teleworkLocationId: teleworkLocationId ?? undefined,
    answers: scenario.items.map((item) => ({
      itemId: item.itemId,
      result: TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT,
    })),
  })

  const detail = await new TeleworkChecklistService().registerVisit(
    businessUnitId,
    input,
    root.user.userId
  )

  return detail.applicationId
}

/** Payload del validador: por defecto el domicilio sembrado por `insertLocation`. */
function locationBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeTeleworkLocationType: 'home',
    employeeTeleworkLocationStreet: 'Calle de Prueba 123',
    employeeTeleworkLocationExternalNumber: '15',
    employeeTeleworkLocationInternalNumber: null,
    employeeTeleworkLocationSettlement: null,
    employeeTeleworkLocationCity: 'Ciudad de México',
    employeeTeleworkLocationState: 'Ciudad de México',
    employeeTeleworkLocationCountry: 'México',
    employeeTeleworkLocationZipcode: '06000',
    employeeTeleworkLocationIsFixedAgreed: false,
    employeeTeleworkLocationHasInternet: true,
    employeeTeleworkLocationHasAdequateEquipment: true,
    employeeTeleworkLocationConnectivityNotes: null,
    ...overrides,
  }
}

function postLocation(
  client: ApiClient,
  actor: TestActor,
  businessUnit: BusinessUnit,
  body: Record<string, unknown>
) {
  return client
    .post(LOCATIONS_PATH)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    .json(body)
}

function putLocation(
  client: ApiClient,
  actor: TestActor,
  businessUnit: BusinessUnit,
  locationId: number,
  body: Record<string, unknown>
) {
  return client
    .put(`${LOCATIONS_PATH}/${locationId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    .json(body)
}

function deleteLocation(
  client: ApiClient,
  actor: TestActor,
  businessUnit: BusinessUnit,
  locationId: number
) {
  return client
    .delete(`${LOCATIONS_PATH}/${locationId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
}

async function clearBusinessUnitRows(businessUnitId: number): Promise<void> {
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
}

async function deleteBusinessUnit(businessUnitId: number): Promise<void> {
  await clearBusinessUnitRows(businessUnitId)

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

async function deleteTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/**
 * Escenario compartido: empresa A con un colaborador teletrabajador, empresa B
 * con otro (para el aislamiento y RF5), el catálogo de puntos activos y los dos
 * actores. Cada prueba arranca sin listas ni lugares: los siembra ella misma.
 */
function useScenario(group: ScenarioGroup, prefix: string): void {
  group.setup(async () => {
    const businessUnitA = await createBusinessUnit(`${prefix}-a`)
    const businessUnitB = await createBusinessUnit(`${prefix}-b`)

    scenario = {
      businessUnitA,
      businessUnitB,
      pedroId: await insertEmployee(
        businessUnitA.businessUnitId,
        EMPLOYEE_WORK_SCHEDULE.HYBRID,
        `${prefix}-pedro`
      ),
      foreignEmployeeId: await insertEmployee(
        businessUnitB.businessUnitId,
        EMPLOYEE_WORK_SCHEDULE.HYBRID,
        `${prefix}-ajeno`
      ),
      items: await listCatalogItems(),
    }

    root = await createTestActor(ROOT_ROLE, `root-${prefix}`)
    await root.user
      .related('businessUnits')
      .attach([businessUnitA.businessUnitId, businessUnitB.businessUnitId])

    bothUnits = await createTestActor(MEMBER_ROLE, `dos-empresas-${prefix}`)
    await bothUnits.user
      .related('businessUnits')
      .attach([businessUnitA.businessUnitId, businessUnitB.businessUnitId])
  })

  group.each.setup(async () => {
    await clearBusinessUnitRows(scenario.businessUnitA.businessUnitId)
    await clearBusinessUnitRows(scenario.businessUnitB.businessUnitId)
  })

  group.teardown(async () => {
    // Orden por FKs: soltar a los actores de sus empresas, borrar las filas de
    // ambas empresas (las aplicaciones referencian al usuario por RESTRICT) y
    // hasta el final las cuentas de los actores.
    await root.user.related('businessUnits').detach()
    await bothUnits.user.related('businessUnits').detach()
    await deleteBusinessUnit(scenario.businessUnitA.businessUnitId)
    await deleteBusinessUnit(scenario.businessUnitB.businessUnitId)
    await deleteTestActor(root)
    await deleteTestActor(bothUnits)
  })
}

// ─── Matriz del anexo A sobre el contrato HTTP ─────────────────────────────
test.group('telework-locations — invalidación de la lista vigente (anexo A)', (group) => {
  useScenario(group, 'matriz')

  test('caso 1 — PUT que cambia la calle del lugar verificado invalida la lista vigente', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)
    const answersBefore = await countAnswers(businessUnitId)

    const response = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' }),
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
    assert.equal(row?.telework_checklist_application_invalidation_reason, 'cambio_de_domicilio')
    assert.isNotNull(row?.telework_checklist_application_invalidated_at)
    assert.equal(row?.telework_checklist_application_invalidated_by_user_id, root.user.userId)
    // Regla 11: el histórico (respuestas) queda intacto.
    assert.equal(await countAnswers(businessUnitId), answersBefore)
  })

  test('caso 2 — PUT cosmético (mayúsculas, espacios y null por vacío) no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez  15',
      externalNumber: null,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'av. juarez 15',
        employeeTeleworkLocationExternalNumber: '',
      }),
    })

    response.assertStatus(200)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
    assert.isNull(row?.telework_checklist_application_invalidated_at)
  })

  test('caso 3 — PUT que solo cambia tipo, notas, internet y equipo no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({
        employeeTeleworkLocationType: 'coworking',
        employeeTeleworkLocationConnectivityNotes: 'Fibra 500 Mbps simétrica',
        employeeTeleworkLocationHasInternet: false,
        employeeTeleworkLocationHasAdequateEquipment: false,
      }),
    })

    response.assertStatus(200)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 4 — DELETE del lugar verificado invalida y da de baja lógica', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await deleteLocation(client, root, scenario.businessUnitA, locationId)

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
    assert.equal(row?.telework_checklist_application_invalidation_reason, 'cambio_de_domicilio')

    // Nada se borra (regla 3): la fila sigue viva, con baja lógica.
    const location = await locationRow(locationId)
    assert.isNotNull(location)
    assert.equal(Number(location?.employee_telework_location_active), 0)
    assert.isNotNull(location?.employee_telework_location_deleted_at)
  })

  test('caso 5 — DELETE de otro lugar del colaborador no invalida', async ({ client, assert }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    const otherLocationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Secundaria 7',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await deleteLocation(client, root, scenario.businessUnitA, otherLocationId)

    response.assertStatus(200)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 7 — POST de un lugar no fijo no invalida', async ({ client, assert }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationType: 'coworking',
        employeeTeleworkLocationStreet: 'Coworking Insurgentes 500',
      }),
    })

    response.assertStatus(201)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 8 — POST de un fijo con domicilio distinto al verificado invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Nueva 458',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(201)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
    assert.equal(row?.telework_checklist_application_invalidation_reason, 'cambio_de_domicilio')
  })

  test('caso 9 — POST de un fijo con el mismo domicilio normalizado no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'CALLE DE PRUEBA 123',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(201)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 11 — PUT que cambia el domicilio del fijo de una lista sin lugar invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const fixedId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await putLocation(client, root, scenario.businessUnitA, fixedId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Fija 200',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
  })

  test('caso 12 — PUT que desmarca el fijo pactado invalida', async ({ client, assert }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const fixedId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await putLocation(client, root, scenario.businessUnitA, fixedId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Fija 100',
        employeeTeleworkLocationIsFixedAgreed: false,
      }),
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
  })

  test('caso 13 — DELETE del fijo pactado de una lista sin lugar invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const fixedId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await deleteLocation(client, root, scenario.businessUnitA, fixedId)

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
  })

  test('caso 14 — POST de otro fijo con domicilio distinto invalida y desmarca el anterior', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const fixedId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Nueva Fija 300',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(201)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')

    const previous = await locationRow(fixedId)
    assert.equal(Number(previous?.employee_telework_location_is_fixed_agreed), 0)
  })

  test('caso 15 — PUT que marca otro lugar como fijo con domicilio distinto invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    const otherId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Distinta 55',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await putLocation(client, root, scenario.businessUnitA, otherId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Distinta 55',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'invalidada')
  })

  test('caso 16 — fijo con el mismo domicilio normalizado que el anterior no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
      isFixedAgreed: true,
    })
    const otherId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Fija 100',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    // PUT que marca como fijo un lugar con el mismo domicilio normalizado.
    const marked = await putLocation(client, root, scenario.businessUnitA, otherId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'CALLE FIJA 100',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })
    marked.assertStatus(200)
    assert.isFalse(marked.body().data.teleworkChecklistInvalidated)

    // POST de otro fijo con el mismo domicilio normalizado.
    const created = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'calle fija 100',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })
    created.assertStatus(201)
    assert.isFalse(created.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 18 — POST del primer fijo con una lista sin lugar no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'Primer Fijo 10',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(201)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 19 — PUT que marca el primer fijo de una lista sin lugar no invalida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Sin Marca 20',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, null)

    const response = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Sin Marca 20',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(200)
    assert.isFalse(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('caso 21 — sin vigente o con la persistida ya vencida no invalida ni materializa vencida', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })

    // (a) Colaborador sin lista: el cambio se guarda normal y responde false.
    const withoutApplication = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' }),
    })
    withoutApplication.assertStatus(200)
    assert.isFalse(withoutApplication.body().data.teleworkChecklistInvalidated)
    assert.isNull(await applicationRow(businessUnitId, scenario.pedroId))

    // (b) Lista persistida ya vencida por fecha: tampoco invalida.
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)
    await db
      .from('telework_checklist_applications')
      .where('business_unit_id', businessUnitId)
      .where('employee_id', scenario.pedroId)
      .update({ telework_checklist_application_expires_at: YESTERDAY_ISO })

    const expired = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 17' }),
    })
    expired.assertStatus(200)
    assert.isFalse(expired.body().data.teleworkChecklistInvalidated)

    // Regla 10: la vencida no se materializa; sigue como estaba persistida.
    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
    assert.isNull(row?.telework_checklist_application_invalidated_at)
  })

  test('caso 22 — una lista ya invalidada conserva fecha y autor del primer cambio', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const first = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' }),
    })
    first.assertStatus(200)
    assert.isTrue(first.body().data.teleworkChecklistInvalidated)

    const invalidated = await applicationRow(businessUnitId, scenario.pedroId)

    const second = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 17' }),
    })
    second.assertStatus(200)
    assert.isFalse(second.body().data.teleworkChecklistInvalidated)

    const after = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(after?.telework_checklist_application_status, 'invalidada')
    assert.equal(
      String(after?.telework_checklist_application_invalidated_at),
      String(invalidated?.telework_checklist_application_invalidated_at)
    )
    assert.equal(
      after?.telework_checklist_application_invalidated_by_user_id,
      invalidated?.telework_checklist_application_invalidated_by_user_id
    )
  })

  test('caso 23 — lugar de la empresa B con cuenta de A responde 404 y no toca la lista de B', async ({
    client,
    assert,
  }) => {
    const businessUnitBId = scenario.businessUnitB.businessUnitId
    const foreignLocationId = await insertLocation(businessUnitBId, scenario.foreignEmployeeId)
    await seedCurrent(businessUnitBId, scenario.foreignEmployeeId, foreignLocationId)

    const put = await putLocation(
      client,
      root,
      scenario.businessUnitA,
      foreignLocationId,
      locationBody({ employeeTeleworkLocationStreet: 'Intento Ajeno 1' })
    )
    put.assertStatus(404)
    assert.equal(put.body().key, 'lugar-no-encontrado')
    assert.equal(put.body().code, 'TWL.NF.LOC.001')

    const removed = await deleteLocation(
      client,
      root,
      scenario.businessUnitA,
      foreignLocationId
    )
    removed.assertStatus(404)
    assert.equal(removed.body().key, 'lugar-no-encontrado')
    assert.equal(removed.body().code, 'TWL.NF.LOC.001')

    // Ni la lista ni el lugar de B cambian.
    const application = await applicationRow(businessUnitBId, scenario.foreignEmployeeId)
    assert.equal(application?.telework_checklist_application_status, 'vigente')

    const location = await locationRow(foreignLocationId)
    assert.equal(Number(location?.employee_telework_location_active), 1)
    assert.isNull(location?.employee_telework_location_deleted_at)
    assert.equal(location?.employee_telework_location_street, 'Calle de Prueba 123')
  })

  test('caso 24 — POST con empleado de la empresa B responde 404 sin crear lugar', async ({
    client,
    assert,
  }) => {
    const response = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.foreignEmployeeId,
      ...locationBody({ employeeTeleworkLocationStreet: 'Intento Ajeno 2' }),
    })

    response.assertStatus(404)
    assert.equal(response.body().key, 'empleado-no-encontrado')
    assert.equal(response.body().code, 'TWL.NF.EMP.001')
    assert.equal(
      await countLocations(scenario.businessUnitB.businessUnitId, scenario.foreignEmployeeId),
      0
    )
  })

  test('CA-11 — el campo está presente y es booleano en 201/200 de las tres operaciones', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    const dataKeys = ['teleworkChecklistInvalidated', 'teleworkLocation']

    const created = await postLocation(client, root, scenario.businessUnitA, {
      employeeId: scenario.pedroId,
      ...locationBody({ employeeTeleworkLocationStreet: 'Nuevo 1' }),
    })
    created.assertStatus(201)
    assert.isBoolean(created.body().data.teleworkChecklistInvalidated)
    assert.deepEqual(Object.keys(created.body().data).sort(), dataKeys)
    assert.notProperty(created.body(), 'detail')

    const updated = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Nuevo 2' }),
    })
    updated.assertStatus(200)
    assert.isBoolean(updated.body().data.teleworkChecklistInvalidated)
    assert.deepEqual(Object.keys(updated.body().data).sort(), dataKeys)

    const removed = await deleteLocation(client, root, scenario.businessUnitA, locationId)
    removed.assertStatus(200)
    assert.isBoolean(removed.body().data.teleworkChecklistInvalidated)
    assert.deepEqual(Object.keys(removed.body().data).sort(), dataKeys)
  })

  test('CA-13 — el autor de la invalidación es el de la sesión, no el del body', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await putLocation(client, root, scenario.businessUnitA, locationId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' }),
      actorUserId: 999999,
      invalidatedByUserId: 999999,
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_invalidated_by_user_id, root.user.userId)
    assert.notEqual(row?.telework_checklist_application_invalidated_by_user_id, 999999)
  })

  test('CA-15 — un businessUnitId de B en el body de un PUT de A solo cambia A', async ({
    client,
    assert,
  }) => {
    const businessUnitAId = scenario.businessUnitA.businessUnitId
    const businessUnitBId = scenario.businessUnitB.businessUnitId
    const locationAId = await insertLocation(businessUnitAId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })
    await seedCurrent(businessUnitAId, scenario.pedroId, locationAId)

    const locationBId = await insertLocation(businessUnitBId, scenario.foreignEmployeeId)
    await seedCurrent(businessUnitBId, scenario.foreignEmployeeId, locationBId)

    const response = await putLocation(client, bothUnits, scenario.businessUnitA, locationAId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' }),
      businessUnitId: scenario.businessUnitB.businessUnitPublicId,
    })

    response.assertStatus(200)
    assert.isTrue(response.body().data.teleworkChecklistInvalidated)

    const applicationA = await applicationRow(businessUnitAId, scenario.pedroId)
    assert.equal(applicationA?.telework_checklist_application_status, 'invalidada')

    const applicationB = await applicationRow(businessUnitBId, scenario.foreignEmployeeId)
    assert.equal(applicationB?.telework_checklist_application_status, 'vigente')
    assert.isNull(applicationB?.telework_checklist_application_invalidated_at)

    const foreignLocation = await locationRow(locationBId)
    assert.equal(foreignLocation?.employee_telework_location_street, 'Calle de Prueba 123')
  })

  test('CA-16 — el PUT repetido no reinvalida y el DELETE repetido responde 404', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Av. Juárez 15',
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const body = locationBody({ employeeTeleworkLocationStreet: 'Av. Juárez 16' })
    const first = await putLocation(client, root, scenario.businessUnitA, locationId, body)
    first.assertStatus(200)
    assert.isTrue(first.body().data.teleworkChecklistInvalidated)

    const invalidated = await applicationRow(businessUnitId, scenario.pedroId)

    const repeated = await putLocation(client, root, scenario.businessUnitA, locationId, body)
    repeated.assertStatus(200)
    assert.isFalse(repeated.body().data.teleworkChecklistInvalidated)

    const afterRepeat = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(
      String(afterRepeat?.telework_checklist_application_invalidated_at),
      String(invalidated?.telework_checklist_application_invalidated_at)
    )

    const removed = await deleteLocation(client, root, scenario.businessUnitA, locationId)
    removed.assertStatus(200)

    const removedAgain = await deleteLocation(client, root, scenario.businessUnitA, locationId)
    removedAgain.assertStatus(404)
    assert.equal(removedAgain.body().key, 'lugar-no-encontrado')
    assert.equal(removedAgain.body().code, 'TWL.NF.LOC.001')

    const afterDelete = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(
      String(afterDelete?.telework_checklist_application_invalidated_at),
      String(invalidated?.telework_checklist_application_invalidated_at)
    )
    assert.equal(
      afterDelete?.telework_checklist_application_invalidated_by_user_id,
      invalidated?.telework_checklist_application_invalidated_by_user_id
    )
  })

  test('RF4 — PUT sobre un lugar ya dado de baja responde 404 sin invalidar', async ({
    client,
    assert,
  }) => {
    const businessUnitId = scenario.businessUnitA.businessUnitId
    const locationId = await insertLocation(businessUnitId, scenario.pedroId)
    const deadId = await insertLocation(businessUnitId, scenario.pedroId, {
      street: 'Calle Baja 3',
      active: false,
    })
    await seedCurrent(businessUnitId, scenario.pedroId, locationId)

    const response = await putLocation(client, root, scenario.businessUnitA, deadId, {
      ...locationBody({ employeeTeleworkLocationStreet: 'Calle Baja 4' }),
    })

    response.assertStatus(404)
    assert.equal(response.body().key, 'lugar-no-encontrado')
    assert.equal(response.body().code, 'TWL.NF.LOC.001')

    const row = await applicationRow(businessUnitId, scenario.pedroId)
    assert.equal(row?.telework_checklist_application_status, 'vigente')
  })

  test('RF5 — actor con membresía en A y B: el empleado de B con header de A responde 404', async ({
    client,
    assert,
  }) => {
    const businessUnitAId = scenario.businessUnitA.businessUnitId
    const businessUnitBId = scenario.businessUnitB.businessUnitId

    const locationAId = await insertLocation(businessUnitAId, scenario.pedroId)
    await seedCurrent(businessUnitAId, scenario.pedroId, locationAId)

    const locationBId = await insertLocation(businessUnitBId, scenario.foreignEmployeeId)
    await seedCurrent(businessUnitBId, scenario.foreignEmployeeId, locationBId)

    // `businessScope()` fija el alcance en la empresa del header (ver la nota de
    // RF5 en el encabezado del archivo): el empleado de B queda fuera y ninguna
    // lista se toca. La desviación respecto al plan está reportada.
    const response = await postLocation(client, bothUnits, scenario.businessUnitA, {
      employeeId: scenario.foreignEmployeeId,
      ...locationBody({
        employeeTeleworkLocationStreet: 'Calle Fija Ajena 900',
        employeeTeleworkLocationIsFixedAgreed: true,
      }),
    })

    response.assertStatus(404)
    assert.equal(response.body().key, 'empleado-no-encontrado')
    assert.equal(response.body().code, 'TWL.NF.EMP.001')

    const applicationA = await applicationRow(businessUnitAId, scenario.pedroId)
    assert.equal(applicationA?.telework_checklist_application_status, 'vigente')

    const applicationB = await applicationRow(businessUnitBId, scenario.foreignEmployeeId)
    assert.equal(applicationB?.telework_checklist_application_status, 'vigente')

    assert.equal(await countLocations(businessUnitBId, scenario.foreignEmployeeId), 1)
  })
})

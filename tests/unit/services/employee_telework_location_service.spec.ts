import { Settings, DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole } from '#tests/helpers/ensure_role'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'
import {
  TELEWORK_CHECKLIST_ANSWER_RESULT,
  TELEWORK_CHECKLIST_INVALIDATION_REASONS,
} from '#constants/telework_checklist'
import { EMPLOYEE_WORK_SCHEDULE, type EmployeeWorkSchedule } from '#constants/employee_work_schedule'
import { TELEWORK_COMPLIANCE_DEFAULTS } from '#constants/telework_compliance_setting'
import TeleworkChecklistService from '#modules/telework-checklist/telework_checklist.service'
import { teleworkChecklistCreateValidator } from '#modules/telework-checklist/validators/telework_checklist_create.validator'
import { updateEmployeeTeleworkLocationValidator } from '#validators/employee_telework_location'
import EmployeeTeleworkLocationService from '#services/employee_telework_location_service'
import type { TeleworkLocationPayload } from '#services/employee_telework_location_service'
import type { TeleworkComplianceSettingEffective } from '../../../app/interfaces/telework_compliance_setting_interface.js'

/**
 * Spec unitario del flujo transaccional del servicio de lugares de teletrabajo
 * (VLRH-H1791306078668, Tarea 3).
 *
 * Cubre los 7 casos del brief: la atomicidad con puerto falso (mitad unit de
 * CA-12), el actor intacto al puerto (CA-13), el lugar ligado muerto (CA-10, la
 * otra mitad del residual de `#register`), el país omitido en el `PUT`
 * (Review Focus 1), la lista ligada a un lugar de otro colaborador
 * (Review Focus 2) y los dos fijos activos previos (Review Focus 3), más el
 * camino frío con el campo `teleworkChecklistInvalidated` presente.
 *
 * Fixtures: molde de `tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts`
 * (empresas A/B, actores con email único por timestamp, colaboradores y lugares
 * por tabla, vigente sembrada con `registerVisit` y cleanup explícito) con los
 * insertadores de `tests/functional/telework_checklist.spec.ts:146-258`. Nada de
 * esos archivos se edita: se copia el patrón.
 *
 * Las llamadas al servicio van envueltas en `TenantContext.run([buA, buB])`
 * porque `Employee` y `EmployeeTeleworkLocation` llevan el mixin de empresa y,
 * fuera de una petición HTTP y sin contexto, lanzan
 * `TenantContextMissingException`. El «reloj» se fija con `Settings.now` de
 * luxon (2026-12-15 12:00 CDMX) para que las vigentes sembradas sean
 * deterministas.
 */

const TEST_PASSWORD = 'TeleworkLocationServiceTest123!'
const BUSINESS_ZONE = 'America/Mexico_City'
const FIXED_NOW = DateTime.fromISO('2026-12-15T12:00:00', { zone: BUSINESS_ZONE })
/** Fecha de la visita sembrada: pasada respecto al reloj fijo, no futura. */
const APPLIED_AT = '2026-11-10'

interface TestActor {
  user: User
  person: Person
}

interface RawCatalogItemRow {
  telework_checklist_item_id: number
  telework_checklist_item_code: string
}

interface RawApplicationRow {
  telework_checklist_application_status: string
  telework_checklist_application_invalidation_reason: string | null
  telework_checklist_application_invalidated_at: Date | null
  telework_checklist_application_invalidated_by_user_id: number | null
  employee_telework_location_id: number | null
}

interface RawLocationRow {
  employee_telework_location_id: number
  employee_telework_location_street: string
  employee_telework_location_country: string
  employee_telework_location_is_fixed_agreed: number | boolean
  employee_telework_location_active: number | boolean
  employee_telework_location_deleted_at: Date | null
}

interface LocationSeed {
  street?: string
  country?: string
  isFixedAgreed?: boolean
  active?: boolean
  createdAt?: Date
}

interface AnswerShape {
  itemId: number
  result: (typeof TELEWORK_CHECKLIST_ANSWER_RESULT)[keyof typeof TELEWORK_CHECKLIST_ANSWER_RESULT]
}

/** Falso inyectable de `TeleworkComplianceSettingService` (solo `getEffective`). */
class FakeComplianceSettingService {
  async getEffective(_businessUnitId: number): Promise<TeleworkComplianceSettingEffective> {
    return {
      ...TELEWORK_COMPLIANCE_DEFAULTS,
      revalidationPeriodMonths: 12,
      isDefault: true,
      teleworkComplianceSettingId: null,
      updatedAt: null,
      updatedByName: null,
    }
  }
}

async function createTestActor(prefix: string, secondLastname: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `twl-service-${prefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkLocation'
  person.personLastname = 'Service'
  person.personSecondLastname = secondLastname
  person.personEmail = email
  await person.save()

  const role = await ensureRole('root')
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

async function cleanupTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `TeleworkLocation Service ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `telework-location-service-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `TeleworkLocation Service ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

/**
 * Inserta un colaborador por tabla (sin hooks de alta del modelo). Persona,
 * departamento y puesto van por modelo, dentro de `TenantContext` porque lo
 * exige el mixin.
 */
async function insertEmployee(
  businessUnitId: number,
  schedule: EmployeeWorkSchedule,
  prefix: string
): Promise<{ employeeId: number; personId: number }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const code = `TWL-${prefix}-${stamp}`.slice(0, 40)

  return TenantContext.run([businessUnitId], async () => {
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'TeleworkLocation',
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
      employee_last_name: 'TeleworkLocation',
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

    return { employeeId: Number(inserted[0]), personId: person.personId }
  })
}

/** Inserta un lugar de teletrabajo por tabla; `active=false` lo deja dado de baja. */
async function insertTeleworkLocation(
  businessUnitId: number,
  employeeId: number,
  seed: LocationSeed = {}
): Promise<number> {
  const active = seed.active ?? true
  const inserted = await db.table('employee_telework_locations').insert({
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    employee_telework_location_type: 'home',
    employee_telework_location_street: seed.street ?? 'Calle de Prueba 123',
    employee_telework_location_external_number: '15',
    employee_telework_location_settlement: 'Centro',
    employee_telework_location_city: 'Ciudad de México',
    employee_telework_location_state: 'Ciudad de México',
    employee_telework_location_country: seed.country ?? 'México',
    employee_telework_location_zipcode: '06000',
    employee_telework_location_is_fixed_agreed: seed.isFixedAgreed ?? false,
    employee_telework_location_has_internet: true,
    employee_telework_location_has_adequate_equipment: true,
    employee_telework_location_active: active,
    employee_telework_location_created_at: seed.createdAt ?? new Date(),
    employee_telework_location_deleted_at: active ? null : new Date(),
  })
  return Number(inserted[0])
}

async function listActiveCatalogItems(): Promise<RawCatalogItemRow[]> {
  return db
    .from('telework_checklist_items')
    .where('telework_checklist_item_is_active', true)
    .orderBy('telework_checklist_item_order', 'asc')
    .select('telework_checklist_item_id', 'telework_checklist_item_code')
}

async function readApplication(applicationId: number): Promise<RawApplicationRow | undefined> {
  return db
    .from('telework_checklist_applications')
    .where('telework_checklist_application_id', applicationId)
    .first() as Promise<RawApplicationRow | undefined>
}

async function readLocation(locationId: number): Promise<RawLocationRow | undefined> {
  return db
    .from('employee_telework_locations')
    .where('employee_telework_location_id', locationId)
    .first() as Promise<RawLocationRow | undefined>
}

async function countActiveFixedLocations(employeeId: number): Promise<number> {
  const row = await db
    .from('employee_telework_locations')
    .where('employee_id', employeeId)
    .where('employee_telework_location_is_fixed_agreed', true)
    .where('employee_telework_location_active', true)
    .whereNull('employee_telework_location_deleted_at')
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

/** Baja lógica por SQL bruto (simula el lugar verificado ya dado de baja antes de la HU). */
async function deactivateLocation(locationId: number): Promise<void> {
  await db
    .from('employee_telework_locations')
    .where('employee_telework_location_id', locationId)
    .update({
      employee_telework_location_active: false,
      employee_telework_location_deleted_at: new Date(),
    })
}

/** Repunta por SQL el lugar que verificó la lista (dato anómalo o carrera de `#register`). */
async function repointApplicationLocation(applicationId: number, locationId: number): Promise<void> {
  await db
    .from('telework_checklist_applications')
    .where('telework_checklist_application_id', applicationId)
    .update({ employee_telework_location_id: locationId })
}

/** Captura una excepción y falla si la operación terminó bien. */
async function expectFailure(fn: () => Promise<unknown>): Promise<unknown> {
  let caught: unknown
  try {
    await fn()
  } catch (error) {
    caught = error
  }
  if (caught === undefined) {
    throw new Error('Se esperaba una excepción y la operación terminó bien')
  }
  return caught
}

test.group('EmployeeTeleworkLocationService — flujo transaccional del cambio de lugar', (group) => {
  let actor: TestActor
  let secondActor: TestActor
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let buA: number
  let buB: number
  let catalogItems: RawCatalogItemRow[]
  let fake: FakeComplianceSettingService
  let realChecklist: TeleworkChecklistService
  let service: EmployeeTeleworkLocationService

  group.setup(async () => {
    Settings.now = () => FIXED_NOW.toMillis()

    businessUnitA = await createBusinessUnit('a')
    businessUnitB = await createBusinessUnit('b')
    buA = businessUnitA.businessUnitId
    buB = businessUnitB.businessUnitId

    actor = await createTestActor('actor', 'Uno')
    secondActor = await createTestActor('actor-two', 'Dos')

    catalogItems = await listActiveCatalogItems()

    fake = new FakeComplianceSettingService()
    realChecklist = new TeleworkChecklistService(fake)
    service = new EmployeeTeleworkLocationService(realChecklist)
  })

  group.each.teardown(async () => {
    await db.from('telework_checklist_answers').whereIn('business_unit_id', [buA, buB]).delete()
    await db.from('telework_checklist_applications').whereIn('business_unit_id', [buA, buB]).delete()
  })

  group.teardown(async () => {
    Settings.now = () => Date.now()

    await db.from('telework_checklist_answers').whereIn('business_unit_id', [buA, buB]).delete()
    await db.from('telework_checklist_applications').whereIn('business_unit_id', [buA, buB]).delete()
    await db.from('employee_telework_locations').whereIn('business_unit_id', [buA, buB]).delete()
    await db.from('employees').whereIn('business_unit_id', [buA, buB]).delete()
    // Borrado físico por tabla y por empresa: `Person` lleva `SoftDeletes`, así
    // que el `delete()` del modelo dejaría la fila y bloquearía el borrado de la
    // empresa por la FK `people_business_unit_id_foreign`.
    await db.from('people').whereIn('business_unit_id', [buA, buB]).delete()
    await cleanupOrgChartFixtures(buA)
    await cleanupOrgChartFixtures(buB)
    await BusinessUnit.query().whereIn('business_unit_id', [buA, buB]).delete()
    await cleanupTestActor(actor)
    await cleanupTestActor(secondActor)
  })

  /** Corre una operación del servicio con el contexto de empresa del mixin activo. */
  function inTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run([buA, buB], fn)
  }

  /** Teletrabajador híbrido nuevo por caso (aislamiento entre casos). */
  async function seedTeleworker(prefix: string, businessUnitId: number = buA): Promise<number> {
    const employee = await insertEmployee(businessUnitId, EMPLOYEE_WORK_SCHEDULE.HYBRID, prefix)
    return employee.employeeId
  }

  /**
   * Payload del `PUT`/`POST` tal como lo entrega el controller: pasa por el
   * validador real, así que lo que no se declara no llega al servicio (RF1). Los
   * campos del domicilio que no se sobrescriben coinciden con los sembrados por
   * `insertTeleworkLocation`, para que «el mismo domicilio» sea el mismo de
   * verdad al comparar los 8 campos.
   */
  async function buildPayload(
    overrides: Record<string, unknown> = {}
  ): Promise<TeleworkLocationPayload> {
    return updateEmployeeTeleworkLocationValidator.validate({
      employeeTeleworkLocationType: 'home',
      employeeTeleworkLocationStreet: 'Calle Base 1',
      employeeTeleworkLocationExternalNumber: '15',
      employeeTeleworkLocationSettlement: 'Centro',
      employeeTeleworkLocationCity: 'Ciudad de México',
      employeeTeleworkLocationState: 'Ciudad de México',
      employeeTeleworkLocationZipcode: '06000',
      employeeTeleworkLocationIsFixedAgreed: false,
      employeeTeleworkLocationHasInternet: true,
      employeeTeleworkLocationHasAdequateEquipment: true,
      ...overrides,
    })
  }

  function buildAnswers(items: RawCatalogItemRow[]): AnswerShape[] {
    return items.map((item) => ({
      itemId: item.telework_checklist_item_id,
      result: TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT,
    }))
  }

  /** Siembra la lista vigente del colaborador con `registerVisit`. */
  async function seedCurrentVisit(
    employeeId: number,
    prefix: string,
    teleworkLocationId: number | null,
    businessUnitId: number = buA
  ): Promise<number> {
    const input = await teleworkChecklistCreateValidator.validate({
      employeeId,
      appliedAt: APPLIED_AT,
      inspectorName: `Inspector ${prefix}`,
      answers: buildAnswers(catalogItems),
      ...(teleworkLocationId === null ? {} : { teleworkLocationId }),
    })
    const detail = await realChecklist.registerVisit(businessUnitId, input, actor.user.userId)
    return detail.applicationId
  }

  test('Caso 1 — atomicidad: si el puerto lanza, el lugar, el fijo y la lista quedan como estaban', async ({
    assert,
  }) => {
    const pedroId = await seedTeleworker('atomic')
    const verifiedStreet = 'Calle Verificada 100'
    const linkedId = await insertTeleworkLocation(buA, pedroId, {
      street: verifiedStreet,
      isFixedAgreed: true,
    })
    const otherFixedId = await insertTeleworkLocation(buA, pedroId, {
      street: 'Calle Vieja 50',
      isFixedAgreed: true,
    })
    const applicationId = await seedCurrentVisit(pedroId, 'atomic', linkedId)

    // Puerto real con `invalidateCurrent` sobrescrito: la invalidación falla
    // después de que el lugar ya se escribió y el otro fijo ya se desmarcó.
    const failingChecklist = new TeleworkChecklistService(fake)
    failingChecklist.invalidateCurrent = async () => {
      throw new Error('boom')
    }
    const failingService = new EmployeeTeleworkLocationService(failingChecklist)
    const payload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Nueva 999',
      employeeTeleworkLocationIsFixedAgreed: true,
    })

    const caught = await expectFailure(() =>
      inTenantScope(() => failingService.update(linkedId, payload, [buA], actor.user.userId))
    )
    assert.equal((caught as Error).message, 'boom')

    // El lugar conserva su domicilio original y sigue vivo.
    const linkedRow = await readLocation(linkedId)
    assert.equal(linkedRow?.employee_telework_location_street, verifiedStreet)
    assert.isTrue(Boolean(linkedRow?.employee_telework_location_active))
    assert.isNull(linkedRow?.employee_telework_location_deleted_at)

    // El desmarcado de los otros fijos también se revirtió: no quedó nada a medias.
    const otherFixedRow = await readLocation(otherFixedId)
    assert.isTrue(Boolean(otherFixedRow?.employee_telework_location_is_fixed_agreed))
    assert.equal(await countActiveFixedLocations(pedroId), 2)

    // La lista sigue vigente y sin rastro de la invalidación fallida.
    const application = await readApplication(applicationId)
    assert.equal(application?.telework_checklist_application_status, 'vigente')
    assert.isNull(application?.telework_checklist_application_invalidated_at)
    assert.isNull(application?.telework_checklist_application_invalidated_by_user_id)
  })

  test('Caso 2 — el actor llega intacto al puerto en create, update y softDelete (CA-13)', async ({
    assert,
  }) => {
    const calls: { actorUserId: number; reason: string }[] = []
    const spyChecklist: Pick<
      TeleworkChecklistService,
      'findCurrentEffective' | 'invalidateCurrent'
    > = {
      findCurrentEffective: realChecklist.findCurrentEffective.bind(realChecklist),
      invalidateCurrent: async (businessUnitId, employeeId, reason, actorUserId, trx) => {
        calls.push({ actorUserId, reason })
        return realChecklist.invalidateCurrent(businessUnitId, employeeId, reason, actorUserId, trx)
      },
    }
    const spyService = new EmployeeTeleworkLocationService(spyChecklist)

    // (a) update que invalida: el actor de la sesión es el segundo actor.
    const updateEmployeeId = await seedTeleworker('actor-update')
    const fixedUpdateId = await insertTeleworkLocation(buA, updateEmployeeId, {
      street: 'Calle Fija Update',
      isFixedAgreed: true,
    })
    const updateApplicationId = await seedCurrentVisit(updateEmployeeId, 'actor-update', null)
    const updatePayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Fija Update Bis',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const updateResult = await inTenantScope(() =>
      spyService.update(fixedUpdateId, updatePayload, [buA], secondActor.user.userId)
    )

    assert.isTrue(updateResult.ok)
    assert.equal(updateResult.teleworkChecklistInvalidated, true)
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].actorUserId, secondActor.user.userId)
    assert.equal(calls[0].reason, TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE)
    const updateApplication = await readApplication(updateApplicationId)
    assert.equal(updateApplication?.telework_checklist_application_status, 'invalidada')
    assert.equal(
      Number(updateApplication?.telework_checklist_application_invalidated_by_user_id),
      secondActor.user.userId
    )

    // (b) create que invalida: primer actor.
    const createEmployeeId = await seedTeleworker('actor-create')
    await insertTeleworkLocation(buA, createEmployeeId, {
      street: 'Calle Fija Create',
      isFixedAgreed: true,
    })
    const createApplicationId = await seedCurrentVisit(createEmployeeId, 'actor-create', null)
    const createPayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Nueva Create',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const createResult = await inTenantScope(() =>
      spyService.create(createEmployeeId, createPayload, [buA], actor.user.userId)
    )

    assert.isTrue(createResult.ok)
    assert.equal(createResult.teleworkChecklistInvalidated, true)
    assert.lengthOf(calls, 2)
    assert.equal(calls[1].actorUserId, actor.user.userId)
    const createApplication = await readApplication(createApplicationId)
    assert.equal(
      Number(createApplication?.telework_checklist_application_invalidated_by_user_id),
      actor.user.userId
    )

    // (c) softDelete que invalida: segundo actor otra vez.
    const deleteEmployeeId = await seedTeleworker('actor-delete')
    const fixedDeleteId = await insertTeleworkLocation(buA, deleteEmployeeId, {
      street: 'Calle Fija Delete',
      isFixedAgreed: true,
    })
    const deleteApplicationId = await seedCurrentVisit(deleteEmployeeId, 'actor-delete', null)
    const deleteResult = await inTenantScope(() =>
      spyService.softDelete(fixedDeleteId, [buA], secondActor.user.userId)
    )

    assert.isTrue(deleteResult.ok)
    assert.equal(deleteResult.teleworkChecklistInvalidated, true)
    assert.lengthOf(calls, 3)
    assert.equal(calls[2].actorUserId, secondActor.user.userId)
    const deleteApplication = await readApplication(deleteApplicationId)
    assert.equal(deleteApplication?.telework_checklist_application_status, 'invalidada')
    assert.equal(
      Number(deleteApplication?.telework_checklist_application_invalidated_by_user_id),
      secondActor.user.userId
    )

    assert.deepEqual(
      calls.map((call) => call.actorUserId),
      [secondActor.user.userId, actor.user.userId, secondActor.user.userId]
    )
  })

  test('Caso 3 — lugar ligado muerto: la referencia cae al fijo y decide como CA-07 (CA-10)', async ({
    assert,
  }) => {
    const pedroId = await seedTeleworker('dead-linked')
    const linkedId = await insertTeleworkLocation(buA, pedroId, { street: 'Calle Ligada 3' })
    const fixedId = await insertTeleworkLocation(buA, pedroId, {
      street: 'Calle Fija 3',
      isFixedAgreed: true,
    })
    const applicationId = await seedCurrentVisit(pedroId, 'dead-linked', linkedId)

    // El lugar verificado ya estaba dado de baja antes de la HU.
    await deactivateLocation(linkedId)
    const deadRow = await readLocation(linkedId)
    assert.isFalse(Boolean(deadRow?.employee_telework_location_active))

    const payload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Fija 3 Bis',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const result = await inTenantScope(() => service.update(fixedId, payload, [buA], actor.user.userId))

    assert.isTrue(result.ok)
    assert.equal(result.teleworkChecklistInvalidated, true)
    const fixedRow = await readLocation(fixedId)
    assert.equal(fixedRow?.employee_telework_location_street, 'Calle Fija 3 Bis')
    const application = await readApplication(applicationId)
    assert.equal(application?.telework_checklist_application_status, 'invalidada')
    assert.equal(
      application?.telework_checklist_application_invalidation_reason,
      'cambio_de_domicilio'
    )
  })

  test('Caso 4 — Review Focus 1: el PUT sin país reescribe «México» e invalida', async ({ assert }) => {
    const pedroId = await seedTeleworker('country')
    const locationId = await insertTeleworkLocation(buA, pedroId, {
      street: 'Calle País 4',
      country: 'España',
    })
    const applicationId = await seedCurrentVisit(pedroId, 'country', locationId)

    const payload = await buildPayload({ employeeTeleworkLocationStreet: 'Calle País 4' })
    assert.isUndefined(payload.employeeTeleworkLocationCountry)

    const result = await inTenantScope(() => service.update(locationId, payload, [buA], actor.user.userId))

    assert.isTrue(result.ok)
    assert.equal(result.teleworkChecklistInvalidated, true)
    const row = await readLocation(locationId)
    assert.equal(row?.employee_telework_location_country, 'México')
    const application = await readApplication(applicationId)
    assert.equal(application?.telework_checklist_application_status, 'invalidada')
  })

  test('Caso 5 — Review Focus 2: la lista ligada a un lugar de otro colaborador no se compara contra él', async ({
    assert,
  }) => {
    const pedroId = await seedTeleworker('foreign')
    const otherWorker = await insertEmployee(buA, EMPLOYEE_WORK_SCHEDULE.HYBRID, 'foreign-other')
    const fixedId = await insertTeleworkLocation(buA, pedroId, {
      street: 'Calle Fija 5',
      isFixedAgreed: true,
    })
    // Lugar vivo de OTRO colaborador de la misma empresa, con el domicilio al
    // que se moverá el fijo: aunque coincida, nunca entra en la comparación.
    const foreignId = await insertTeleworkLocation(buA, otherWorker.employeeId, {
      street: 'Calle Nueva 5',
    })
    const applicationId = await seedCurrentVisit(pedroId, 'foreign', fixedId)
    await repointApplicationLocation(applicationId, foreignId)
    const repointed = await readApplication(applicationId)
    assert.equal(repointed?.employee_telework_location_id, foreignId)

    const payload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Nueva 5',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const result = await inTenantScope(() => service.update(fixedId, payload, [buA], actor.user.userId))

    // Sin el filtro por colaborador, el id ajeno caería a la rama «other» de
    // `linked/update` (el fijo previo ya era fijo) y NO invalidaría.
    assert.isTrue(result.ok)
    assert.equal(result.teleworkChecklistInvalidated, true)
    const application = await readApplication(applicationId)
    assert.equal(application?.telework_checklist_application_status, 'invalidada')
    const foreignRow = await readLocation(foreignId)
    assert.equal(foreignRow?.employee_telework_location_street, 'Calle Nueva 5')
  })

  test('Caso 6 — Review Focus 3: con dos fijos activos, la referencia es el más reciente por fecha e id', async ({
    assert,
  }) => {
    const olderCreatedAt = DateTime.fromISO('2026-11-01T10:00:00', { zone: BUSINESS_ZONE }).toJSDate()
    const newerCreatedAt = DateTime.fromISO('2026-11-02T10:00:00', { zone: BUSINESS_ZONE }).toJSDate()

    // (a) PUT al fijo más reciente (referencia) cambiando su domicilio.
    const recentEmployeeId = await seedTeleworker('two-fixed-recent')
    await insertTeleworkLocation(buA, recentEmployeeId, {
      street: 'Calle Vieja 6',
      isFixedAgreed: true,
      createdAt: olderCreatedAt,
    })
    const recentId = await insertTeleworkLocation(buA, recentEmployeeId, {
      street: 'Calle Reciente 6',
      isFixedAgreed: true,
      createdAt: newerCreatedAt,
    })
    const recentApplicationId = await seedCurrentVisit(recentEmployeeId, 'two-fixed-recent', null)

    const recentPayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Reciente 6 Bis',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const recentResult = await inTenantScope(() =>
      service.update(recentId, recentPayload, [buA], actor.user.userId)
    )

    assert.isTrue(recentResult.ok)
    assert.equal(recentResult.teleworkChecklistInvalidated, true)
    const recentApplication = await readApplication(recentApplicationId)
    assert.equal(recentApplication?.telework_checklist_application_status, 'invalidada')

    // (b) PUT al fijo viejo con domicilio distinto también invalida.
    const oldEmployeeId = await seedTeleworker('two-fixed-old')
    const oldId = await insertTeleworkLocation(buA, oldEmployeeId, {
      street: 'Calle Vieja 6B',
      isFixedAgreed: true,
      createdAt: olderCreatedAt,
    })
    await insertTeleworkLocation(buA, oldEmployeeId, {
      street: 'Calle Reciente 6B',
      isFixedAgreed: true,
      createdAt: newerCreatedAt,
    })
    const oldApplicationId = await seedCurrentVisit(oldEmployeeId, 'two-fixed-old', null)

    const oldPayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Vieja 6B Bis',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const oldResult = await inTenantScope(() =>
      service.update(oldId, oldPayload, [buA], actor.user.userId)
    )

    assert.isTrue(oldResult.ok)
    assert.equal(oldResult.teleworkChecklistInvalidated, true)
    const oldApplication = await readApplication(oldApplicationId)
    assert.equal(oldApplication?.telework_checklist_application_status, 'invalidada')

    // (c) Desempate por id: mismo `created_at`, gana el id mayor como referencia.
    const tieEmployeeId = await seedTeleworker('two-fixed-tie')
    const tieCreatedAt = DateTime.fromISO('2026-11-03T10:00:00', { zone: BUSINESS_ZONE }).toJSDate()
    const lowerId = await insertTeleworkLocation(buA, tieEmployeeId, {
      street: 'Calle Empate 6',
      isFixedAgreed: true,
      createdAt: tieCreatedAt,
    })
    const higherId = await insertTeleworkLocation(buA, tieEmployeeId, {
      street: 'Calle Empate Referencia 6',
      isFixedAgreed: true,
      createdAt: tieCreatedAt,
    })
    assert.isBelow(lowerId, higherId)
    const tieApplicationId = await seedCurrentVisit(tieEmployeeId, 'two-fixed-tie', null)

    const tiePayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Empate Referencia 6',
      employeeTeleworkLocationIsFixedAgreed: true,
    })
    const tieResult = await inTenantScope(() =>
      service.update(lowerId, tiePayload, [buA], actor.user.userId)
    )

    // Con la referencia en el id mayor, el domicilio editado queda igual al de
    // la referencia: no invalida. Si el desempate tomara el id menor, el
    // `before.id === R.id` compararía contra el domicilio viejo e invalidaría.
    assert.isTrue(tieResult.ok)
    assert.equal(tieResult.teleworkChecklistInvalidated, false)
    const tieApplication = await readApplication(tieApplicationId)
    assert.equal(tieApplication?.telework_checklist_application_status, 'vigente')
  })

  test('Caso 7 — camino frío: sin invalidación el campo viaja en false y la lista sigue vigente', async ({
    assert,
  }) => {
    // (a) create de un lugar no fijo (coworking) con vigente ligada.
    const pedroId = await seedTeleworker('cold')
    const linkedId = await insertTeleworkLocation(buA, pedroId, { street: 'Calle Verificada 7' })
    const applicationId = await seedCurrentVisit(pedroId, 'cold', linkedId)

    const payload = await buildPayload({
      employeeTeleworkLocationType: 'coworking',
      employeeTeleworkLocationStreet: 'Calle Coworking 7',
      employeeTeleworkLocationIsFixedAgreed: false,
    })
    const created = await inTenantScope(() =>
      service.create(pedroId, payload, [buA], actor.user.userId)
    )

    assert.isTrue(created.ok)
    assert.equal(created.teleworkChecklistInvalidated, false)
    assert.isDefined(created.location?.employeeTeleworkLocationId)
    const coldApplication = await readApplication(applicationId)
    assert.equal(coldApplication?.telework_checklist_application_status, 'vigente')

    // (b) sin lista vigente el campo también viaja (false), no `undefined`.
    const noListEmployeeId = await seedTeleworker('cold-no-list')
    const noListPayload = await buildPayload({
      employeeTeleworkLocationStreet: 'Calle Sin Lista 7',
    })
    const withoutList = await inTenantScope(() =>
      service.create(noListEmployeeId, noListPayload, [buA], actor.user.userId)
    )

    assert.isTrue(withoutList.ok)
    assert.equal(withoutList.teleworkChecklistInvalidated, false)

    // (c) softDelete de un lugar que no es la referencia: false y lista vigente.
    const otherDeleteId = await insertTeleworkLocation(buA, pedroId, { street: 'Calle Otra 7' })
    const deleted = await inTenantScope(() =>
      service.softDelete(otherDeleteId, [buA], actor.user.userId)
    )

    assert.isTrue(deleted.ok)
    assert.equal(deleted.teleworkChecklistInvalidated, false)
    const afterDelete = await readApplication(applicationId)
    assert.equal(afterDelete?.telework_checklist_application_status, 'vigente')
  })
})

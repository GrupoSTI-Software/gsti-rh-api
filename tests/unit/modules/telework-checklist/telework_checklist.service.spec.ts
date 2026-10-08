import { Settings, DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole } from '#tests/helpers/ensure_role'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'
import {
  TELEWORK_CHECKLIST_ANSWER_RESULT,
  TELEWORK_CHECKLIST_APPLICATION_STATUS,
  TELEWORK_CHECKLIST_INVALIDATION_REASONS,
  effectiveStatus,
} from '#constants/telework_checklist'
import { TELEWORK_CHECKLIST_ERROR_CODES } from '#constants/telework_checklist_error_codes'
import { EMPLOYEE_WORK_SCHEDULE, type EmployeeWorkSchedule } from '#constants/employee_work_schedule'
import { TELEWORK_COMPLIANCE_DEFAULTS } from '#constants/telework_compliance_setting'
import TeleworkChecklistError from '#modules/telework-checklist/telework_checklist.error'
import type { TeleworkChecklistErrorKey } from '#modules/telework-checklist/telework_checklist.error'
import TeleworkChecklistService from '#modules/telework-checklist/telework_checklist.service'
import { teleworkChecklistCreateValidator } from '#modules/telework-checklist/validators/telework_checklist_create.validator'
import type { TeleworkComplianceSettingEffective } from '../../../../app/interfaces/telework_compliance_setting_interface.js'

/**
 * Spec unitario del servicio de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870, Tarea 3).
 *
 * Cubre los 13 objetivos del brief y los Review Focus 1, 3 y 5 del plan. Las
 * llamadas al servicio van SIN `TenantContext` (Review Focus 5: el adaptador
 * filtra `business_unit_id` explícito y sirve al cron); los fixtures que usan
 * modelos con el mixin van envueltos en `TenantContext.run`. Los actores usan
 * email único por timestamp y el cleanup es explícito (molde
 * `tests/unit/services/telework_compliance_setting_service.spec.ts`).
 *
 * El «reloj» se fija con `Settings.now` de luxon: fijado 2026-12-15 12:00
 * (CDMX), las fechas del brief (p. ej. 2026-11-10) no quedan en el futuro y el
 * borde del vencimiento (Review Focus 3) es determinista.
 *
 * El error de dominio no carga el `code` (lo mapea el controller en la Tarea 4);
 * por eso el spec ata cada `key` con su `code` con el mapa `CODE_BY_KEY`, espejo
 * del `ERROR_STATUS_BY_KEY` que la Tarea 4 construye.
 */

const TEST_PASSWORD = 'TeleworkChecklistTest123!'
const BUSINESS_ZONE = 'America/Mexico_City'
const FIXED_NOW = DateTime.fromISO('2026-12-15T12:00:00', { zone: BUSINESS_ZONE })
const TODAY = FIXED_NOW.startOf('day')
const TODAY_ISO = TODAY.toISODate() ?? ''
const YESTERDAY_ISO = TODAY.minus({ days: 1 }).toISODate() ?? ''
const TOMORROW_ISO = TODAY.plus({ days: 1 }).toISODate() ?? ''

/** `key` de dominio → `code` estable (espejo del mapa del controller, Tarea 4). */
const CODE_BY_KEY: Record<TeleworkChecklistErrorKey, string> = {
  'respuestas-incompletas': TELEWORK_CHECKLIST_ERROR_CODES.INCOMPLETE_ANSWERS,
  'respuesta-duplicada': TELEWORK_CHECKLIST_ERROR_CODES.DUPLICATED_ANSWER,
  'punto-no-reconocido': TELEWORK_CHECKLIST_ERROR_CODES.UNKNOWN_ITEM,
  'fecha-de-aplicacion-invalida': TELEWORK_CHECKLIST_ERROR_CODES.INVALID_APPLIED_AT,
  'visitador-requerido': TELEWORK_CHECKLIST_ERROR_CODES.INSPECTOR_REQUIRED,
  'lugar-de-teletrabajo-invalido': TELEWORK_CHECKLIST_ERROR_CODES.INVALID_LOCATION,
  'solo-teletrabajadores': TELEWORK_CHECKLIST_ERROR_CODES.GATING_ONLY_TELEWORKERS,
  'colaborador-no-encontrado': TELEWORK_CHECKLIST_ERROR_CODES.EMPLOYEE_NOT_FOUND,
  'aplicacion-no-encontrada': TELEWORK_CHECKLIST_ERROR_CODES.APPLICATION_NOT_FOUND,
  'aplicacion-concurrente': TELEWORK_CHECKLIST_ERROR_CODES.CONCURRENT_APPLICATION,
}

interface TestActor {
  user: User
  person: Person
}

interface RawCatalogItemRow {
  telework_checklist_item_id: number
  telework_checklist_item_code: string
}

interface RawApplicationRow {
  telework_checklist_application_id: number
  telework_checklist_application_status: string
  telework_checklist_application_expires_at: string | Date
}

interface AnswerShape {
  itemId: number
  result: (typeof TELEWORK_CHECKLIST_ANSWER_RESULT)[keyof typeof TELEWORK_CHECKLIST_ANSWER_RESULT]
  observation?: string
}

/** Falso inyectable de `TeleworkComplianceSettingService` (solo `getEffective`). */
class FakeComplianceSettingService {
  periodMonths = 12

  async getEffective(_businessUnitId: number): Promise<TeleworkComplianceSettingEffective> {
    return {
      ...TELEWORK_COMPLIANCE_DEFAULTS,
      revalidationPeriodMonths: this.periodMonths,
      isDefault: true,
      teleworkComplianceSettingId: null,
      updatedAt: null,
      updatedByName: null,
    }
  }
}

async function createTestActor(): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `twc-actor-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkChecklist'
  person.personLastname = 'Test'
  person.personSecondLastname = 'Actor'
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
  businessUnit.businessUnitName = `TeleworkChecklist ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `telework-checklist-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `TeleworkChecklist ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

/**
 * Inserta un colaborador por tabla (sin hooks de alta del modelo: el spec no
 * necesita rama/bitácora). Persona, departamento y puesto sí van por modelo,
 * dentro de `TenantContext` porque lo exige el mixin.
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
      employee_slug: `twc-${prefix}-${stamp}`,
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

async function listActiveCatalogItems(): Promise<RawCatalogItemRow[]> {
  return db
    .from('telework_checklist_items')
    .where('telework_checklist_item_is_active', true)
    .orderBy('telework_checklist_item_order', 'asc')
    .select('telework_checklist_item_id', 'telework_checklist_item_code')
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

async function readApplication(applicationId: number): Promise<RawApplicationRow | undefined> {
  return db
    .from('telework_checklist_applications')
    .where('telework_checklist_application_id', applicationId)
    .first() as Promise<RawApplicationRow | undefined>
}

/** Fija el `expires_at` de una aplicación por SQL crudo (simula el paso del tiempo). */
async function forceExpiresAt(applicationId: number, isoDay: string): Promise<void> {
  await db
    .from('telework_checklist_applications')
    .where('telework_checklist_application_id', applicationId)
    .update({ telework_checklist_application_expires_at: isoDay })
}

/** Captura un error del servicio y falla si es de otro tipo. */
async function expectServiceError(fn: () => Promise<unknown>): Promise<TeleworkChecklistError> {
  let caught: unknown
  try {
    await fn()
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof TeleworkChecklistError)) {
    throw caught ?? new Error('Se esperaba TeleworkChecklistError')
  }
  return caught
}

/** Une cada `key` con su `code` esperado (el error de dominio no carga el code). */
function assertKeyAndCode(assert: Assert, error: TeleworkChecklistError, key: TeleworkChecklistErrorKey): void {
  assert.equal(error.key, key)
  assert.equal(CODE_BY_KEY[error.key], CODE_BY_KEY[key])
}

function buildAnswers(items: RawCatalogItemRow[], nonCompliantItemId?: number): AnswerShape[] {
  return items.map((item) => ({
    itemId: item.telework_checklist_item_id,
    result:
      item.telework_checklist_item_id === nonCompliantItemId
        ? TELEWORK_CHECKLIST_ANSWER_RESULT.NON_COMPLIANT
        : TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT,
  }))
}

test.group('TeleworkChecklistService — núcleo de la lista de verificación de teletrabajo', (group) => {
  let actor: TestActor
  let businessUnitA: BusinessUnit
  let businessUnitB: BusinessUnit
  let buA: number
  let buB: number
  let pedroId: number
  let rosaId: number
  let pedroBId: number
  let liveLocationId: number
  let deadLocationId: number
  let items: RawCatalogItemRow[]
  let fake: FakeComplianceSettingService
  let service: TeleworkChecklistService

  group.setup(async () => {
    Settings.now = () => FIXED_NOW.toMillis()

    businessUnitA = await createBusinessUnit('a')
    businessUnitB = await createBusinessUnit('b')
    buA = businessUnitA.businessUnitId
    buB = businessUnitB.businessUnitId

    actor = await createTestActor()
    const pedro = await insertEmployee(buA, EMPLOYEE_WORK_SCHEDULE.HYBRID, 'pedro')
    const rosa = await insertEmployee(buA, EMPLOYEE_WORK_SCHEDULE.ONSITE, 'rosa')
    const pedroB = await insertEmployee(buB, EMPLOYEE_WORK_SCHEDULE.REMOTE, 'pedrob')
    pedroId = pedro.employeeId
    rosaId = rosa.employeeId
    pedroBId = pedroB.employeeId

    liveLocationId = await insertTeleworkLocation(buA, pedroId, true)
    deadLocationId = await insertTeleworkLocation(buA, pedroId, false)

    items = await listActiveCatalogItems()

    fake = new FakeComplianceSettingService()
    service = new TeleworkChecklistService(fake)
  })

  group.each.setup(() => {
    fake.periodMonths = 12
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
    const employees = (await db
      .from('employees')
      .whereIn('business_unit_id', [buA, buB])
      .select('person_id')) as { person_id: number }[]
    const personIds = employees.map((row) => Number(row.person_id))
    await db.from('employees').whereIn('business_unit_id', [buA, buB]).delete()
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
    await cleanupOrgChartFixtures(buA)
    await cleanupOrgChartFixtures(buB)
    await BusinessUnit.query().whereIn('business_unit_id', [buA, buB]).delete()
    await cleanupTestActor(actor)
  })

  function buildVisit(overrides: Record<string, unknown> = {}) {
    return teleworkChecklistCreateValidator.validate({
      employeeId: pedroId,
      appliedAt: '2026-11-10',
      inspectorName: 'Inspector de la Comisión',
      answers: buildAnswers(items),
      ...overrides,
    })
  }

  test('Objetivo: CA-1 — una visita con un punto que no cumple queda vigente, no aprobada, con vencimiento a 12 meses', async ({
    assert,
  }) => {
    const nonCompliant = items[0].telework_checklist_item_id
    const input = await buildVisit({ answers: buildAnswers(items, nonCompliant) })

    const detail = await service.registerVisit(buA, input, actor.user.userId)

    assert.equal(detail.mode, 'visita_csh')
    assert.equal(detail.status, 'vigente')
    assert.equal(detail.overallResult, 'no_aprobada')
    assert.equal(detail.revalidationPeriodMonths, 12)
    assert.equal(detail.appliedAt, '2026-11-10')
    assert.equal(detail.expiresAt, '2027-11-10')
    assert.equal(detail.appliedByUserId, actor.user.userId)

    const answers = await db
      .from('telework_checklist_answers')
      .where('telework_checklist_application_id', detail.applicationId)
      .count('* as total')
      .first()
    assert.equal(Number(answers?.total ?? 0), items.length)
    assert.equal(items.length, 7)
  })

  test('Objetivo: Review Focus 3 — el vencimiento cae en fin de mes sin desbordar', async ({
    assert,
  }) => {
    fake.periodMonths = 6
    const input = await buildVisit({ appliedAt: '2026-08-31' })

    const detail = await service.registerVisit(buA, input, actor.user.userId)

    const expected = DateTime.fromISO('2026-08-31', { zone: BUSINESS_ZONE })
      .plus({ months: 6 })
      .toISODate()
    assert.equal(expected, '2027-02-28')
    assert.equal(detail.expiresAt, '2027-02-28')
    assert.equal(detail.revalidationPeriodMonths, 6)
  })

  test('Objetivo: CA-2 — el vencimiento es snapshot: cambiar la periodicidad de la empresa no mueve lo ya calculado', async ({
    assert,
  }) => {
    const first = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    assert.equal(first.expiresAt, '2027-11-10')
    assert.equal(first.revalidationPeriodMonths, 12)

    fake.periodMonths = 6
    const current = await service.getCurrentByEmployee(buA, pedroId)
    assert.isNotNull(current)
    assert.equal(current?.expiresAt, '2027-11-10')
    assert.equal(current?.revalidationPeriodMonths, 12)

    const second = await service.registerVisit(
      buA,
      await buildVisit({ appliedAt: '2026-11-20' }),
      actor.user.userId
    )
    assert.equal(second.expiresAt, '2027-05-20')
    assert.equal(second.revalidationPeriodMonths, 6)
  })

  test('Objetivo: CA-3 — registrar de nuevo deja la anterior reemplazada y la nueva vigente', async ({
    assert,
  }) => {
    const first = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    const second = await service.registerVisit(
      buA,
      await buildVisit({ appliedAt: '2026-11-20' }),
      actor.user.userId
    )

    const firstRow = await readApplication(first.applicationId)
    assert.equal(firstRow?.telework_checklist_application_status, 'reemplazada')

    const listed = await service.listByEmployee(buA, pedroId)
    assert.equal(listed.employeeId, pedroId)
    assert.equal(listed.current?.applicationId, second.applicationId)
    assert.lengthOf(listed.history, 2)
    assert.deepEqual(
      listed.history.map((row) => row.applicationId),
      [second.applicationId, first.applicationId]
    )
    assert.equal(listed.history[0].status, 'vigente')
    assert.equal(listed.history[1].status, 'reemplazada')
  })

  test('Objetivo: CA-3 — una vigente pasada de fecha se reporta vencida y no cuenta como current', async ({
    assert,
  }) => {
    const visit = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    await forceExpiresAt(visit.applicationId, YESTERDAY_ISO)

    const current = await service.getCurrentByEmployee(buA, pedroId)
    assert.isNull(current)

    const listed = await service.listByEmployee(buA, pedroId)
    assert.isNull(listed.current)
    assert.lengthOf(listed.history, 1)
    assert.equal(listed.history[0].status, 'vencida')
  })

  test('Objetivo: CA-3 — re registrar sobre una vigente vencida la materializa como vencida, no reemplazada', async ({
    assert,
  }) => {
    const first = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    await forceExpiresAt(first.applicationId, YESTERDAY_ISO)

    const second = await service.registerVisit(
      buA,
      await buildVisit({ appliedAt: '2026-11-20' }),
      actor.user.userId
    )

    const firstRow = await readApplication(first.applicationId)
    assert.equal(firstRow?.telework_checklist_application_status, 'vencida')

    const secondRow = await readApplication(second.applicationId)
    assert.equal(secondRow?.telework_checklist_application_status, 'vigente')
  })

  test('Objetivo: CA-4 — respuestas incompletas, duplicadas o desconocidas no dejan rastro', async ({
    assert,
  }) => {
    const answers = buildAnswers(items)

    // Faltantes.
    const beforeApps = await countApplications(buA)
    const beforeAnswers = await countAnswers(buA)
    const missingValidated = await buildVisit({ answers: answers.slice(0, -1) })
    const missingDomainError = await expectServiceError(() =>
      service.registerVisit(buA, missingValidated, actor.user.userId)
    )
    assert.equal(missingDomainError.key, 'respuestas-incompletas')
    assert.equal(CODE_BY_KEY[missingDomainError.key], 'TWC.VAL.002')
    assert.deepEqual(missingDomainError.details?.missingItemCodes, [items[items.length - 1].telework_checklist_item_code])
    assert.equal(await countApplications(buA), beforeApps)
    assert.equal(await countAnswers(buA), beforeAnswers)

    // Duplicado.
    const duplicatedValidated = await buildVisit({ answers: [...answers, { ...answers[0] }] })
    const duplicatedError = await expectServiceError(() =>
      service.registerVisit(buA, duplicatedValidated, actor.user.userId)
    )
    assert.equal(duplicatedError.key, 'respuesta-duplicada')
    assert.equal(CODE_BY_KEY[duplicatedError.key], 'TWC.VAL.003')
    assert.equal(duplicatedError.details?.itemCode, items[0].telework_checklist_item_code)
    assert.equal(await countApplications(buA), beforeApps)
    assert.equal(await countAnswers(buA), beforeAnswers)

    // Desconocido.
    const unknownValidated = await buildVisit({
      answers: [...answers, { itemId: 999999, result: TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT }],
    })
    const unknownError = await expectServiceError(() =>
      service.registerVisit(buA, unknownValidated, actor.user.userId)
    )
    assert.equal(unknownError.key, 'punto-no-reconocido')
    assert.equal(CODE_BY_KEY[unknownError.key], 'TWC.VAL.004')
    assert.equal(unknownError.details?.itemId, 999999)
    assert.equal(await countApplications(buA), beforeApps)
    assert.equal(await countAnswers(buA), beforeAnswers)
  })

  test('Objetivo: CA-5 — fecha futura, visitador ausente y lugar inválido se rechazan sin escribir', async ({
    assert,
  }) => {
    const before = await countApplications(buA)

    const futureInput = await buildVisit({ appliedAt: TOMORROW_ISO })
    const futureError = await expectServiceError(() =>
      service.registerVisit(buA, futureInput, actor.user.userId)
    )
    assertKeyAndCode(assert, futureError, 'fecha-de-aplicacion-invalida')
    assert.equal(CODE_BY_KEY[futureError.key], 'TWC.VAL.005')
    assert.equal(await countApplications(buA), before)

    const blankInspectorInput = await buildVisit({ inspectorName: '   ' })
    const blankInspector = await expectServiceError(() =>
      service.registerVisit(buA, blankInspectorInput, actor.user.userId)
    )
    assertKeyAndCode(assert, blankInspector, 'visitador-requerido')
    assert.equal(CODE_BY_KEY[blankInspector.key], 'TWC.VAL.006')
    assert.equal(await countApplications(buA), before)

    const deadLocationInput = await buildVisit({ teleworkLocationId: deadLocationId })
    const deadLocation = await expectServiceError(() =>
      service.registerVisit(buA, deadLocationInput, actor.user.userId)
    )
    assertKeyAndCode(assert, deadLocation, 'lugar-de-teletrabajo-invalido')
    assert.equal(CODE_BY_KEY[deadLocation.key], 'TWC.VAL.007')

    const foreignLocation = await insertTeleworkLocation(buA, rosaId, true)
    const foreignLocationInput = await buildVisit({ teleworkLocationId: foreignLocation })
    const otherLocation = await expectServiceError(() =>
      service.registerVisit(buA, foreignLocationInput, actor.user.userId)
    )
    assertKeyAndCode(assert, otherLocation, 'lugar-de-teletrabajo-invalido')
    assert.equal(await countApplications(buA), before)

    // El lugar vivo del propio colaborador sí resuelve.
    const liveLocationInput = await buildVisit({ teleworkLocationId: liveLocationId })
    const ok = await service.registerVisit(buA, liveLocationInput, actor.user.userId)
    assert.equal(ok.teleworkLocationId, liveLocationId)
  })

  test('Objetivo: CA-6 y Review Focus 1 — el presencial no recibe lista, pero su historial previo sigue consultable', async ({
    assert,
  }) => {
    const onsiteInput = await buildVisit({ employeeId: rosaId })
    const onsiteError = await expectServiceError(() =>
      service.registerVisit(buA, onsiteInput, actor.user.userId)
    )
    assertKeyAndCode(assert, onsiteError, 'solo-teletrabajadores')
    assert.equal(CODE_BY_KEY[onsiteError.key], 'TWC.VAL.GATING.001')

    // Historial previo de un presencial, sembrado por SQL.
    const seeded = await db.table('telework_checklist_applications').insert({
      business_unit_id: buA,
      employee_id: rosaId,
      employee_telework_location_id: null,
      telework_checklist_application_mode: 'autoaplicada',
      telework_checklist_application_status: 'vigente',
      telework_checklist_application_overall_result: 'aprobada',
      telework_checklist_application_applied_at: '2026-10-01',
      telework_checklist_application_revalidation_period_months: 12,
      telework_checklist_application_expires_at: '2027-10-01',
      telework_checklist_application_applied_by_user_id: actor.user.userId,
      telework_checklist_application_created_at: new Date(),
    })

    const listed = await service.listByEmployee(buA, rosaId)
    assert.equal(listed.employeeId, rosaId)
    assert.lengthOf(listed.history, 1)
    assert.equal(listed.history[0].applicationId, Number(seeded[0]))
    assert.equal(listed.current?.applicationId, Number(seeded[0]))
  })

  test('Objetivo: CA-9 — lo de otra empresa se comporta como inexistente', async ({ assert }) => {
    const employeeError = await expectServiceError(() => service.listByEmployee(buA, pedroBId))
    assertKeyAndCode(assert, employeeError, 'colaborador-no-encontrado')
    assert.equal(CODE_BY_KEY[employeeError.key], 'TWC.NF.001')

    const foreignApplication = await service.registerVisit(
      buB,
      await teleworkChecklistCreateValidator.validate({
        employeeId: pedroBId,
        appliedAt: '2026-11-10',
        inspectorName: 'Inspector B',
        answers: buildAnswers(items),
      }),
      actor.user.userId
    )

    const applicationError = await expectServiceError(() =>
      service.detail(buA, foreignApplication.applicationId)
    )
    assertKeyAndCode(assert, applicationError, 'aplicacion-no-encontrada')
    assert.equal(CODE_BY_KEY[applicationError.key], 'TWC.NF.002')
  })

  test('Objetivo: CA-12 — invalidateCurrent invalida con autor y motivo, o no hace nada sin vigente', async ({
    assert,
  }) => {
    const visit = await service.registerVisit(buA, await buildVisit(), actor.user.userId)

    // (a) Con vigente, dentro de una transacción abierta a propósito.
    let invalidated = null as Awaited<ReturnType<TeleworkChecklistService['invalidateCurrent']>>
    await db.transaction(async (trx) => {
      invalidated = await service.invalidateCurrent(
        buA,
        pedroId,
        TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE,
        actor.user.userId,
        trx
      )
    })

    assert.isNotNull(invalidated)
    assert.equal(invalidated?.applicationId, visit.applicationId)
    assert.equal(invalidated?.status, 'invalidada')
    assert.equal(invalidated?.invalidationReason, 'cambio_de_domicilio')

    const invalidatedRow = await readApplication(visit.applicationId)
    assert.equal(invalidatedRow?.telework_checklist_application_status, 'invalidada')
    const rawInvalidated = await db
      .from('telework_checklist_applications')
      .where('telework_checklist_application_id', visit.applicationId)
      .select('telework_checklist_application_invalidated_at', 'telework_checklist_application_invalidation_reason', 'telework_checklist_application_invalidated_by_user_id')
      .first()
    assert.isNotNull(rawInvalidated?.telework_checklist_application_invalidated_at)
    assert.equal(rawInvalidated?.telework_checklist_application_invalidation_reason, 'cambio_de_domicilio')
    assert.equal(Number(rawInvalidated?.telework_checklist_application_invalidated_by_user_id), actor.user.userId)

    // (b) Sin vigente: null sin escribir.
    const nothing = await service.invalidateCurrent(
      buA,
      pedroId,
      TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE,
      actor.user.userId
    )
    assert.isNull(nothing)

    // (c) Con vigente persistida ya vencida: se materializa vencida y devuelve null.
    const second = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    await forceExpiresAt(second.applicationId, YESTERDAY_ISO)

    const expired = await service.invalidateCurrent(
      buA,
      pedroId,
      TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE,
      actor.user.userId
    )
    assert.isNull(expired)
    const secondRow = await readApplication(second.applicationId)
    assert.equal(secondRow?.telework_checklist_application_status, 'vencida')
  })

  test('Objetivo: CA-11 y Review Focus 5 — la BD rechaza dos vigentes del mismo empleado', async ({
    assert,
  }) => {
    await service.registerVisit(buA, await buildVisit(), actor.user.userId)

    let caught: unknown
    try {
      await db.table('telework_checklist_applications').insert({
        business_unit_id: buA,
        employee_id: pedroId,
        employee_telework_location_id: null,
        telework_checklist_application_mode: 'autoaplicada',
        telework_checklist_application_status: 'vigente',
        telework_checklist_application_overall_result: 'aprobada',
        telework_checklist_application_applied_at: '2026-11-15',
        telework_checklist_application_revalidation_period_months: 12,
        telework_checklist_application_expires_at: '2027-11-15',
        telework_checklist_application_applied_by_user_id: actor.user.userId,
        telework_checklist_application_created_at: new Date(),
      })
    } catch (error) {
      caught = error
    }

    assert.isDefined(caught)
    assert.equal((caught as { code?: string }).code, 'ER_DUP_ENTRY')
  })

  test('Objetivo: Review Focus 3 — el borde: vence el día siguiente, no el mismo día', async ({
    assert,
  }) => {
    assert.equal(
      effectiveStatus(
        { status: TELEWORK_CHECKLIST_APPLICATION_STATUS.CURRENT, expiresAt: TODAY },
        TODAY
      ),
      'vigente'
    )
    assert.equal(
      effectiveStatus(
        {
          status: TELEWORK_CHECKLIST_APPLICATION_STATUS.CURRENT,
          expiresAt: TODAY.minus({ days: 1 }),
        },
        TODAY
      ),
      'vencida'
    )

    // Lectura de servicio sobre una fila en el borde: `expires_at == hoy` sigue vigente.
    const visit = await service.registerVisit(buA, await buildVisit(), actor.user.userId)
    await forceExpiresAt(visit.applicationId, TODAY_ISO)

    const current = await service.getCurrentByEmployee(buA, pedroId)
    assert.isNotNull(current)
    assert.equal(current?.applicationId, visit.applicationId)
    assert.equal(current?.status, 'vigente')
  })
})

import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AccessPointEmployeeEvent, {
  ACCESS_POINT_EMPLOYEE_EVENT_KIND,
} from '#models/access_point_employee_event'
import AccessPointResyncPending from '#models/access_point_resync_pending'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import EmployeeService from '#services/employee_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import OffboardingsService from '#modules/employee-offboarding/offboardings/offboardings.service'
import ResyncPendingService from '#modules/access-point/employee-sync/resync_pending.service'
import { ACCESS_POINT_RESYNC_RESOLUTION } from '#modules/access-point/employee-sync/resync_pending.constants'
import {
  EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE,
  REFERENCE_DATE_SOURCE,
  type EmployeeOffboardingDocumentType,
} from '#modules/employee-offboarding/documents/documents.constants'
import {
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { toCalendarIsoDate } from '#utils/business_date'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1790812613829 — reactivar es deshacer la baja: todo o nada, cupo
 * primero, código original, copia de los datos de baja en el expediente,
 * dentro de la empresa de la sesión. Punta a punta por HTTP; la baja se hace
 * por el `DELETE` real (abre el expediente en automático). Asserts sobre
 * filas propias, nunca conteos absolutos.
 *
 * VLRH-H1791055794596 (segundo grupo) — R2 de VLRH-C0040: una salida ya
 * concretada (expediente cerrado, o constancia/convenio emitidos) no se
 * deshace; 409 sin efectos. Los documentos se siembran por inserción directa,
 * sin renderizar PDF.
 *
 * VLRH-H1790812613830 (tercer grupo) — al deshacer la baja, el expediente
 * abierto queda `cancelled` con quién y cuándo, conserva todo lo registrado y
 * la falla de la cancelación revierte la reactivación completa.
 *
 * VLRH-H1790812613831 (cuarto grupo) — al deshacer la baja quedan marcados los
 * checadores de los que ESA baja sacó a la persona; la marca se recalcula en la
 * siguiente reactivación y su falla revierte todo.
 */

const TEST_PASSWORD = 'DeshacerBaja123!'
const D = '2026-09-15'
const MODALITY = 'Renuncia'
const TERMINATION_TYPE = 'Cambio de Residencia'
const EMPLOYEES_MODULE_SLUG = 'employees'
const OFFBOARDINGS_TABLE = 'employee_offboardings'
const NOT_FOUND_BODY = {
  type: 'warning',
  title: 'The employee was not found',
  message: 'The employee was not found with the entered ID',
}

/** Fuera de una petición el filtro de empresa lanza: las fixtures se declaran como excepción de prueba. */
function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Deshacer baja ${label} ${s}`,
    businessUnitSlug: `deshacer-baja-${label}-${s}`,
    businessUnitLegalName: `Deshacer baja ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

interface TerminationSeed {
  date: string
  modality: string
  type: string
}

/** Colaborador activo con el código dado; con `termination`, con registro de baja pero sin borrado lógico. */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  code: string,
  termination: TerminationSeed | null = null
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Reactivar',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `deshacer-baja-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = code
  employee.employeeFirstName = 'Reactivar'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `DB-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  employee.employeeTerminatedDate = null
  await employee.save()
  if (termination) {
    await db
      .from('employees')
      .where('employee_id', employee.employeeId)
      .update({
        employee_terminated_date: `${termination.date} 00:00:00`,
        employee_termination_modality: termination.modality,
        employee_termination_type: termination.type,
      })
  }
  return { employee, person }
}

interface Actor {
  user: User
  person: Person
  role: Role | null
}

async function createRootActor(units: BusinessUnit[]): Promise<Actor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  return createActor(role, units, false)
}

/** Usuario de la empresa con SOLO los permisos indicados del módulo de empleados. */
async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Deshacer baja ${s}`,
    roleSlug: `deshacer-baja-${s}`,
    roleDescription: 'Rol temporal del spec de la reactivación',
    roleActive: 1,
    businessUnitId: unit.businessUnitId,
    roleManagementDays: 10,
  })
  for (const slug of permissionSlugs) {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', slug)
      .whereHas('systemModule', (query) =>
        query
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
      )
      .firstOrFail()
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }
  return createActor(role, [unit], true)
}

async function createActor(role: Role, units: BusinessUnit[], ownsRole: boolean): Promise<Actor> {
  const s = stamp()
  const email = `deshacer-baja-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'DeshacerBaja',
    personSecondLastname: s,
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
  await user.related('businessUnits').attach(units.map((unit) => unit.businessUnitId))
  return { user, person, role: ownsRole ? role : null }
}

/** Body equivalente al eco del BO para el `PUT` de la ficha. */
function bodyFor(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
  const employee = fixture.employee
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

/** `PUT …/reactivate` con la cabecera de la empresa dada; nunca lanza por 4xx/5xx. */
function reactivateRequest(
  client: ApiClient,
  fixture: EmployeeFixture,
  actor: Actor,
  unit: BusinessUnit
) {
  return client
    .put(`/api/employees/${fixture.employee.employeeId}/reactivate`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', unit.businessUnitPublicId)
    .setup((request) => {
      request.request.ok(() => true)
    })
}

/** Baja real por HTTP con D: abre el expediente en automático (o reutiliza el programado). */
async function terminateRequest(
  client: ApiClient,
  fixture: EmployeeFixture,
  actor: Actor,
  unit: BusinessUnit
): Promise<void> {
  const response = await client
    .delete(`/api/employees/${fixture.employee.employeeId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', unit.businessUnitPublicId)
    .json({
      employeeTerminatedDate: D,
      employeeTerminationModality: MODALITY,
      employeeTerminationType: TERMINATION_TYPE,
    })
  response.assertStatus(201)
}

/** Fila del colaborador tal como está en BD (fecha de baja como `yyyy-MM-dd HH:mm:ss`). */
async function employeeRow(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select(
      'employee_code',
      'employee_deleted_at',
      'employee_termination_modality',
      'employee_termination_type',
      db.raw("DATE_FORMAT(employee_terminated_date, '%Y-%m-%d %H:%i:%s') AS terminated_date")
    )
    .first()
}

/** Expedientes del colaborador con su copia de la baja. */
async function offboardingRows(employeeId: number) {
  return db
    .from(OFFBOARDINGS_TABLE)
    .where('employee_id', employeeId)
    .select(
      'employee_offboarding_id',
      'employee_offboarding_status',
      'employee_offboarding_origin',
      'employee_offboarding_termination_date',
      'employee_offboarding_termination_modality',
      'employee_offboarding_termination_type',
      'employee_offboarding_closed_at',
      'employee_offboarding_closed_by_user_id',
      'employee_offboarding_cancelled_at',
      'employee_offboarding_cancelled_by_user_id',
      db.raw("DATE_FORMAT(employee_offboarding_updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at")
    )
    .orderBy('employee_offboarding_id')
}

/**
 * Emisión sembrada a mano (molde `employee_offboarding_list_separation_letter.spec.ts`):
 * vigente o reemplazada, viva o borrada, sin renderizar PDF.
 */
async function createDocument(
  employeeOffboardingId: number,
  type: EmployeeOffboardingDocumentType,
  options: { isCurrent?: boolean; deleted?: boolean } = {}
): Promise<EmployeeOffboardingDocument> {
  const folio = `${type === EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER ? 'CS' : 'CT'}-${employeeOffboardingId}-2026-${stamp()}`
  return await EmployeeOffboardingDocument.create({
    employeeOffboardingId,
    employeeOffboardingDocumentType: type,
    employeeOffboardingDocumentFolio: folio,
    employeeOffboardingDocumentFile: `tests/employee-offboarding-documents/${folio}.pdf`,
    employeeOffboardingDocumentFileName: `${folio}.pdf`,
    employeeOffboardingDocumentSizeBytes: 1024,
    employeeOffboardingDocumentEmployeeName: 'Reactivar Concretada',
    employeeOffboardingDocumentPositionName: null,
    employeeOffboardingDocumentDepartmentName: null,
    employeeOffboardingDocumentLegalName: 'Deshacer baja legal',
    employeeOffboardingDocumentHireDate: DateTime.fromISO('2022-01-10'),
    employeeOffboardingDocumentReferenceDate: DateTime.fromISO(D),
    employeeOffboardingDocumentReferenceDateSource: REFERENCE_DATE_SOURCE.TERMINATED,
    employeeOffboardingDocumentSeniorityDays: 1678,
    employeeOffboardingDocumentContentHash: 'f'.repeat(64),
    employeeOffboardingDocumentIsCurrent: options.isCurrent ?? true,
    employeeOffboardingDocumentSupersededDocumentId: null,
    employeeOffboardingDocumentGeneratedByUserId: null,
    deletedAt: options.deleted ? DateTime.now() : null,
  })
}

async function destroyFixtures(
  fixtures: EmployeeFixture[],
  actors: Actor[],
  units: BusinessUnit[]
): Promise<void> {
  const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
  if (employeeIds.length > 0) {
    const pivotIds = db
      .from(AccessPointEmployee.table)
      .whereIn('employee_id', employeeIds)
      .select('access_point_employee_id')
    await db.from(AccessPointResyncPending.table).whereIn('employee_id', employeeIds).delete()
    await db
      .from(AccessPointEmployeeEvent.table)
      .whereIn('access_point_employee_id', pivotIds)
      .delete()
    await db.from('device_commands').whereIn('employee_id', employeeIds).delete()
    await db.from(AccessPointEmployee.table).whereIn('employee_id', employeeIds).delete()
    const caseIds = db
      .from(OFFBOARDINGS_TABLE)
      .whereIn('employee_id', employeeIds)
      .select('employee_offboarding_id')
    await db
      .from(EmployeeOffboardingItemEvidence.table)
      .whereIn(
        'employee_offboarding_item_id',
        db
          .from(EmployeeOffboardingItem.table)
          .whereIn('employee_offboarding_id', caseIds)
          .select('employee_offboarding_item_id')
      )
      .delete()
    await db
      .from(EmployeeOffboardingItem.table)
      .whereIn('employee_offboarding_id', caseIds)
      .delete()
    await db
      .from('employee_offboarding_documents')
      .whereIn('employee_offboarding_id', caseIds)
      .delete()
    await db.from(OFFBOARDINGS_TABLE).whereIn('employee_id', employeeIds).delete()
    await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
    await db.from('employees').whereIn('employee_id', employeeIds).delete()
    await db
      .from('people')
      .whereIn(
        'person_id',
        fixtures.map((fixture) => fixture.person.personId)
      )
      .delete()
  }
  for (const actor of actors) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await db.from('people').where('person_id', actor.person.personId).delete()
    if (actor.role) {
      await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
      await db.from('roles').where('role_id', actor.role.roleId).delete()
    }
  }
  for (const unit of units) {
    await db
      .from('device_commands')
      .whereIn(
        'access_point_id',
        db
          .from(AccessPoint.table)
          .where('business_unit_id', unit.businessUnitId)
          .select('access_point_id')
      )
      .delete()
    await db.from(AccessPoint.table).where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group(
  'Deshacer la baja — PUT /api/employees/:id/reactivate (VLRH-H1790812613829)',
  (group) => {
    let unit: BusinessUnit
    let foreignUnit: BusinessUnit
    let root: Actor
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []
    const quotaService = new EmployeeQuotaService()

    const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
      const fixture = await asFixture(build)
      fixtures.push(fixture)
      return fixture
    }

    const terminate = (client: ApiClient, fixture: EmployeeFixture, inUnit: BusinessUnit = unit) =>
      terminateRequest(client, fixture, root, inUnit)

    const reactivate = (client: ApiClient, fixture: EmployeeFixture, actor: Actor = root) =>
      reactivateRequest(client, fixture, actor, unit)

    /** Colaborador con el código dado, ya dado de baja por HTTP. */
    const terminatedEmployee = async (client: ApiClient, label: string, code: string) => {
      const fixture = await track(() => createEmployee(unit, label, code))
      await terminate(client, fixture)
      return fixture
    }

    group.setup(async () => {
      await asFixture(async () => {
        unit = await createUnit('empresa')
        foreignUnit = await createUnit('ajena')
        root = await createRootActor([unit, foreignUnit])
        actors.push(root)
      })
    })

    group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit])))

    test('CA-1 y CA-10: deshace la baja completa, copia los datos al expediente y responde solo id y código', async ({
      client,
      assert,
    }) => {
      const code = `A-120-${stamp()}`
      const fixture = await terminatedEmployee(client, 'Completa', code)
      const terminated = await employeeRow(fixture.employee.employeeId)
      assert.isNotNull(terminated.employee_deleted_at)
      assert.match(String(terminated.employee_code), /-IN\d+$/)
      const activeBefore = await quotaService.countActiveEmployees(unit.businessUnitId)

      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      const body = response.body()
      assert.deepEqual(Object.keys(body.data.employee).sort(), ['employeeCode', 'employeeId'])
      assert.equal(body.data.employee.employeeId, fixture.employee.employeeId)
      assert.equal(body.data.employee.employeeCode, code)
      const serialized = JSON.stringify(body)
      assert.notInclude(serialized, 'person')
      assert.notInclude(serialized, MODALITY)
      assert.notInclude(serialized, D)

      const row = await employeeRow(fixture.employee.employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
      assert.isNull(row.employee_termination_type)
      assert.equal(row.employee_code, code)

      const [offboarding] = await offboardingRows(fixture.employee.employeeId)
      assert.equal(toCalendarIsoDate(offboarding.employee_offboarding_termination_date), D)
      assert.equal(offboarding.employee_offboarding_termination_modality, MODALITY)
      assert.equal(offboarding.employee_offboarding_termination_type, TERMINATION_TYPE)

      // Regla 6: vuelve a contar para el cupo
      assert.equal(await quotaService.countActiveEmployees(unit.businessUnitId), activeBefore + 1)
    })

    test('CA-2: un código con -IN interno recupera el original completo', async ({
      client,
      assert,
    }) => {
      const code = `MX-INV-7-${stamp()}`
      const fixture = await terminatedEmployee(client, 'Interno', code)
      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      const reactivatedRow = await employeeRow(fixture.employee.employeeId)
      assert.equal(reactivatedRow.employee_code, code)
    })

    test('CA-3 y CA-4: sin lugar en el cupo o sin plan se rechaza con el error de cupo y nada cambia', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'Cupo', `CUPO-${stamp()}`)
      const before = await employeeRow(fixture.employee.employeeId)
      const [offboardingBefore] = await offboardingRows(fixture.employee.employeeId)
      const original = EmployeeQuotaService.prototype.resolveQuota
      cleanup(() => {
        EmployeeQuotaService.prototype.resolveQuota = original
      })

      // Cupo lleno, relativo al conteo real
      EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
        return { limit: await this.countActiveEmployees(businessUnitId, trx), source: 'legacy' }
      }
      const exceeded = await reactivate(client, fixture)
      exceeded.assertStatus(409)
      const exceededBody = exceeded.body()
      assert.equal(exceededBody.type, 'error')
      assert.equal(exceededBody.key, 'cupo-empleados-agotado')
      assert.equal(exceededBody.code, 'EMP.QUOTA.EXCEEDED')
      assert.isNumber(exceededBody.data.contracted)
      assert.isNumber(exceededBody.data.active)
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      const [offboardingAfterExceeded] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(offboardingAfterExceeded, offboardingBefore)

      // Sin plan vigente
      EmployeeQuotaService.prototype.resolveQuota = async () => ({ limit: 0, source: 'no_plan' })
      const noPlan = await reactivate(client, fixture)
      noPlan.assertStatus(409)
      assert.equal(noPlan.body().key, 'sin-plan-contratado')
      assert.equal(noPlan.body().code, 'EMP.QUOTA.NO_PLAN')
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)

      // Con un lugar libre, el mismo colaborador se reactiva
      EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
        return {
          limit: (await this.countActiveEmployees(businessUnitId, trx)) + 1,
          source: 'legacy',
        }
      }
      const ok = await reactivate(client, fixture)
      ok.assertStatus(200)
      const reactivatedRow = await employeeRow(fixture.employee.employeeId)
      assert.isNull(reactivatedRow.employee_deleted_at)
    })

    test('CA-5: el código ocupado por otro colaborador vivo de la misma empresa rechaza sin identificarlo; en otra empresa no estorba', async ({
      client,
      assert,
    }) => {
      const code = `C-${stamp()}`
      const x = await terminatedEmployee(client, 'Ocupado', code)
      const before = await employeeRow(x.employee.employeeId)
      const y = await track(() => createEmployee(unit, 'Ocupante', code))

      const taken = await reactivate(client, x)
      taken.assertStatus(409)
      const body = taken.body()
      assert.equal(body.type, 'error')
      assert.equal(body.title, 'Código de colaborador ocupado')
      assert.equal(body.key, 'codigo-de-colaborador-ocupado')
      assert.equal(body.code, 'EMP.REACTIVATION.CODE_TAKEN')
      assert.deepEqual(body.data, { employeeCode: code })
      assert.include(body.message, code)
      assert.isNotEmpty(body.detail)
      const serialized = JSON.stringify(body)
      assert.notInclude(serialized, `"${y.employee.employeeId}"`)
      assert.notInclude(serialized, String(y.employee.employeePayrollNum))
      assert.notInclude(serialized, 'Ocupante')
      assert.deepEqual(await employeeRow(x.employee.employeeId), before)
      const [offboarding] = await offboardingRows(x.employee.employeeId)
      assert.isNull(offboarding.employee_offboarding_termination_date)
      assert.isNull(offboarding.employee_offboarding_termination_modality)

      // El mismo código en OTRA empresa no estorba
      await asFixture(async () => {
        await db.from('employees').where('employee_id', y.employee.employeeId).delete()
        await db.from('people').where('person_id', y.person.personId).delete()
      })
      fixtures.splice(fixtures.indexOf(y), 1)
      await track(() => createEmployee(foreignUnit, 'OcupanteAjeno', code))
      const ok = await reactivate(client, x)
      ok.assertStatus(200)
      const restoredRow = await employeeRow(x.employee.employeeId)
      assert.equal(restoredRow.employee_code, code)
    })

    test('CA-6: una falla dentro del hook revierte todo y responde un 500 sin detalle técnico', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'Rollback', `RB-${stamp()}`)
      const before = await employeeRow(fixture.employee.employeeId)
      const original = OffboardingsService.prototype.onEmployeeReactivated
      cleanup(() => {
        OffboardingsService.prototype.onEmployeeReactivated = original
      })
      OffboardingsService.prototype.onEmployeeReactivated = async function (trx, employee, actor) {
        await original.call(this, trx, employee, actor) // escribe la copia…
        throw new Error('fallo simulado sql employees') // …y luego falla
      }

      const response = await reactivate(client, fixture)
      response.assertStatus(500)
      assert.deepEqual(response.body(), {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
      })
      assert.notInclude(JSON.stringify(response.body()), 'fallo simulado')
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      // Sin transacción la copia habría quedado escrita
      const [offboarding] = await offboardingRows(fixture.employee.employeeId)
      assert.isNull(offboarding.employee_offboarding_termination_date)
      assert.isNull(offboarding.employee_offboarding_termination_modality)
      assert.isNull(offboarding.employee_offboarding_termination_type)
    })

    test('CA-7: sin expediente abierto no hay copia, pero el hook corre igual una sola vez', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'SinExpediente', `SE-${stamp()}`)
      await db
        .from(OFFBOARDINGS_TABLE)
        .where('employee_id', fixture.employee.employeeId)
        .update({ employee_offboarding_deleted_at: new Date() })
      const [before] = await offboardingRows(fixture.employee.employeeId)
      const original = OffboardingsService.prototype.onEmployeeReactivated
      cleanup(() => {
        OffboardingsService.prototype.onEmployeeReactivated = original
      })
      let calls = 0
      OffboardingsService.prototype.onEmployeeReactivated = async function (trx, employee, actor) {
        calls += 1
        return original.call(this, trx, employee, actor)
      }

      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      assert.equal(calls, 1)
      const row = await employeeRow(fixture.employee.employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
      const [after] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(after, before)
      assert.isNull(after.employee_offboarding_termination_date)
    })

    test('CA-8: la segunda reactivación responde 404 y una confirmación tardía no escribe nada', async ({
      client,
      assert,
    }) => {
      const fixture = await terminatedEmployee(client, 'Segunda', `SG-${stamp()}`)
      // Instancia leída mientras seguía dado de baja (ya pasó la lectura del controller)
      const stale = await TenantContext.run([unit.businessUnitId], () =>
        Employee.query()
          .withTrashed()
          .where('employee_id', fixture.employee.employeeId)
          .firstOrFail()
      )
      assert.isNotNull(stale.deletedAt)

      const first = await reactivate(client, fixture)
      first.assertStatus(200)
      const activeAfterFirst = await quotaService.countActiveEmployees(unit.businessUnitId)
      const [offboardingAfterFirst] = await offboardingRows(fixture.employee.employeeId)

      const second = await reactivate(client, fixture)
      second.assertStatus(404)
      assert.deepEqual(second.body(), {
        ...NOT_FOUND_BODY,
        data: { employeeId: String(fixture.employee.employeeId) },
      })

      const outcome = await TenantContext.run([unit.businessUnitId], () =>
        new EmployeeService(i18nManager.locale(i18nManager.defaultLocale)).reactivate(stale, null)
      )
      assert.deepEqual(outcome, { kind: 'not-terminated' })
      assert.equal(await quotaService.countActiveEmployees(unit.businessUnitId), activeAfterFirst)
      const [offboardingAfterStale] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(offboardingAfterStale, offboardingAfterFirst)
    })

    test('CA-9: un colaborador dado de baja de otra empresa responde 404 y no cambia', async ({
      client,
      assert,
    }) => {
      const foreign = await track(() => createEmployee(foreignUnit, 'Ajeno', `AJ-${stamp()}`))
      await terminate(client, foreign, foreignUnit)
      const before = await employeeRow(foreign.employee.employeeId)

      // Cabecera de la empresa propia, colaborador de la ajena
      const response = await reactivate(client, foreign)
      response.assertStatus(404)
      assert.deepEqual(response.body(), {
        ...NOT_FOUND_BODY,
        data: { employeeId: String(foreign.employee.employeeId) },
      })
      assert.deepEqual(await employeeRow(foreign.employee.employeeId), before)
    })

    test('CA-13: el permiso de reactivar no relaja el PUT de la ficha, y sí basta para reactivar', async ({
      client,
      assert,
    }) => {
      const employeesModule = await SystemModule.query()
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
        .firstOrFail()
      const originalEnforcement = employeesModule.systemModulePermissionEnforcementActive
      employeesModule.systemModulePermissionEnforcementActive = true
      await employeesModule.save()
      try {
        const actor = await asFixture(() =>
          createTenantActor(unit, ['tab-trabajo-write', 'reactivate-employees'])
        )
        actors.push(actor)

        // Colaborador ACTIVO con fecha de baja programada: quitarla desde la ficha sigue exigiendo delete
        const scheduled = await track(() =>
          createEmployee(unit, 'Programada', `PR-${stamp()}`, {
            date: '2026-12-31',
            modality: MODALITY,
            type: TERMINATION_TYPE,
          })
        )
        const before = await employeeRow(scheduled.employee.employeeId)
        const denied = await client
          .put(`/api/employees/${scheduled.employee.employeeId}`)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', unit.businessUnitPublicId)
          .json(
            bodyFor(scheduled, {
              employeeTerminatedDate: null,
              employeeTerminationModality: null,
              employeeTerminationType: null,
            })
          )
        denied.assertStatus(403)
        assert.equal(denied.body().key, 'PERM.DENIED')
        assert.deepEqual(await employeeRow(scheduled.employee.employeeId), before)

        // Con el mismo rol, reactivar a otro colaborador dado de baja sí pasa
        const terminated = await terminatedEmployee(client, 'ConPermiso', `CP-${stamp()}`)
        const ok = await reactivate(client, terminated, actor)
        ok.assertStatus(200)
        const reactivatedRow = await employeeRow(terminated.employee.employeeId)
        assert.isNull(reactivatedRow.employee_deleted_at)
      } finally {
        employeesModule.systemModulePermissionEnforcementActive = originalEnforcement
        await employeesModule.save()
      }
    })
  }
)

test.group('Salida concretada — R2 al deshacer la baja (VLRH-H1791055794596)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor
  const fixtures: EmployeeFixture[] = []
  const actors: Actor[] = []
  const EXIT_CONCLUDED = {
    type: 'error',
    title: 'La salida ya se concretó',
    key: 'la-salida-ya-se-concreto',
    code: 'EMP.REACTIVATION.EXIT_CONCLUDED',
  }

  const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
    const fixture = await asFixture(build)
    fixtures.push(fixture)
    return fixture
  }

  const reactivate = (client: ApiClient, fixture: EmployeeFixture) =>
    reactivateRequest(client, fixture, root, unit)

  /** Colaborador dado de baja por HTTP (abre su expediente) y su expediente abierto. */
  const terminatedWithCase = async (client: ApiClient, label: string) => {
    const fixture = await track(() => createEmployee(unit, label, `SC-${label}-${stamp()}`))
    await terminateRequest(client, fixture, root, unit)
    const [openCase] = await offboardingRows(fixture.employee.employeeId)
    if (!openCase) throw new Error('la baja debía abrir el expediente')
    return { fixture, offboardingId: Number(openCase.employee_offboarding_id) }
  }

  /** Da por terminado el expediente por el endpoint real. */
  const closeCase = async (client: ApiClient, offboardingId: number) => {
    const response = await client
      .patch(`/api/employee-offboardings/${offboardingId}/close`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
    response.assertStatus(200)
  }

  const assertRejected = (assert: Assert, response: ApiResponse, reason: string) => {
    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.type, EXIT_CONCLUDED.type)
    assert.equal(body.title, EXIT_CONCLUDED.title)
    assert.equal(body.key, EXIT_CONCLUDED.key)
    assert.equal(body.code, EXIT_CONCLUDED.code)
    assert.deepEqual(body.data, { reason })
    assert.include(body.message, 'reincorporación')
    assert.isNotEmpty(body.detail)
    // Confidencialidad: ni folio, ni fecha de emisión, ni importes, ni autor
    const serialized = JSON.stringify(body)
    assert.notInclude(serialized, 'CS-')
    assert.notInclude(serialized, 'CT-')
    assert.notInclude(serialized, 'folio')
  }

  group.setup(async () => {
    await asFixture(async () => {
      unit = await createUnit('concretada')
      foreignUnit = await createUnit('concretada-ajena')
      root = await createRootActor([unit, foreignUnit])
      actors.push(root)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit])))

  test('CA-1: con el expediente dado por terminado y sin otro abierto responde 409 case-closed y nada cambia', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Cerrado')
    await closeCase(client, offboardingId)
    const before = await employeeRow(fixture.employee.employeeId)
    assert.isNotNull(before.employee_deleted_at)
    assert.match(String(before.employee_code), /-IN\d+$/)

    await assertRejected(assert, await reactivate(client, fixture), 'case-closed')

    assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.equal(offboarding.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CLOSED)
    assert.isNull(offboarding.employee_offboarding_termination_date)
    assert.isNull(offboarding.employee_offboarding_termination_modality)
    assert.isNull(offboarding.employee_offboarding_termination_type)
  })

  test('CA-2: con una constancia de separación vigente responde 409 separation-letter-issued y el expediente sigue abierto', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Constancia')
    await createDocument(offboardingId, EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER)
    const before = await employeeRow(fixture.employee.employeeId)

    await assertRejected(assert, await reactivate(client, fixture), 'separation-letter-issued')

    assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.equal(offboarding.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.isNull(offboarding.employee_offboarding_termination_date)
    assert.isNull(offboarding.employee_offboarding_termination_modality)
  })

  test('CA-3: un convenio de terminación reemplazado sigue contando como emitido', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Convenio')
    await createDocument(offboardingId, EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.TERMINATION_AGREEMENT, {
      isCurrent: false,
    })
    const before = await employeeRow(fixture.employee.employeeId)

    await assertRejected(assert, await reactivate(client, fixture), 'termination-agreement-issued')

    assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.isNull(offboarding.employee_offboarding_termination_date)
  })

  test('con constancia y convenio el motivo es el de la constancia (orden fijo del mapa)', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Ambos')
    await createDocument(offboardingId, EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.TERMINATION_AGREEMENT)
    await createDocument(offboardingId, EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER, {
      isCurrent: false,
    })

    await assertRejected(assert, await reactivate(client, fixture), 'separation-letter-issued')
  })

  test('CA-4: un documento borrado no concreta la salida y la reactivación escribe la copia', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Borrado')
    await createDocument(offboardingId, EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER, {
      deleted: true,
    })

    const response = await reactivate(client, fixture)
    response.assertStatus(200)
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNull(row.employee_deleted_at)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.equal(toCalendarIsoDate(offboarding.employee_offboarding_termination_date), D)
    assert.equal(offboarding.employee_offboarding_termination_modality, MODALITY)
  })

  test('CA-5: sin ningún expediente la reactivación sigue su curso', async ({ client, assert }) => {
    // El caso (a), expediente abierto sin documentos, lo cubre CA-1 de VLRH-H1790812613829
    const { fixture } = await terminatedWithCase(client, 'SinExpediente')
    await db.from(OFFBOARDINGS_TABLE).where('employee_id', fixture.employee.employeeId).delete()

    const response = await reactivate(client, fixture)
    response.assertStatus(200)
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNull(row.employee_deleted_at)
    assert.isNull(row.terminated_date)
    assert.lengthOf(await offboardingRows(fixture.employee.employeeId), 0)
  })

  test('CA-6: un expediente cerrado del mismo colaborador en otra empresa no cuenta', async ({
    client,
    assert,
  }) => {
    const { fixture } = await terminatedWithCase(client, 'Ajeno')
    // Sin expediente abierto propio, y una fila cerrada con su employee_id pero de la empresa ajena
    await db
      .from(OFFBOARDINGS_TABLE)
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_offboarding_deleted_at: new Date() })
    await EmployeeOffboarding.create({
      employeeId: fixture.employee.employeeId,
      businessUnitId: foreignUnit.businessUnitId,
      employeeOffboardingPlannedDate: D,
      employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.CLOSED,
      employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
      employeeOffboardingNotes: null,
      employeeOffboardingOpenedByUserId: null,
      employeeOffboardingClosedByUserId: null,
      employeeOffboardingClosedAt: DateTime.now(),
    })

    const response = await reactivate(client, fixture)
    response.assertStatus(200)
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNull(row.employee_deleted_at)
  })

  test('CA-7: con el expediente cerrado y sin lugar en el cupo gana el error de cupo', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'CupoCerrado')
    await closeCase(client, offboardingId)
    const original = EmployeeQuotaService.prototype.resolveQuota
    cleanup(() => {
      EmployeeQuotaService.prototype.resolveQuota = original
    })
    EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
      return { limit: await this.countActiveEmployees(businessUnitId, trx), source: 'legacy' }
    }

    const response = await reactivate(client, fixture)
    response.assertStatus(409)
    assert.equal(response.body().code, 'EMP.QUOTA.EXCEEDED')
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNotNull(row.employee_deleted_at)
  })
})

test.group('Cancelar el expediente al deshacer la baja (VLRH-H1790812613830)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor
  const fixtures: EmployeeFixture[] = []
  const actors: Actor[] = []
  const SERVER_ERROR_BODY = {
    type: 'error',
    title: 'Server error',
    message: 'An unexpected error has occurred on the server',
  }

  const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
    const fixture = await asFixture(build)
    fixtures.push(fixture)
    return fixture
  }

  const reactivate = (client: ApiClient, fixture: EmployeeFixture) =>
    reactivateRequest(client, fixture, root, unit)

  /** Colaborador dado de baja por HTTP con su expediente abierto. */
  const terminatedWithCase = async (client: ApiClient, label: string) => {
    const fixture = await track(() => createEmployee(unit, label, `CX-${label}-${stamp()}`))
    await terminateRequest(client, fixture, root, unit)
    const [openCase] = await offboardingRows(fixture.employee.employeeId)
    if (!openCase) throw new Error('la baja debía abrir el expediente')
    return { fixture, offboardingId: Number(openCase.employee_offboarding_id) }
  }

  const createItem = (offboardingId: number, status: string) =>
    EmployeeOffboardingItem.create({
      employeeOffboardingId: offboardingId,
      offboardingConceptId: null,
      employeeSupplyId: null,
      employeeOffboardingItemName: `Pendiente ${status}`,
      employeeOffboardingItemStatus: status,
      employeeOffboardingItemAmount: null,
      employeeOffboardingItemNote: null,
      employeeOffboardingItemCompletedAt:
        status === EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED ? DateTime.utc() : null,
      employeeOffboardingItemCompletedByUserId: null,
    })

  const itemRows = (offboardingId: number) =>
    db
      .from(EmployeeOffboardingItem.table)
      .where('employee_offboarding_id', offboardingId)
      .select('employee_offboarding_item_id', 'employee_offboarding_item_status')
      .orderBy('employee_offboarding_item_id')

  const evidenceCount = async (offboardingId: number) => {
    const rows = await db
      .from(EmployeeOffboardingItemEvidence.table)
      .whereIn(
        'employee_offboarding_item_id',
        db
          .from(EmployeeOffboardingItem.table)
          .where('employee_offboarding_id', offboardingId)
          .select('employee_offboarding_item_id')
      )
      .whereNull('employee_offboarding_item_evidence_deleted_at')
      .count('* as total')
    return Number(rows[0].total)
  }

  /** Expediente abierto sin rastro de cancelación ni copia de la baja. */
  const assertCaseUntouched = (assert: Assert, row: Record<string, unknown>) => {
    assert.equal(row.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.isNull(row.employee_offboarding_cancelled_at)
    assert.isNull(row.employee_offboarding_cancelled_by_user_id)
    assert.isNull(row.employee_offboarding_termination_date)
    assert.isNull(row.employee_offboarding_termination_modality)
    assert.isNull(row.employee_offboarding_termination_type)
  }

  group.setup(async () => {
    await asFixture(async () => {
      unit = await createUnit('cancelar')
      foreignUnit = await createUnit('cancelar-ajena')
      root = await createRootActor([unit, foreignUnit])
      actors.push(root)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit])))

  test('CA-1: el expediente de la baja queda cancelado con quién y cuándo, y conserva pendientes y evidencias', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Completo')
    const pending = await createItem(offboardingId, EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING)
    await createItem(offboardingId, EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED)
    await EmployeeOffboardingItemEvidence.create({
      employeeOffboardingItemId: pending.employeeOffboardingItemId,
      employeeOffboardingItemEvidenceFile: `tests/evidences/${stamp()}.pdf`,
      employeeOffboardingItemEvidenceOriginalName: 'comprobante.pdf',
    })
    const itemsBefore = await itemRows(offboardingId)

    const response = await reactivate(client, fixture)
    response.assertStatus(200)

    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.equal(offboarding.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.isNotNull(offboarding.employee_offboarding_cancelled_at)
    assert.equal(offboarding.employee_offboarding_cancelled_by_user_id, root.user.userId)
    assert.isNull(offboarding.employee_offboarding_closed_at)
    assert.isNull(offboarding.employee_offboarding_closed_by_user_id)
    // La copia de la baja (VLRH-H1790812613829) sigue escrita
    assert.equal(toCalendarIsoDate(offboarding.employee_offboarding_termination_date), D)
    // Regla 2: nada se borra ni se revierte
    assert.deepEqual(await itemRows(offboardingId), itemsBefore)
    assert.equal(await evidenceCount(offboardingId), 1)
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNull(row.employee_deleted_at)
  })

  test('CA-2: el expediente programado antes de la baja es el que queda cancelado', async ({
    client,
    assert,
  }) => {
    const fixture = await track(() => createEmployee(unit, 'Programado', `CX-PR-${stamp()}`))
    const scheduled = await EmployeeOffboarding.create({
      employeeId: fixture.employee.employeeId,
      businessUnitId: unit.businessUnitId,
      employeeOffboardingPlannedDate: D,
      employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
      employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
      employeeOffboardingNotes: null,
      employeeOffboardingOpenedByUserId: root.user.userId,
    })
    await terminateRequest(client, fixture, root, unit)
    // La baja reutiliza el programado: sigue habiendo uno solo
    assert.lengthOf(await offboardingRows(fixture.employee.employeeId), 1)

    const response = await reactivate(client, fixture)
    response.assertStatus(200)

    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assert.equal(offboarding.employee_offboarding_id, scheduled.employeeOffboardingId)
    assert.equal(offboarding.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED)
    assert.equal(offboarding.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(offboarding.employee_offboarding_cancelled_by_user_id, root.user.userId)
  })

  test('CA-3: sin expediente abierto la reactivación procede y ninguna fila del expediente cambia', async ({
    client,
    assert,
  }) => {
    const { fixture } = await terminatedWithCase(client, 'SinAbierto')
    await db
      .from(OFFBOARDINGS_TABLE)
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_offboarding_deleted_at: new Date() })
    const before = await offboardingRows(fixture.employee.employeeId)

    const response = await reactivate(client, fixture)
    response.assertStatus(200)

    assert.deepEqual(await offboardingRows(fixture.employee.employeeId), before)
    assert.isNull(before[0].employee_offboarding_cancelled_at)
    const row = await employeeRow(fixture.employee.employeeId)
    assert.isNull(row.employee_deleted_at)
  })

  test('CA-4: si la cancelación falla, la reactivación completa revierte y responde 500 genérico', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Rollback')
    await createItem(offboardingId, EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING)
    const before = await employeeRow(fixture.employee.employeeId)
    type WithCancel = { cancelOnReactivation: (...args: unknown[]) => Promise<void> }
    const prototype = OffboardingsService.prototype as unknown as WithCancel
    const original = prototype.cancelOnReactivation
    cleanup(() => {
      prototype.cancelOnReactivation = original
    })
    prototype.cancelOnReactivation = async () => {
      throw new Error('fallo simulado al cancelar')
    }

    const response = await reactivate(client, fixture)
    response.assertStatus(500)
    assert.deepEqual(response.body(), SERVER_ERROR_BODY)

    // El colaborador sigue dado de baja, con sufijo y datos de baja
    assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
    assert.isNotNull(before.employee_deleted_at)
    assert.match(String(before.employee_code), /-IN\d+$/)
    assert.equal(before.employee_termination_modality, MODALITY)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assertCaseUntouched(assert, offboarding)
  })

  test('CA-5: un expediente abierto de otra empresa revierte todo y nunca se cancela', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Ajeno')
    await db
      .from(OFFBOARDINGS_TABLE)
      .where('employee_offboarding_id', offboardingId)
      .update({ business_unit_id: foreignUnit.businessUnitId })
    const before = await employeeRow(fixture.employee.employeeId)

    const response = await reactivate(client, fixture)
    response.assertStatus(500)
    assert.deepEqual(response.body(), SERVER_ERROR_BODY)

    assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
    const [offboarding] = await offboardingRows(fixture.employee.employeeId)
    assertCaseUntouched(assert, offboarding)
  })

  test('CA-10: una baja posterior abre un expediente nuevo y el cancelado queda como historial', async ({
    client,
    assert,
  }) => {
    const { fixture, offboardingId } = await terminatedWithCase(client, 'Historial')
    const reactivated = await reactivate(client, fixture)
    reactivated.assertStatus(200)

    await terminateRequest(client, fixture, root, unit)

    const rows = await offboardingRows(fixture.employee.employeeId)
    assert.lengthOf(rows, 2)
    const [cancelled, fresh] = rows
    assert.equal(cancelled.employee_offboarding_id, offboardingId)
    assert.equal(cancelled.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(fresh.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.equal(fresh.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION)
    assert.isNull(fresh.employee_offboarding_cancelled_at)

    const byEmployee = await client
      .get(`/api/employee-offboardings/by-employee/${fixture.employee.employeeId}`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
    byEmployee.assertStatus(200)
    const dto = byEmployee.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingId, fresh.employee_offboarding_id)
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
  })
})

test.group(
  'Checadores pendientes de sincronizar al deshacer la baja (VLRH-H1790812613831)',
  (group) => {
    let unit: BusinessUnit
    let root: Actor
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []
    const SERVER_ERROR_BODY = {
      type: 'error',
      title: 'Server error',
      message: 'An unexpected error has occurred on the server',
    }

    const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
      const fixture = await asFixture(build)
      fixtures.push(fixture)
      return fixture
    }

    const reactivate = (client: ApiClient, fixture: EmployeeFixture) =>
      reactivateRequest(client, fixture, root, unit)

    const createAccessPoint = async (name: string): Promise<AccessPoint> => {
      const accessPoint = new AccessPoint()
      accessPoint.accessPointName = name
      accessPoint.businessUnitId = unit.businessUnitId
      accessPoint.accessPointActive = 1
      accessPoint.accessPointSerialNumber = `RS-${stamp()}`.slice(0, 50)
      accessPoint.accessPointStatus = 0
      await accessPoint.save()
      return accessPoint
    }

    /** Vínculo vivo en el estado dado, con PIN: lo que `revokeAll` revoca al dar de baja. */
    const createPivot = async (
      accessPoint: AccessPoint,
      fixture: EmployeeFixture,
      status: string,
      pin: string
    ): Promise<AccessPointEmployee> => {
      const pivot = new AccessPointEmployee()
      pivot.accessPointId = accessPoint.accessPointId
      pivot.businessUnitId = unit.businessUnitId
      pivot.employeeId = fixture.employee.employeeId
      pivot.accessPointEmployeePin = pin
      pivot.accessPointEmployeeSyncStatus =
        status as AccessPointEmployee['accessPointEmployeeSyncStatus']
      await pivot.save()
      return pivot
    }

    const setPivotStatus = (pivot: AccessPointEmployee, status: string) =>
      db
        .from(AccessPointEmployee.table)
        .where('access_point_employee_id', pivot.accessPointEmployeeId)
        .update({ access_point_employee_sync_status: status })

    const marksOf = (fixture: EmployeeFixture) =>
      db
        .from(AccessPointResyncPending.table)
        .where('employee_id', fixture.employee.employeeId)
        .select(
          'access_point_resync_pending_id',
          'business_unit_id',
          'access_point_employee_id',
          'access_point_resync_pending_status_at_mark',
          'access_point_resync_pending_marked_by_user_id',
          'access_point_resync_pending_resolved_at',
          'access_point_resync_pending_resolution'
        )
        .orderBy('access_point_resync_pending_id')

    const openMarksOf = async (fixture: EmployeeFixture) => {
      const marks = await marksOf(fixture)
      return marks.filter((row) => row.access_point_resync_pending_resolved_at === null)
    }

    group.setup(async () => {
      await asFixture(async () => {
        unit = await createUnit('checadores')
        root = await createRootActor([unit])
        actors.push(root)
      })
    })

    group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unit])))

    test('CA-1 y CA-2: quedan marcados los checadores de los que esta baja sacó a la persona, con su estado y el actor', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'Marcas', `RS-${stamp()}`))
      const [p1, p2, p3, p4] = await asFixture(() =>
        Promise.all(['P1', 'P2', 'P3', 'P4'].map((name) => createAccessPoint(`${name} ${stamp()}`)))
      )
      const pivot1 = await createPivot(
        p1,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '1001'
      )
      const pivot2 = await createPivot(
        p2,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '1002'
      )
      // P3: revocado a mano ANTES de la baja; su pedido de borrado es anterior
      const pivot3 = await createPivot(
        p3,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
        '1003'
      )
      await AccessPointEmployeeEvent.create({
        accessPointEmployeeId: pivot3.accessPointEmployeeId,
        businessUnitId: unit.businessUnitId,
        accessPointEmployeeEventKind: ACCESS_POINT_EMPLOYEE_EVENT_KIND.REVOKE_REQUESTED,
        accessPointEmployeeEventFromStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        accessPointEmployeeEventToStatus: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
        accessPointEmployeeEventCreatedAt: DateTime.utc().minus({ days: 2 }),
      })

      await terminateRequest(client, fixture, root, unit)
      // La baja pidió el borrado en P1 y P2 (eventos revoke_requested); el aparato responde distinto
      await setPivotStatus(pivot1, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      await setPivotStatus(pivot2, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED)
      // P4: alta hecha después de la baja, nunca revocada
      const pivot4 = await createPivot(
        p4,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '1004'
      )

      const response = await reactivate(client, fixture)
      response.assertStatus(200)

      const marks = await openMarksOf(fixture)
      assert.sameMembers(
        marks.map((row) => Number(row.access_point_employee_id)),
        [pivot1.accessPointEmployeeId, pivot2.accessPointEmployeeId]
      )
      const byPivot = new Map(marks.map((row) => [Number(row.access_point_employee_id), row]))
      assert.equal(
        byPivot.get(pivot1.accessPointEmployeeId)!.access_point_resync_pending_status_at_mark,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
      )
      assert.equal(
        byPivot.get(pivot2.accessPointEmployeeId)!.access_point_resync_pending_status_at_mark,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED
      )
      for (const row of marks) {
        assert.equal(row.business_unit_id, unit.businessUnitId)
        assert.equal(row.access_point_resync_pending_marked_by_user_id, root.user.userId)
      }
      assert.notInclude(
        marks.map((row) => Number(row.access_point_employee_id)),
        pivot3.accessPointEmployeeId
      )
      assert.notInclude(
        marks.map((row) => Number(row.access_point_employee_id)),
        pivot4.accessPointEmployeeId
      )
    })

    test('CA-3: sin checadores la reactivación procede y no se crea ninguna marca', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'SinChecador', `RS-${stamp()}`))
      await terminateRequest(client, fixture, root, unit)
      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      assert.lengthOf(await marksOf(fixture), 0)
    })

    test('CA-4: si la escritura de marcas falla, la reactivación completa revierte con el 500 genérico', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'Rollback', `RS-${stamp()}`))
      const p1 = await asFixture(() => createAccessPoint(`P1 rollback ${stamp()}`))
      const pivot1 = await createPivot(
        p1,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '2001'
      )
      await terminateRequest(client, fixture, root, unit)
      await setPivotStatus(pivot1, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      const before = await employeeRow(fixture.employee.employeeId)
      const original = ResyncPendingService.prototype.recordOnReactivation
      cleanup(() => {
        ResyncPendingService.prototype.recordOnReactivation = original
      })
      ResyncPendingService.prototype.recordOnReactivation = async () => {
        throw new Error('fallo simulado al marcar checadores')
      }

      const response = await reactivate(client, fixture)
      response.assertStatus(500)
      assert.deepEqual(response.body(), SERVER_ERROR_BODY)

      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      assert.isNotNull(before.employee_deleted_at)
      assert.match(String(before.employee_code), /-IN\d+$/)
      assert.lengthOf(await marksOf(fixture), 0)
      // El expediente tampoco quedó cancelado ni con la copia (R3)
      const [offboarding] = await offboardingRows(fixture.employee.employeeId)
      assert.equal(offboarding.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
      assert.isNull(offboarding.employee_offboarding_termination_date)
    })

    test('CA-10: la siguiente reactivación conserva, agrega y cierra marcas sin duplicar vínculos', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'Recalculo', `RS-${stamp()}`))
      const [p1, p5, p6] = await asFixture(() =>
        Promise.all(
          ['P1', 'P5', 'P6'].map((name) => createAccessPoint(`${name} recalculo ${stamp()}`))
        )
      )
      const pivot1 = await createPivot(
        p1,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '3001'
      )
      const pivot6 = await createPivot(
        p6,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '3006'
      )

      // Primera baja y reactivación: P1 y P6 quedan marcados
      await terminateRequest(client, fixture, root, unit)
      await setPivotStatus(pivot1, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      await setPivotStatus(pivot6, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      const first = await reactivate(client, fixture)
      first.assertStatus(200)
      const firstMarks = await openMarksOf(fixture)
      assert.sameMembers(
        firstMarks.map((row) => Number(row.access_point_employee_id)),
        [pivot1.accessPointEmployeeId, pivot6.accessPointEmployeeId]
      )
      const originalP1MarkId = firstMarks.find(
        (row) => Number(row.access_point_employee_id) === pivot1.accessPointEmployeeId
      )!.access_point_resync_pending_id

      // Entre reactivaciones: P6 volvió a quedar confirmado por otra vía; P5 se da de alta
      await setPivotStatus(pivot6, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
      const pivot5 = await createPivot(
        p5,
        fixture,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
        '3005'
      )

      // Segunda baja: P1 sigue revoked sin evento nuevo; P5 lo revoca esta baja; P6 también
      await terminateRequest(client, fixture, root, unit)
      await setPivotStatus(pivot5, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      // P6 vuelve a confirmado antes de reactivar: su marca vieja ya no procede
      await setPivotStatus(pivot6, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)

      const second = await reactivate(client, fixture)
      second.assertStatus(200)

      const all = await marksOf(fixture)
      const open = all.filter((row) => row.access_point_resync_pending_resolved_at === null)
      assert.sameMembers(
        open.map((row) => Number(row.access_point_employee_id)),
        [pivot1.accessPointEmployeeId, pivot5.accessPointEmployeeId]
      )
      // P1 conserva su marca original abierta (no se duplicó ni se reabrió)
      const p1Marks = all.filter(
        (row) => Number(row.access_point_employee_id) === pivot1.accessPointEmployeeId
      )
      assert.lengthOf(p1Marks, 1)
      assert.equal(p1Marks[0].access_point_resync_pending_id, originalP1MarkId)
      // P6 quedó cerrada como superseded
      const p6Mark = all.find(
        (row) => Number(row.access_point_employee_id) === pivot6.accessPointEmployeeId
      )!
      assert.isNotNull(p6Mark.access_point_resync_pending_resolved_at)
      assert.equal(
        p6Mark.access_point_resync_pending_resolution,
        ACCESS_POINT_RESYNC_RESOLUTION.SUPERSEDED
      )

      // El UNIQUE impide una segunda marca abierta del mismo vínculo
      await assert.rejects(() =>
        db.table(AccessPointResyncPending.table).insert({
          business_unit_id: unit.businessUnitId,
          employee_id: fixture.employee.employeeId,
          access_point_employee_id: pivot1.accessPointEmployeeId,
          access_point_resync_pending_status_at_mark: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
        })
      )
    })
  }
)

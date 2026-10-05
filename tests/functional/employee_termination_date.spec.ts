import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BranchOffice from '#models/branch_office'
import Employee from '#models/employee'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { todayInBusinessZone, toCalendarIsoDate } from '#utils/business_date'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1790812613821 — la baja usa la fecha que RH capturó para todo lo que
 * desencadena: cancela con ella todo cambio temporal de sucursal no terminado
 * antes (R1 de VLRH-C0038) y abre el expediente de salida con esa fecha
 * tentativa. Una fecha que no es un día real del calendario se rechaza con 400
 * `fecha-de-baja-invalida` antes de tocar cualquier dato, en la baja y en la
 * edición (R2 de VLRH-C0038).
 *
 * Punta a punta por HTTP. Corre sobre la base de pruebas, afirma solo sobre
 * filas propias y borra todo en teardown.
 */

const TEST_PASSWORD = 'BajaFechaCapturada123!'
const D = '2026-09-15'
const MODALITY = 'Renuncia'
const TERMINATION_TYPE = 'Cambio de Residencia'
const INVALID_KEY = 'fecha-de-baja-invalida'
const LEGACY_INCOMPLETE_TITLE = 'Datos incompletos para la baja'
const EMPLOYEES_MODULE_SLUG = 'employees'
const LOANS_TABLE = 'employee_temporary_assignments'
const OFFBOARDINGS_TABLE = 'employee_offboardings'

/**
 * Las fixtures se arman fuera de una petición: sin empresa identificada el
 * filtro de empresa de los modelos lanza, así que se declaran como excepción
 * de prueba. Las peticiones HTTP del spec sí corren con su empresa.
 */
function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Baja fecha ${label} ${s}`,
    businessUnitSlug: `baja-fecha-${label}-${s}`,
    businessUnitLegalName: `Baja fecha ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createBranch(unit: BusinessUnit, name: string): Promise<BranchOffice> {
  return BranchOffice.create({
    businessUnitId: unit.businessUnitId,
    branchOfficeName: name,
    branchOfficeSlug: `${name.toLowerCase()}-${stamp()}`,
    branchOfficeLocationAddress: null,
    branchOfficeIdealTemplateCount: null,
    branchOfficeMinActiveEmployeesPerShift: null,
    empresaContratanteId: null,
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

/** Colaborador activo; con `termination`, con el registro de baja ya asentado en su ficha. */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  termination: TerminationSeed | null = null
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Baja',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `baja-fecha-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `BFC-${s}`
  employee.employeeFirstName = 'Baja'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `BFC-${s}`
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
    await setTermination(employee.employeeId, termination)
  }
  return { employee, person }
}

async function setTermination(employeeId: number, termination: TerminationSeed): Promise<void> {
  await db
    .from('employees')
    .where('employee_id', employeeId)
    .update({
      employee_terminated_date: `${termination.date} 00:00:00`,
      employee_termination_modality: termination.modality,
      employee_termination_type: termination.type,
    })
}

interface LoanSeed {
  start: string
  end: string
  cancelledAt?: string | null
}

/** Cambio temporal de sucursal; `days` inclusivo, como lo calcula el servicio. */
async function createLoan(
  fixture: EmployeeFixture,
  branches: { source: BranchOffice; target: BranchOffice },
  seed: LoanSeed
): Promise<number> {
  const start = DateTime.fromISO(seed.start)
  const end = DateTime.fromISO(seed.end)
  const [loanId] = await db.table(LOANS_TABLE).insert({
    employee_id: fixture.employee.employeeId,
    business_unit_id: fixture.employee.businessUnitId,
    source_branch_id: branches.source.branchOfficeId,
    target_branch_id: branches.target.branchOfficeId,
    start_date: seed.start,
    end_date: seed.end,
    days: Math.round(end.diff(start, 'days').days) + 1,
    reason: 'Prueba de baja',
    cancelled_at: seed.cancelledAt ?? null,
    employee_temporary_assignment_created_at: new Date(),
  })
  return Number(loanId)
}

async function loanCancelledAt(loanId: number): Promise<string | null> {
  const row = await db
    .from(LOANS_TABLE)
    .where('employee_temporary_assignment_id', loanId)
    .select('cancelled_at')
    .first()
  return toCalendarIsoDate(row.cancelled_at)
}

async function offboardingRows(employeeId: number) {
  return db
    .from(OFFBOARDINGS_TABLE)
    .where('employee_id', employeeId)
    .select('employee_offboarding_id', 'employee_offboarding_planned_date')
}

/** Fila del colaborador con la fecha de baja tal como quedó escrita (`yyyy-MM-dd HH:mm:ss`). */
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

interface Actor {
  user: User
  person: Person
  role: Role | null
}

/** El usuario principal: rol `root` del sistema, con acceso a las empresas dadas. */
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
    roleName: `Baja fecha ${s}`,
    roleSlug: `baja-fecha-${s}`,
    roleDescription: 'Rol temporal del spec de la fecha de baja',
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
  const email = `baja-fecha-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'BajaFecha',
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

/**
 * Body equivalente al eco del BO: el registro completo. El BO siempre manda
 * la fecha de baja; omitirla equivale a quitarla.
 */
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

test.group(
  'Baja con la fecha capturada — DELETE/PUT /api/employees/:id (VLRH-H1790812613821)',
  (group) => {
    let unit: BusinessUnit
    let foreignUnit: BusinessUnit
    let branches: { source: BranchOffice; target: BranchOffice }
    let foreignBranches: { source: BranchOffice; target: BranchOffice }
    let root: Actor
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []

    let late: EmployeeFixture
    let lateLoans: Record<'ended' | 'a' | 'b' | 'c' | 'e' | 'f', number>
    let neighbor: EmployeeFixture
    let neighborLoanId: number
    let foreignEmployee: EmployeeFixture
    let foreignLoanId: number

    const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
      const fixture = await asFixture(build)
      fixtures.push(fixture)
      return fixture
    }

    const terminate = (
      client: ApiClient,
      fixture: EmployeeFixture,
      body: Record<string, unknown>
    ) =>
      client
        .delete(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(body)

    const put = (
      client: ApiClient,
      actor: Actor,
      fixture: EmployeeFixture,
      overrides: Record<string, unknown>
    ) =>
      client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(bodyFor(fixture, overrides))

    const validTermination = (employeeTerminatedDate: unknown) => ({
      employeeTerminatedDate,
      employeeTerminationModality: MODALITY,
      employeeTerminationType: TERMINATION_TYPE,
    })

    group.setup(async () => {
      await asFixture(async () => {
        unit = await createUnit('empresa')
        foreignUnit = await createUnit('ajena')
        branches = {
          source: await createBranch(unit, 'Origen'),
          target: await createBranch(unit, 'Destino'),
        }
        foreignBranches = {
          source: await createBranch(foreignUnit, 'Origen'),
          target: await createBranch(foreignUnit, 'Destino'),
        }
        root = await createRootActor([unit, foreignUnit])
        actors.push(root)
      })

      // CA-1: seis préstamos alrededor de D = 2026-09-15
      late = await track(() => createEmployee(unit, 'Atrasada'))
      lateLoans = {
        ended: await createLoan(late, branches, { start: '2026-08-01', end: '2026-08-31' }),
        a: await createLoan(late, branches, { start: '2026-09-10', end: '2026-09-20' }),
        b: await createLoan(late, branches, { start: '2026-09-21', end: '2026-10-31' }),
        c: await createLoan(late, branches, { start: '2027-01-10', end: '2027-01-20' }),
        e: await createLoan(late, branches, {
          start: '2026-11-01',
          end: '2026-11-30',
          cancelledAt: '2026-09-12',
        }),
        f: await createLoan(late, branches, {
          start: '2026-12-01',
          end: '2026-12-31',
          cancelledAt: '2026-12-05',
        }),
      }

      // CA-11: otro colaborador de la misma empresa y uno de la empresa ajena, con préstamo que traslapa D
      neighbor = await track(() => createEmployee(unit, 'Vecino'))
      neighborLoanId = await createLoan(neighbor, branches, {
        start: '2026-09-10',
        end: '2026-09-20',
      })
      foreignEmployee = await track(() => createEmployee(foreignUnit, 'Ajeno'))
      foreignLoanId = await createLoan(foreignEmployee, foreignBranches, {
        start: '2026-09-10',
        end: '2026-09-20',
      })
    })

    const destroyFixtures = async (): Promise<void> => {
      const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
      if (employeeIds.length > 0) {
        // Por FK: expedientes (sus pendientes caen en cascada), préstamos, historial, colaboradores, personas
        await db.from(OFFBOARDINGS_TABLE).whereIn('employee_id', employeeIds).delete()
        await db.from(LOANS_TABLE).whereIn('employee_id', employeeIds).delete()
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
      // Las sucursales van después de los préstamos (FK RESTRICT) y antes de las empresas
      for (const current of [unit, foreignUnit]) {
        await db.from('branch_offices').where('business_unit_id', current.businessUnitId).delete()
        await BusinessUnit.query().where('business_unit_id', current.businessUnitId).delete()
      }
    }

    group.teardown(() => asFixture(destroyFixtures))

    test('CA-1: la baja atrasada cancela con la fecha capturada todo préstamo no terminado antes y abre el expediente con esa fecha', async ({
      client,
      assert,
    }) => {
      const response = await terminate(client, late, validTermination(D))
      response.assertStatus(201)

      const row = await employeeRow(late.employee.employeeId)
      assert.equal(row.terminated_date, `${D} 00:00:00`)
      assert.isNotNull(row.employee_deleted_at)
      assert.equal(row.employee_termination_modality, MODALITY)
      assert.equal(row.employee_termination_type, TERMINATION_TYPE)

      // R1 de VLRH-C0038: el terminado antes de D no se toca; vigente y futuros quedan en D;
      // una cancelación en D o antes se conserva y una posterior pasa a D
      assert.isNull(await loanCancelledAt(lateLoans.ended))
      assert.equal(await loanCancelledAt(lateLoans.a), D)
      assert.equal(await loanCancelledAt(lateLoans.b), D)
      assert.equal(await loanCancelledAt(lateLoans.c), D)
      assert.equal(await loanCancelledAt(lateLoans.e), '2026-09-12')
      assert.equal(await loanCancelledAt(lateLoans.f), D)

      const offboardings = await offboardingRows(late.employee.employeeId)
      assert.lengthOf(offboardings, 1)
      assert.equal(toCalendarIsoDate(offboardings[0].employee_offboarding_planned_date), D)
    })

    test('CA-11: la baja no alcanza el préstamo de otro colaborador ni a un colaborador de otra empresa', async ({
      client,
      assert,
    }) => {
      // El vecino de la misma empresa conserva su préstamo tras la baja de CA-1
      assert.isNull(await loanCancelledAt(neighborLoanId))

      const response = await terminate(client, foreignEmployee, validTermination(D))
      response.assertStatus(404)
      const row = await employeeRow(foreignEmployee.employee.employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(await loanCancelledAt(foreignLoanId))
      assert.lengthOf(await offboardingRows(foreignEmployee.employee.employeeId), 0)
    })

    test('CA-12: repetir la misma baja responde 404 y no duplica ni mueve nada', async ({
      client,
      assert,
    }) => {
      const before = await employeeRow(late.employee.employeeId)
      const response = await terminate(client, late, validTermination(D))
      response.assertStatus(404)

      const after = await employeeRow(late.employee.employeeId)
      assert.equal(after.employee_code, before.employee_code)
      assert.lengthOf(String(after.employee_code).match(/-IN\d+/g) ?? [], 1)
      assert.lengthOf(await offboardingRows(late.employee.employeeId), 1)
      assert.isNull(await loanCancelledAt(lateLoans.ended))
      assert.equal(await loanCancelledAt(lateLoans.a), D)
      assert.equal(await loanCancelledAt(lateLoans.e), '2026-09-12')
      assert.equal(await loanCancelledAt(lateLoans.f), D)
    })

    test('CA-2: la baja con la fecha de hoy da el mismo resultado que antes', async ({
      client,
      assert,
    }) => {
      const today = todayInBusinessZone()
      const todayIso = today.toISODate()!
      const fixture = await track(() => createEmployee(unit, 'Hoy'))
      const loanId = await createLoan(fixture, branches, {
        start: today.minus({ days: 2 }).toISODate()!,
        end: today.plus({ days: 5 }).toISODate()!,
      })

      const response = await terminate(client, fixture, validTermination(todayIso))
      response.assertStatus(201)
      assert.equal(await loanCancelledAt(loanId), todayIso)
      const offboardings = await offboardingRows(fixture.employee.employeeId)
      assert.lengthOf(offboardings, 1)
      assert.equal(toCalendarIsoDate(offboardings[0].employee_offboarding_planned_date), todayIso)
    })

    test('CA-3: la hora y la zona que manda el cliente no recorren la fecha de día', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'ConHora'))
      const response = await terminate(client, fixture, validTermination(`${D}T23:30:00-06:00`))
      response.assertStatus(201)

      const row = await employeeRow(fixture.employee.employeeId)
      assert.equal(row.terminated_date, `${D} 00:00:00`)
      const offboardings = await offboardingRows(fixture.employee.employeeId)
      assert.lengthOf(offboardings, 1)
      assert.equal(toCalendarIsoDate(offboardings[0].employee_offboarding_planned_date), D)
    })

    test('CA-4: una fecha que no es un día real se rechaza con 400 y no deja ningún efecto', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'Invalida'))
      const loanId = await createLoan(fixture, branches, { start: '2026-09-10', end: '2026-09-20' })
      const originalCode = String(fixture.employee.employeeCode)

      for (const value of ['2026-02-30', '2026-13-01', 'abc', '20260915', '2026-W38-2']) {
        const response = await terminate(client, fixture, validTermination(value))
        response.assertStatus(400)
        assert.equal(response.body().key, INVALID_KEY, value)
        assert.isString(response.body().message)
        assert.isNotEmpty(response.body().message)
        // El aviso es texto fijo: no devuelve el valor recibido ni datos del colaborador
        assert.notProperty(response.body(), 'data')
        assert.notInclude(JSON.stringify(response.body()), value)

        const row = await employeeRow(fixture.employee.employeeId)
        assert.isNull(row.employee_deleted_at, value)
        assert.isNull(row.terminated_date, value)
        assert.equal(row.employee_code, originalCode)
        assert.isNull(await loanCancelledAt(loanId), value)
        assert.lengthOf(await offboardingRows(fixture.employee.employeeId), 0)
      }
    })

    test('CA-5: la baja sin fecha sigue en el aviso vigente de datos incompletos', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'SinFecha'))
      const bodies: Record<string, unknown>[] = [
        validTermination(''),
        { employeeTerminationModality: MODALITY, employeeTerminationType: TERMINATION_TYPE },
      ]
      for (const body of bodies) {
        const response = await terminate(client, fixture, body)
        response.assertStatus(400)
        assert.equal(response.body().title, LEGACY_INCOMPLETE_TITLE)
        assert.notProperty(response.body(), 'key')
        const row = await employeeRow(fixture.employee.employeeId)
        assert.isNull(row.employee_deleted_at)
        assert.isNull(row.terminated_date)
        assert.lengthOf(await offboardingRows(fixture.employee.employeeId), 0)
      }
    })

    test('CA-6 y CA-7: la edición con fecha no interpretable responde 400 y no borra el registro de baja', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() =>
        createEmployee(unit, 'EdicionInvalida', {
          date: D,
          modality: MODALITY,
          type: TERMINATION_TYPE,
        })
      )
      const before = await employeeRow(fixture.employee.employeeId)
      assert.equal(before.terminated_date, `${D} 00:00:00`)

      // Texto que no es un día real (CA-6) y valores que no son texto (CA-7)
      for (const value of ['2026-02-30', 20260915, 0, false]) {
        const response = await put(client, root, fixture, validTermination(value))
        response.assertStatus(400)
        assert.equal(response.body().key, INVALID_KEY, String(value))
        assert.isNotEmpty(response.body().detail)
        assert.deepEqual(await employeeRow(fixture.employee.employeeId), before, String(value))
      }
    })

    test('CA-8: la edición con la fecha que manda el BO guarda el día capturado', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'EdicionValida'))
      const response = await put(client, root, fixture, validTermination(`${D}T06:00:00.000Z`))
      response.assertStatus(201)

      const row = await employeeRow(fixture.employee.employeeId)
      assert.equal(row.terminated_date, `${D} 00:00:00`)
      assert.equal(row.employee_termination_modality, MODALITY)
      assert.equal(row.employee_termination_type, TERMINATION_TYPE)
    })

    test('CA-9: la edición con la fecha vacía sigue quitando el registro de baja', async ({
      client,
      assert,
    }) => {
      const fixture = await track(() => createEmployee(unit, 'EdicionVacia'))
      for (const value of [null, '', '   ']) {
        await setTermination(fixture.employee.employeeId, {
          date: D,
          modality: MODALITY,
          type: TERMINATION_TYPE,
        })
        const response = await put(client, root, fixture, {
          employeeTerminatedDate: value,
          employeeTerminationModality: null,
          employeeTerminationType: null,
        })
        response.assertStatus(201)
        const row = await employeeRow(fixture.employee.employeeId)
        assert.isNull(row.terminated_date)
        assert.isNull(row.employee_termination_modality)
        assert.isNull(row.employee_termination_type)
      }
    })

    test('CA-10: sin permiso de registro de baja, la fecha inválida es 400 (no 403) y la misma fecha no exige el permiso', async ({
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
        const actor = await asFixture(() => createTenantActor(unit, ['tab-trabajo-write']))
        actors.push(actor)
        const recorded = { date: '2024-01-15', modality: 'Renuncia', type: 'Jubilación' }
        const fixture = await track(() => createEmployee(unit, 'Gate', recorded))
        const before = await employeeRow(fixture.employee.employeeId)

        const invalid = await put(client, actor, fixture, {
          employeeTerminatedDate: '2026-02-30',
          employeeTerminationModality: recorded.modality,
          employeeTerminationType: recorded.type,
        })
        invalid.assertStatus(400)
        assert.equal(invalid.body().key, INVALID_KEY)
        assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)

        // La misma fecha con la hora del BO no es un cambio del registro de baja (regla 7)
        const same = await put(client, actor, fixture, {
          employeeTerminatedDate: '2024-01-15T06:00:00.000Z',
          employeeTerminationModality: recorded.modality,
          employeeTerminationType: recorded.type,
        })
        same.assertStatus(201)
        assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)

        // Y una fecha válida distinta sigue exigiendo el permiso, como hoy
        const changed = await put(client, actor, fixture, {
          employeeTerminatedDate: '2024-02-15',
          employeeTerminationModality: recorded.modality,
          employeeTerminationType: recorded.type,
        })
        changed.assertStatus(403)
        assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      } finally {
        employeesModule.systemModulePermissionEnforcementActive = originalEnforcement
        await employeesModule.save()
      }
    })
  }
)

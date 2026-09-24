import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import Department from '#models/department'
import Position from '#models/position'
import Shift from '#models/shift'
import Employee from '#models/employee'
import EmployeeShift from '#models/employee_shift'
import Assist from '#models/assist'
import PlatformTrialUsageService from '#services/platform_trial_usage_service'
import PlatformTrialService from '#services/platform_trial_service'
import PlatformTenantMilestoneService from '#services/platform_tenant_milestone_service'
import { createTenantTrialFixture } from './helpers/platform_trial_fixture.js'

/**
 * USRH1789079078173 — contrato de `GET /api/platform/metrics/trials/live`.
 *
 * Las reglas puras (orden, RN-6 por `businessUnitId`, degradado a
 * `no-disponible`, propagación del fallo del universo/hitos) se prueban en
 * `tests/unit/services/platform_live_trials_service.spec.ts` con dobles, sin
 * BD. Aquí se prueba lo que solo la base de datos real y el transporte
 * pueden romper: el universo de verdad (excluye terminadas/sin
 * prueba/borradas), el motor de asistencia corriendo por tenant sin mezclar
 * empresas, y que la fila de la lista es EXACTAMENTE igual a lo que entregan
 * las consultas individuales de esa misma empresa (RN-12).
 *
 * El guard (401/403/200) ya está cubierto en `platform_trial_guard.spec.ts`.
 */

const TEST_PASSWORD = 'LiveTrialsMetricsTest123!'
const LIST_URL = '/api/platform/metrics/trials/live'
const TRIAL_URL = (publicId: string) => `/api/platform/metrics/tenants/${publicId}/trial`
const USAGE_URL = (publicId: string) => `/api/platform/metrics/tenants/${publicId}/trial/usage`

const EXPECTED_ROW_KEYS = ['tenant', 'fin', 'diasRestantes', 'hitosCumplidos', 'frecuencia']
const EXPECTED_FRECUENCIA_KEYS = ['estado', 'porcentaje', 'registros', 'empleadoDiasEvaluables', 'empleadosEvaluados']

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'LiveTrials',
    personLastname: 'Metrics',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

const STAMP = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`

async function createDepartment(businessUnitId: number, tag: string): Promise<Department> {
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `DEP-${STAMP()}`.slice(0, 50),
    departmentName: `Depto ${tag}`.slice(0, 100),
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId,
    companyId: 1,
  })
}

async function createPosition(businessUnitId: number, tag: string): Promise<Position> {
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `PUE-${STAMP()}`.slice(0, 50)
  position.positionName = `Puesto ${tag}`.slice(0, 100)
  position.positionActive = 1
  position.businessUnitId = businessUnitId
  await position.save()
  return position
}

async function createShift(businessUnitId: number, tag: string): Promise<Shift> {
  return Shift.create({
    shiftName: `Turno ${tag} ${STAMP()}`.slice(0, 100),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 1,
    businessUnitId,
    shiftTemp: 0,
  })
}

async function createEmployee(
  businessUnitId: number,
  departmentId: number,
  positionId: number,
  tag: string
): Promise<Employee> {
  const stamp = STAMP()
  const person = await Person.create({
    personFirstname: 'Vivas',
    personLastname: tag,
    personSecondLastname: stamp,
  })
  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnitId
  employee.companyId = 1
  employee.departmentId = departmentId
  employee.positionId = positionId
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EMP-${stamp}`
  employee.employeeFirstName = 'Vivas'
  employee.employeeLastName = tag
  await employee.save()
  return employee
}

async function createEmployeeShift(employeeId: number, shiftId: number, businessUnitId: number): Promise<void> {
  const es = new EmployeeShift()
  es.employeeId = employeeId
  es.shiftId = shiftId
  es.businessUnitId = businessUnitId
  es.employeShiftsApplySince = '2020-01-01'
  await es.save()
}

/** Empleado con turno propio, sin checadas. */
async function seedEmployeeWithShift(businessUnitId: number, tag: string): Promise<Employee> {
  const dept = await createDepartment(businessUnitId, tag)
  const pos = await createPosition(businessUnitId, tag)
  const shift = await createShift(businessUnitId, tag)
  const employee = await createEmployee(businessUnitId, dept.departmentId, pos.positionId, tag)
  await createEmployeeShift(employee.employeeId, shift.shiftId, businessUnitId)
  return employee
}

async function createAssistRow(
  businessUnitId: number,
  employee: Employee,
  punchTime: DateTime,
  origin: string
): Promise<void> {
  const assist = new Assist()
  assist.assistEmpCode = String(employee.employeeCode)
  assist.assistTerminalSn = 'TEST-LIVE-TRIALS'
  assist.assistTerminalAlias = 'TEST'
  assist.assistAreaAlias = 'TEST'
  assist.assistLongitude = 0
  assist.assistLatitude = 0
  assist.assistPrecision = 0
  assist.assistUploadTime = punchTime
  assist.assistEmpId = employee.employeeId
  assist.businessUnitId = businessUnitId
  assist.assistTerminalId = null
  assist.assistSyncId = Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000)
  assist.assistActive = 1
  assist.assistType = 'check'
  assist.assistPunchTime = punchTime
  assist.assistPunchTimeUtc = punchTime
  assist.assistPunchTimeOrigin = punchTime
  // @ts-expect-error — `assist_origin`, no forma parte del set de columnas tipadas arriba
  assist.assistOrigin = origin
  await assist.save()
}

/** Un día completo (entrada+salida), igual que el molde de USRH1789079078171. */
async function seedOnTimeDay(businessUnitId: number, employee: Employee, day: string, origin: string): Promise<void> {
  await createAssistRow(businessUnitId, employee, DateTime.fromISO(`${day}T13:00:00`, { zone: 'utc' }), origin)
  await createAssistRow(businessUnitId, employee, DateTime.fromISO(`${day}T21:00:00`, { zone: 'utc' }), origin)
}

async function cleanupBu(businessUnitId: number): Promise<void> {
  const employeeIds: Array<{ employee_id: number }> = await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .select('employee_id')
  const ids = employeeIds.map((r) => r.employee_id)
  if (ids.length > 0) {
    await db.from('assists').whereIn('assist_emp_id', ids).delete()
    await db.from('employee_shifts').whereIn('employee_id', ids).delete()
  }
  const personIds: Array<{ person_id: number }> = await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .select('person_id')
  await db.from('employees').where('business_unit_id', businessUnitId).delete()
  await db.from('shifts').where('business_unit_id', businessUnitId).delete()
  await db.from('positions').where('business_unit_id', businessUnitId).delete()
  await db.from('departments').where('business_unit_id', businessUnitId).delete()
  for (const row of personIds) {
    await db.from('people').where('person_id', row.person_id).delete()
  }
}

test.group('GET /api/platform/metrics/trials/live (USRH1789079078173)', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('live-trials-admin', true)
    outsider = await createActor('live-trials-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('sin sesión responde 401', async ({ client }) => {
    const response = await client.get(LIST_URL)
    response.assertStatus(401)
  })

  test('sin permiso de plataforma responde 403 sin campo code', async ({ client, assert }) => {
    const response = await client.get(LIST_URL).loginAs(outsider!.user)
    response.assertStatus(403)
    assert.isUndefined(response.body().code)
  })

  test('CA · deja fuera pruebas terminadas, sin prueba y suscripciones borradas — solo entran las vivas', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live01-viva', trialDays: 7, subscribedAtOverride: '2026-09-01', trialEndsAtOverride: '2026-09-30' },
      { tag: 'live01-terminada', trialDays: 7, status: 'active' },
      { tag: 'live01-sin-prueba', trialDays: 0, skipTrial: true },
      { tag: 'live01-borrada', trialDays: 7, subscriptionDeleted: true },
    ])
    try {
      await seedEmployeeWithShift(fixture.tenants[0]!.businessUnitId, 'live01-viva')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { type: string; data: Array<{ tenant: { publicId: string } }> }
      assert.equal(body.type, 'success')

      const publicIds = body.data.map((r) => r.tenant.publicId)
      assert.include(publicIds, fixture.tenants[0]!.businessUnitPublicId)
      assert.notInclude(publicIds, fixture.tenants[1]!.businessUnitPublicId)
      assert.notInclude(publicIds, fixture.tenants[2]!.businessUnitPublicId)
      assert.notInclude(publicIds, fixture.tenants[3]!.businessUnitPublicId)
    } finally {
      for (const t of fixture.tenants) await cleanupBu(t.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA · forma exacta de una fila: lista cerrada de llaves, tenant y frecuencia con su forma completa', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live02', trialDays: 7, subscribedAtOverride: '2026-09-01', trialEndsAtOverride: '2026-09-30' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      await seedEmployeeWithShift(tenant.businessUnitId, 'live02')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: Array<Record<string, unknown>> }
      const fila = body.data.find(
        (r) => (r.tenant as { publicId: string }).publicId === tenant.businessUnitPublicId
      )!

      assert.deepEqual(Object.keys(fila).sort(), EXPECTED_ROW_KEYS.sort())
      assert.deepEqual(Object.keys(fila.tenant as object).sort(), ['nombre', 'publicId'])
      assert.deepEqual(Object.keys(fila.frecuencia as object).sort(), EXPECTED_FRECUENCIA_KEYS.sort())
      assert.equal((fila.tenant as { nombre: string }).nombre, tenant.businessUnitName)
      assert.equal(fila.fin, '2026-09-30')
      assert.typeOf(fila.diasRestantes, 'number')
      assert.typeOf(fila.hitosCumplidos, 'number')
      assert.isAtLeast(fila.hitosCumplidos as number, 0)
      assert.isAtMost(fila.hitosCumplidos as number, 7)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-6/RN-12 · dos empresas con valores DISTINTOS: cada fila trae exactamente lo de SU empresa, igual que las consultas individuales', async ({
    client,
    assert,
  }) => {
    // Ventanas VIVAS de verdad (fin en el futuro respecto a "hoy" real) para
    // que `diasRestantes` sea distinto y positivo en ambas — con la ventana
    // ya vencida, ambas caerían en 0 y la aserción de distinción no diría
    // nada (RN-12 exige comparar valores realmente distintos, no ceros).
    const finA = DateTime.utc().plus({ days: 8 }).toISODate()!
    const finB = DateTime.utc().plus({ days: 18 }).toISODate()!
    const fixture = await createTenantTrialFixture([
      { tag: 'live03-a', trialDays: 8, trialEndsAtOverride: finA },
      { tag: 'live03-b', trialDays: 18, trialEndsAtOverride: finB },
    ])
    const [a, b] = fixture.tenants
    try {
      // A: con-base, con checadas y un departamento propio (1 hito).
      const employeeA = await seedEmployeeWithShift(a!.businessUnitId, 'live03-a')
      await seedOnTimeDay(a!.businessUnitId, employeeA, DateTime.utc().toISODate()!, 'app')

      // B: sin-base (nadie con turno), cero hitos.

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: Array<Record<string, unknown>> }

      const filaA = body.data.find(
        (r) => (r.tenant as { publicId: string }).publicId === a!.businessUnitPublicId
      )!
      const filaB = body.data.find(
        (r) => (r.tenant as { publicId: string }).publicId === b!.businessUnitPublicId
      )!

      assert.equal((filaA.frecuencia as { estado: string }).estado, 'con-base')
      assert.equal((filaB.frecuencia as { estado: string }).estado, 'sin-base')
      assert.notEqual(filaA.fin, filaB.fin)
      assert.notEqual(filaA.diasRestantes, filaB.diasRestantes)

      // RN-12: la fila de la lista es EXACTAMENTE lo que entregan las
      // consultas individuales de esa misma empresa — nunca un cálculo
      // aparte que pudiera desviarse.
      const trialA = await client.get(TRIAL_URL(a!.businessUnitPublicId)).loginAs(admin!.user)
      const usageA = await client.get(USAGE_URL(a!.businessUnitPublicId)).loginAs(admin!.user)
      const hitosCumplidosIndividual = (
        trialA.body().data.hitos as Array<{ cumplido: boolean }>
      ).filter((h) => h.cumplido).length

      assert.equal(filaA.hitosCumplidos, hitosCumplidosIndividual)
      assert.deepEqual(filaA.frecuencia, usageA.body().data.frecuencia)
      assert.equal(filaA.fin, trialA.body().data.prueba.fin)
      assert.equal(filaA.diasRestantes, trialA.body().data.prueba.diasRestantes)
    } finally {
      await cleanupBu(a!.businessUnitId)
      await cleanupBu(b!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-10 · orden: sin-base antes que con-base, y con-base de menor a mayor porcentaje', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live04-sinbase', trialDays: 15, subscribedAtOverride: '2026-07-01', trialEndsAtOverride: '2026-07-15' },
      { tag: 'live04-bajo', trialDays: 15, subscribedAtOverride: '2026-07-01', trialEndsAtOverride: '2026-07-15' },
      { tag: 'live04-alto', trialDays: 15, subscribedAtOverride: '2026-07-01', trialEndsAtOverride: '2026-07-15' },
    ])
    const [sinBase, bajo, alto] = fixture.tenants
    try {
      // sinBase: nadie con turno.
      // bajo: con turno, pocas checadas.
      const empleadoBajo = await seedEmployeeWithShift(bajo!.businessUnitId, 'live04-bajo')
      await seedOnTimeDay(bajo!.businessUnitId, empleadoBajo, '2026-07-02', 'app')
      // alto: con turno, checadas todos los días de la ventana.
      const empleadoAlto = await seedEmployeeWithShift(alto!.businessUnitId, 'live04-alto')
      for (const day of ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']) {
        await seedOnTimeDay(alto!.businessUnitId, empleadoAlto, day, 'app')
      }

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: Array<Record<string, unknown>> }

      const idxSinBase = body.data.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === sinBase!.businessUnitPublicId
      )
      const idxBajo = body.data.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === bajo!.businessUnitPublicId
      )
      const idxAlto = body.data.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === alto!.businessUnitPublicId
      )

      assert.isAbove(idxSinBase, -1)
      assert.isAbove(idxBajo, -1)
      assert.isAbove(idxAlto, -1)
      // sin-base siempre antes que cualquier con-base.
      assert.isBelow(idxSinBase, idxBajo)
      assert.isBelow(idxSinBase, idxAlto)
      // Dentro de con-base: menor porcentaje (bajo) antes que mayor (alto).
      assert.isBelow(idxBajo, idxAlto)
    } finally {
      await cleanupBu(sinBase!.businessUnitId)
      await cleanupBu(bajo!.businessUnitId)
      await cleanupBu(alto!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-8 · el fallo del motor para UNA empresa la marca no-disponible; el listado sigue en 200 con las demás intactas', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live05-ok', trialDays: 10, subscribedAtOverride: '2026-06-01', trialEndsAtOverride: '2026-06-10' },
      { tag: 'live05-rota', trialDays: 10, subscribedAtOverride: '2026-06-01', trialEndsAtOverride: '2026-06-10' },
    ])
    const [ok, rota] = fixture.tenants
    // Simula el fallo del motor SOLO para el tenant "rota" — se restaura en
    // el `finally` exista o no fallo, sin dejar rastro en producción.
    const original = PlatformTrialUsageService.prototype.resolveFrecuencia
    PlatformTrialUsageService.prototype.resolveFrecuencia = async function (
      this: PlatformTrialUsageService,
      businessUnitId: number,
      ventana: { inicio: string; fin: string }
    ) {
      if (businessUnitId === rota!.businessUnitId) {
        throw new Error('fallo simulado del motor para esta empresa (RN-8)')
      }
      return original.call(this, businessUnitId, ventana)
    }

    try {
      await seedEmployeeWithShift(ok!.businessUnitId, 'live05-ok')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: Array<Record<string, unknown>> }

      const filaOk = body.data.find(
        (r) => (r.tenant as { publicId: string }).publicId === ok!.businessUnitPublicId
      )!
      const filaRota = body.data.find(
        (r) => (r.tenant as { publicId: string }).publicId === rota!.businessUnitPublicId
      )!

      assert.isDefined(filaOk)
      assert.isDefined(filaRota)
      assert.notEqual((filaOk.frecuencia as { estado: string }).estado, 'no-disponible')

      const frecuenciaRota = filaRota.frecuencia as {
        estado: string
        porcentaje: unknown
        registros: number
        empleadoDiasEvaluables: number
        empleadosEvaluados: number
      }
      assert.equal(frecuenciaRota.estado, 'no-disponible')
      assert.isNull(frecuenciaRota.porcentaje)
      assert.equal(frecuenciaRota.registros, 0)
      assert.equal(frecuenciaRota.empleadoDiasEvaluables, 0)
      assert.equal(frecuenciaRota.empleadosEvaluados, 0)
      // `no-disponible` va al FINAL, después de sin-base y con-base (RN-10).
      const idxRota = body.data.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === rota!.businessUnitPublicId
      )
      assert.equal(idxRota, body.data.length - 1)
    } finally {
      PlatformTrialUsageService.prototype.resolveFrecuencia = original
      await cleanupBu(ok!.businessUnitId)
      await cleanupBu(rota!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-9 · si el universo entero de pruebas falla, responde 500 explícito — NUNCA una lista parcial disfrazada de 200', async ({
    client,
    assert,
  }) => {
    // Rompe el universo a propósito (§6/CA-10 del molde de 078170), se
    // restaura en el `finally` exista o no fallo.
    const original = PlatformTrialService.prototype.listLiveTrials
    PlatformTrialService.prototype.listLiveTrials = async () => {
      throw new Error('fallo simulado del universo de pruebas vivas (RN-9)')
    }

    try {
      const response = await client
        .get(LIST_URL)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .loginAs(admin!.user)
      response.assertStatus(500)
      const body = response.body() as { code?: string; key?: string; data?: unknown }
      assert.equal(body.code, 'PLT.MET.SYS_UNHANDLED')
      assert.equal(body.key, 'error-inesperado-al-obtener-el-listado-de-pruebas-vivas')
      assert.isUndefined(body.data)
    } finally {
      PlatformTrialService.prototype.listLiveTrials = original
    }
  })

  test('RN-9 · si el lote de hitos falla, responde 500 explícito — NUNCA una lista parcial disfrazada de 200', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live07', trialDays: 5, subscribedAtOverride: '2026-04-01', trialEndsAtOverride: '2026-04-05' },
    ])
    const original = PlatformTenantMilestoneService.prototype.resolveMilestones
    PlatformTenantMilestoneService.prototype.resolveMilestones = async () => {
      throw new Error('fallo simulado del lote de hitos (RN-9)')
    }

    try {
      const response = await client
        .get(LIST_URL)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .loginAs(admin!.user)
      response.assertStatus(500)
      const body = response.body() as { code?: string; key?: string; data?: unknown }
      assert.equal(body.code, 'PLT.MET.SYS_UNHANDLED')
      assert.equal(body.key, 'error-inesperado-al-obtener-el-listado-de-pruebas-vivas')
      assert.isUndefined(body.data)
    } finally {
      PlatformTenantMilestoneService.prototype.resolveMilestones = original
      await cleanupBu(fixture.tenants[0]!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('la respuesta no publica identificadores internos ni identidad de personas', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live06', trialDays: 5, subscribedAtOverride: '2026-05-01', trialEndsAtOverride: '2026-05-05' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'live06')
      await createAssistRow(tenant.businessUnitId, employee, DateTime.utc(), 'manual')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      const raw = JSON.stringify(response.body())

      assert.notInclude(raw, 'businessUnitId')
      assert.notInclude(raw, 'billingSubscriptionId')
      assert.notInclude(raw, 'billingPlanId')
      assert.notInclude(raw, 'personFirstname')
      assert.notInclude(raw, 'personEmail')
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })
})

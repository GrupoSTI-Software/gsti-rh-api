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
 * USRH1789079078173 — contrato de `GET /api/platform/metrics/trials/live`
 * (spec técnico `spec-USRH1789079078173.md`, adjunto al ticket de Asana).
 *
 * Las reglas puras (comparador de orden, cruce por `businessUnitId`,
 * degradado por fila, propagación del fallo global, conteo de invocaciones
 * al motor) se prueban en `tests/unit/services/platform_live_trial_order.spec.ts`
 * con dobles, sin BD. Aquí se prueba lo que solo la base de datos real y el
 * transporte HTTP pueden romper: el universo de verdad (excluye
 * terminadas/sin prueba/borradas), el motor de asistencia corriendo por
 * tenant sin mezclar empresas, y que la fila de la lista es EXACTAMENTE
 * igual a lo que entregan las consultas individuales de esa misma empresa
 * (RN-38).
 *
 * **Piso de tres tenants (CA-02, obligatorio).** Con un solo tenant sembrado,
 * cruzar los tres insumos por posición del arreglo coincide con cruzar por
 * `businessUnitId` — el bug pasaría la prueba estando mal. Por eso el
 * escenario central de atribución siembra tres, con valores deliberadamente
 * distintos.
 *
 * El guard (401/403/200) ya está cubierto en `platform_trial_guard.spec.ts`.
 */

const TEST_PASSWORD = 'LiveTrialsMetricsTest123!'
const LIST_URL = '/api/platform/metrics/trials/live'
const TRIAL_URL = (publicId: string) => `/api/platform/metrics/tenants/${publicId}/trial`
const USAGE_URL = (publicId: string) => `/api/platform/metrics/tenants/${publicId}/trial/usage`

/** Lista cerrada de llaves — §9 del spec técnico. */
const EXPECTED_DATA_KEYS = ['total', 'pruebas']
const EXPECTED_ROW_KEYS = ['tenant', 'fin', 'diasRestantes', 'hitosCumplidos', 'hitosTotales', 'frecuencia']
const EXPECTED_FRECUENCIA_KEYS = ['estado', 'porcentaje']

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

/** Empleado con turno propio, sin checadas → `sin-base`. */
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

  test('CA-07 · sin ninguna prueba viva sembrada por este spec, la fila del control jamás aparece con datos ajenos (control de forma)', async ({
    client,
    assert,
  }) => {
    // No se puede vaciar la BD real para probar "universo vacío" en la
    // suite funcional (P8: no se trunca entre specs) — ese caso exacto vive
    // en la spec unitaria. Aquí se comprueba el contrato mínimo: `total` y
    // `pruebas` siempre presentes y coherentes entre sí.
    const response = await client.get(LIST_URL).loginAs(admin!.user)
    response.assertStatus(200)
    const body = response.body() as { type: string; data: { total: number; pruebas: unknown[] } }
    assert.equal(body.type, 'success')
    assert.deepEqual(Object.keys(body.data).sort(), EXPECTED_DATA_KEYS.sort())
    assert.equal(body.data.total, body.data.pruebas.length)
  })

  test('CA-06 · deja fuera pruebas terminadas y sin prueba/borradas; la vencida-sin-cerrar SÍ aparece con 0 días', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live01-viva', trialDays: 7, subscribedAtOverride: '2026-09-01', trialEndsAtOverride: '2026-09-30' },
      { tag: 'live01-terminada', trialDays: 7, status: 'active' },
      { tag: 'live01-sin-prueba', trialDays: 0, skipTrial: true },
      { tag: 'live01-borrada', trialDays: 7, subscriptionDeleted: true },
      // RN-06: el fin ya pasó y el proceso diario todavía no cierra —
      // sigue viva, con diasRestantes: 0.
      { tag: 'live01-vencida-sin-cerrar', trialDays: 3, subscribedAtOverride: '2020-01-01', trialEndsAtOverride: '2020-01-03' },
    ])
    try {
      await seedEmployeeWithShift(fixture.tenants[0]!.businessUnitId, 'live01-viva')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: { pruebas: Array<{ tenant: { publicId: string }; diasRestantes: number }> } }

      const porPublicId = new Map(body.data.pruebas.map((r) => [r.tenant.publicId, r]))
      assert.isTrue(porPublicId.has(fixture.tenants[0]!.businessUnitPublicId))
      assert.isFalse(porPublicId.has(fixture.tenants[1]!.businessUnitPublicId))
      assert.isFalse(porPublicId.has(fixture.tenants[2]!.businessUnitPublicId))
      assert.isFalse(porPublicId.has(fixture.tenants[3]!.businessUnitPublicId))

      assert.isTrue(porPublicId.has(fixture.tenants[4]!.businessUnitPublicId))
      assert.equal(porPublicId.get(fixture.tenants[4]!.businessUnitPublicId)!.diasRestantes, 0)
    } finally {
      for (const t of fixture.tenants) await cleanupBu(t.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-01/§9 · forma exacta de una fila: lista cerrada de llaves, tenant y frecuencia reducida', async ({
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
      const body = response.body() as { data: { pruebas: Array<Record<string, unknown>> } }
      const fila = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === tenant.businessUnitPublicId
      )!

      assert.deepEqual(Object.keys(fila).sort(), EXPECTED_ROW_KEYS.sort())
      assert.deepEqual(Object.keys(fila.tenant as object).sort(), ['nombre', 'publicId'])
      assert.deepEqual(Object.keys(fila.frecuencia as object).sort(), EXPECTED_FRECUENCIA_KEYS.sort())
      assert.equal((fila.tenant as { nombre: string }).nombre, tenant.businessUnitName)
      assert.equal(fila.fin, '2026-09-30')
      assert.typeOf(fila.diasRestantes, 'number')
      assert.typeOf(fila.hitosCumplidos, 'number')
      assert.equal(fila.hitosTotales, 7)
      assert.isAtLeast(fila.hitosCumplidos as number, 0)
      assert.isAtMost(fila.hitosCumplidos as number, fila.hitosTotales as number)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-02/RN-38 · tres tenants con valores DISTINTOS: cada fila trae exactamente lo de SU empresa, igual que las consultas individuales', async ({
    client,
    assert,
  }) => {
    // Piso obligatorio de tres tenants (§5 del spec): con uno o dos, cruzar
    // por posición del arreglo puede coincidir con cruzar por
    // `businessUnitId` y el bug pasaría la prueba estando mal.
    const finA = DateTime.utc().plus({ days: 8 }).toISODate()!
    const finB = DateTime.utc().plus({ days: 18 }).toISODate()!
    const finC = DateTime.utc().plus({ days: 28 }).toISODate()!
    const fixture = await createTenantTrialFixture([
      { tag: 'live03-a', trialDays: 8, trialEndsAtOverride: finA },
      { tag: 'live03-b', trialDays: 18, trialEndsAtOverride: finB },
      { tag: 'live03-c', trialDays: 28, trialEndsAtOverride: finC },
    ])
    const [a, b, c] = fixture.tenants
    try {
      // A: sin-base (nadie con turno), 1 hito (solo un departamento propio).
      await createDepartment(a!.businessUnitId, 'live03-a')

      // B: con-base, con checadas, 4 hitos.
      const deptB = await createDepartment(b!.businessUnitId, 'live03-b')
      const posB = await createPosition(b!.businessUnitId, 'live03-b')
      const shiftB = await createShift(b!.businessUnitId, 'live03-b')
      const employeeB = await createEmployee(b!.businessUnitId, deptB.departmentId, posB.positionId, 'live03-b')
      await createEmployeeShift(employeeB.employeeId, shiftB.shiftId, b!.businessUnitId)
      await seedOnTimeDay(b!.businessUnitId, employeeB, DateTime.utc().toISODate()!, 'app')

      // C: con-base con porcentaje 0 (turno pero SIN checadas), 6 hitos.
      const employeeC = await seedEmployeeWithShift(c!.businessUnitId, 'live03-c')
      await createDepartment(c!.businessUnitId, 'live03-c-extra')
      void employeeC

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: { pruebas: Array<Record<string, unknown>> } }

      const filaA = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === a!.businessUnitPublicId
      )!
      const filaB = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === b!.businessUnitPublicId
      )!
      const filaC = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === c!.businessUnitPublicId
      )!

      assert.equal((filaA.frecuencia as { estado: string }).estado, 'sin-base')
      assert.equal((filaB.frecuencia as { estado: string }).estado, 'con-base')
      assert.isAbove((filaB.frecuencia as { porcentaje: number }).porcentaje, 0)
      assert.equal((filaC.frecuencia as { estado: string }).estado, 'con-base')
      assert.equal((filaC.frecuencia as { porcentaje: number }).porcentaje, 0)

      assert.notEqual(filaA.fin, filaB.fin)
      assert.notEqual(filaB.fin, filaC.fin)
      assert.notEqual(filaA.diasRestantes, filaB.diasRestantes)

      // RN-38: la fila de la lista es EXACTAMENTE lo que entregan las
      // consultas individuales de esa misma empresa.
      for (const [tenantRef, fila] of [
        [a!, filaA],
        [b!, filaB],
        [c!, filaC],
      ] as const) {
        const trialResp = await client.get(TRIAL_URL(tenantRef.businessUnitPublicId)).loginAs(admin!.user)
        const usageResp = await client.get(USAGE_URL(tenantRef.businessUnitPublicId)).loginAs(admin!.user)
        const hitosCumplidosIndividual = (
          trialResp.body().data.hitos as Array<{ cumplido: boolean }>
        ).filter((h) => h.cumplido).length

        assert.equal(fila.hitosCumplidos, hitosCumplidosIndividual, `hitosCumplidos de ${tenantRef.tag}`)
        assert.equal(fila.fin, trialResp.body().data.prueba.fin, `fin de ${tenantRef.tag}`)
        assert.equal(
          fila.diasRestantes,
          trialResp.body().data.prueba.diasRestantes,
          `diasRestantes de ${tenantRef.tag}`
        )
        const frecuenciaIndividual = usageResp.body().data.frecuencia as { estado: string; porcentaje: number | null }
        assert.equal(
          (fila.frecuencia as { estado: string }).estado,
          frecuenciaIndividual.estado,
          `frecuencia.estado de ${tenantRef.tag}`
        )
        assert.equal(
          (fila.frecuencia as { porcentaje: number | null }).porcentaje,
          frecuenciaIndividual.porcentaje,
          `frecuencia.porcentaje de ${tenantRef.tag}`
        )
      }
    } finally {
      await cleanupBu(a!.businessUnitId)
      await cleanupBu(b!.businessUnitId)
      await cleanupBu(c!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-04 · orden: sin-base antes que con-base, y con-base de menor a mayor porcentaje', async ({
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
      const empleadoBajo = await seedEmployeeWithShift(bajo!.businessUnitId, 'live04-bajo')
      await seedOnTimeDay(bajo!.businessUnitId, empleadoBajo, '2026-07-02', 'app')
      const empleadoAlto = await seedEmployeeWithShift(alto!.businessUnitId, 'live04-alto')
      for (const day of ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']) {
        await seedOnTimeDay(alto!.businessUnitId, empleadoAlto, day, 'app')
      }

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: { pruebas: Array<Record<string, unknown>> } }

      const idxSinBase = body.data.pruebas.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === sinBase!.businessUnitPublicId
      )
      const idxBajo = body.data.pruebas.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === bajo!.businessUnitPublicId
      )
      const idxAlto = body.data.pruebas.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === alto!.businessUnitPublicId
      )

      assert.isAbove(idxSinBase, -1)
      assert.isAbove(idxBajo, -1)
      assert.isAbove(idxAlto, -1)
      assert.isBelow(idxSinBase, idxBajo)
      assert.isBelow(idxSinBase, idxAlto)
      assert.isBelow(idxBajo, idxAlto)
    } finally {
      await cleanupBu(sinBase!.businessUnitId)
      await cleanupBu(bajo!.businessUnitId)
      await cleanupBu(alto!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-03/RN-53 · el fallo del motor para UNA empresa la marca no-disponible; el listado sigue en 200 con las demás intactas y al final del orden', async ({
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
        throw new Error('fallo simulado del motor para esta empresa (RN-53)')
      }
      return original.call(this, businessUnitId, ventana)
    }

    try {
      await seedEmployeeWithShift(ok!.businessUnitId, 'live05-ok')

      const response = await client.get(LIST_URL).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body() as { data: { pruebas: Array<Record<string, unknown>> } }

      const filaOk = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === ok!.businessUnitPublicId
      )!
      const filaRota = body.data.pruebas.find(
        (r) => (r.tenant as { publicId: string }).publicId === rota!.businessUnitPublicId
      )!

      assert.isDefined(filaOk)
      assert.isDefined(filaRota)
      assert.notEqual((filaOk.frecuencia as { estado: string }).estado, 'no-disponible')

      const frecuenciaRota = filaRota.frecuencia as { estado: string; porcentaje: unknown }
      assert.equal(frecuenciaRota.estado, 'no-disponible')
      assert.isNull(frecuenciaRota.porcentaje)

      // no-disponible va al FINAL, después de sin-base y con-base (RN-36).
      const idxRota = body.data.pruebas.findIndex(
        (r) => (r.tenant as { publicId: string }).publicId === rota!.businessUnitPublicId
      )
      assert.equal(idxRota, body.data.pruebas.length - 1)
    } finally {
      PlatformTrialUsageService.prototype.resolveFrecuencia = original
      await cleanupBu(ok!.businessUnitId)
      await cleanupBu(rota!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('regla local "fallo global ≠ fallo de fila" · si el universo entero de pruebas falla, responde 500 explícito — NUNCA una lista parcial disfrazada de 200', async ({
    client,
    assert,
  }) => {
    const original = PlatformTrialService.prototype.listLiveTrials
    PlatformTrialService.prototype.listLiveTrials = async () => {
      throw new Error('fallo simulado del universo de pruebas vivas')
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
      assert.equal(body.key, 'error-inesperado-al-obtener-las-pruebas-vivas')
      assert.isUndefined(body.data)
    } finally {
      PlatformTrialService.prototype.listLiveTrials = original
    }
  })

  test('regla local "fallo global ≠ fallo de fila" · si el lote de hitos falla, responde 500 explícito — NUNCA una lista parcial disfrazada de 200', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'live07', trialDays: 5, subscribedAtOverride: '2026-04-01', trialEndsAtOverride: '2026-04-05' },
    ])
    const original = PlatformTenantMilestoneService.prototype.resolveMilestones
    PlatformTenantMilestoneService.prototype.resolveMilestones = async () => {
      throw new Error('fallo simulado del lote de hitos')
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
      assert.equal(body.key, 'error-inesperado-al-obtener-las-pruebas-vivas')
      assert.isUndefined(body.data)
    } finally {
      PlatformTenantMilestoneService.prototype.resolveMilestones = original
      await cleanupBu(fixture.tenants[0]!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-41 · la respuesta no publica identificadores internos ni identidad de personas', async ({
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

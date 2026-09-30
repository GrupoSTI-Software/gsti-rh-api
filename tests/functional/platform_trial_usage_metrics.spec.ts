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
import Holiday from '#models/holiday'
import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import { createTenantTrialFixture } from './helpers/platform_trial_fixture.js'
import { ASSIST_ORIGIN } from '#constants/assist_origin'

/**
 * USRH1789079078171 — contrato de `GET /api/platform/metrics/tenants/:publicId/trial/usage`.
 * USRH1789079078172 — el bloque `canales` de la misma respuesta.
 *
 * Las reglas puras (traducción del motor, `sin-base` nunca `0`, mapeo del
 * fallo, traducción de `assist_origin`, borde DST-aware) se prueban en
 * `tests/unit/services/platform_trial_frequency.spec.ts` y
 * `tests/unit/services/platform_trial_channels.spec.ts` con fixtures, sin
 * BD. Aquí se prueba lo que solo la base de datos real y el transporte
 * pueden romper: el motor corriendo de verdad sobre datos sembrados, el
 * aislamiento entre dos tenants (F13 / RN-8) y el borde de cancelación (RB-9).
 *
 * **Disciplina de aserción (obligatoria, §5 del spec).** La suite funcional
 * no trunca ni transacciona entre pruebas (`tests/bootstrap.ts`): ningún
 * assert de este archivo compara contra una cifra absoluta. Para un tenant
 * recién creado la primera lectura es determinista y vale como línea base —
 * `sin-base` con todo en cero — y de ahí en adelante todo se mide por delta
 * contra esa línea base, por desigualdad, o por autoconsistencia
 * (`porcentaje === round(registros/base*1000)/10` sobre los propios valores
 * de la respuesta). Molde vivo: `tests/functional/platform_receivables_metrics.spec.ts:417-418`.
 */

const TEST_PASSWORD = 'TrialUsageMetricsTest123!'
const BASE_URL = '/api/platform/metrics/tenants'

/** Llaves exactas del payload. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_DATA_KEYS = ['tenant', 'ventana', 'frecuencia', 'serie', 'canales']
const EXPECTED_FRECUENCIA_KEYS = ['estado', 'porcentaje', 'registros', 'empleadoDiasEvaluables', 'empleadosEvaluados']
const EXPECTED_SERIE_DIA_KEYS = [...EXPECTED_FRECUENCIA_KEYS, 'dia']
/** Llaves exactas del desglose por canal (USRH1789079078172). Seis canales + total. */
const EXPECTED_CANALES_KEYS = [
  'autoservicio',
  'capturaAdministrador',
  'sincronizacion',
  'manualLegado',
  'dispositivo',
  'checadorAdms',
  'total',
]

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Usage',
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
    personFirstname: 'Uso',
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
  employee.employeeFirstName = 'Uso'
  employee.employeeLastName = tag
  await employee.save()
  return employee
}

async function createEmployeeShift(
  employeeId: number,
  shiftId: number,
  businessUnitId: number,
  applySince = '2020-01-01'
): Promise<void> {
  const es = new EmployeeShift()
  es.employeeId = employeeId
  es.shiftId = shiftId
  es.businessUnitId = businessUnitId
  // Por omisión cubre cualquier ventana de prueba que se siembre en este
  // archivo; `applySince` explícito simula un alta a mitad de la ventana
  // (CA-07).
  es.employeShiftsApplySince = applySince
  await es.save()
}

/** Turno con `shiftRestDays` explícito (CA-06: forzar un día de descanso dentro de la ventana). */
async function createShiftWithRestDays(businessUnitId: number, tag: string, restDaysCsv: string): Promise<Shift> {
  return Shift.create({
    shiftName: `Turno ${tag} ${STAMP()}`.slice(0, 100),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: restDaysCsv,
    shiftAccumulatedFault: 1,
    businessUnitId,
    shiftTemp: 0,
  })
}

async function createAssistRow(
  businessUnitId: number,
  employee: Employee,
  punchTime: DateTime,
  origin: string
): Promise<Assist> {
  const assist = new Assist()
  assist.assistEmpCode = String(employee.employeeCode)
  assist.assistTerminalSn = 'TEST-USAGE'
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
  return assist
}

/**
 * Siembra un día "a tiempo" completo (entrada + salida) para un turno de
 * 08:00-16:00 local. Las dos checadas son obligatorias: con solo la entrada,
 * `computeCheckInStatus` (attendance-stats.repository.mysql.ts:766-776) escala
 * el día a `fault` en cuanto "ahora" (el reloj real de quien corre la prueba)
 * pasa 30 min del fin de turno esperado — y para cualquier fecha histórica
 * ya pasó. Sin la salida, TODAS las checadas de este archivo caerían en
 * `fault`, que nunca entra al numerador de `registros` (RB-1).
 *
 * Horas en UTC: el turno es 08:00 local y, en verano (abril-octubre), el
 * biométrico registra con DST (+5) — ver `utc_offset` en el repositorio del
 * motor. Todas las ventanas de este archivo caen en ese rango.
 */
async function seedOnTimeDay(
  businessUnitId: number,
  employee: Employee,
  day: string,
  origin: string
): Promise<void> {
  await createAssistRow(businessUnitId, employee, DateTime.fromISO(`${day}T13:00:00`, { zone: 'utc' }), origin)
  await createAssistRow(businessUnitId, employee, DateTime.fromISO(`${day}T21:00:00`, { zone: 'utc' }), origin)
}

/** Empleado con turno propio, cubriendo toda la ventana que se le pida. Sin checadas. */
async function seedEmployeeWithShift(businessUnitId: number, tag: string): Promise<Employee> {
  const dept = await createDepartment(businessUnitId, tag)
  const pos = await createPosition(businessUnitId, tag)
  const shift = await createShift(businessUnitId, tag)
  const employee = await createEmployee(businessUnitId, dept.departmentId, pos.positionId, tag)
  await createEmployeeShift(employee.employeeId, shift.shiftId, businessUnitId)
  return employee
}

/** Borra en físico todo lo colgado de un tenant sembrado por este archivo. */
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

test.group('GET /trial/usage — contrato y transporte (USRH1789079078171)', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('usage-admin', true)
    outsider = await createActor('usage-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('CA-10 · tenant sin prueba: 200 con ventana/frecuencia/serie en null/[] — el motor no se invoca', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([{ tag: 'ca10', trialDays: 0, skipTrial: true }])
    try {
      const tenant = fixture.tenants[0]!
      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const body = response.body()
      assert.deepEqual(Object.keys(body.data).sort(), EXPECTED_DATA_KEYS.sort())
      assert.isNull(body.data.ventana)
      assert.isNull(body.data.frecuencia)
      assert.deepEqual(body.data.serie, [])
      // RN-7 (078172): tenant sin prueba → ausencia explícita, NUNCA un
      // desglose en ceros que se leería como "prueba sin uso".
      assert.isNull(body.data.canales)
    } finally {
      await fixture.cleanup()
    }
  })

  test('404 — tenant inexistente responde el cuerpo literal de USRH1789079078169', async ({
    client,
  }) => {
    const response = await client
      .get(`${BASE_URL}/00000000-0000-0000-0000-000000000000/trial/usage`)
      .loginAs(admin!.user)

    response.assertStatus(404)
    response.assertBodyContains({ code: 'PLT.MET.TENANT_NOT_FOUND', key: 'tenant-no-encontrado' })
  })

  test('sin permiso de plataforma responde 403 sin campo code', async ({ client, assert }) => {
    const response = await client
      .get(`${BASE_URL}/no-existe-00000/trial/usage`)
      .loginAs(outsider!.user)

    response.assertStatus(403)
    assert.isUndefined(response.body().code)
  })

  test('sin sesión responde 401', async ({ client }) => {
    const response = await client.get(`${BASE_URL}/no-existe-00000/trial/usage`)
    response.assertStatus(401)
  })

  test('CA-01/CA-02 · camino feliz: con base, autoconsistencia y la serie suma el acumulado', async ({
    client,
    assert,
  }) => {
    // Ventana fija y cerrada, en el pasado, para que la siembra sea exacta y
    // determinista: no depende de "hoy". `finEfectivo` = `fin` (RB-9: sin
    // cancelación, el mínimo entre hoyCivil/fin/canceladoEn es `fin`, que ya
    // pasó frente a "hoy").
    const fixture = await createTenantTrialFixture([
      {
        tag: 'ca01',
        trialDays: 3,
        subscribedAtOverride: '2020-06-01 09:00:00',
        trialEndsAtOverride: '2020-06-03',
      },
    ])
    const tenant = fixture.tenants[0]!
    let employeeId: number | null = null
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'ca01')
      employeeId = employee.employeeId
      // Dos días completos (entrada+salida) dentro de la ventana
      // [2020-06-01, 2020-06-03]; un tercero fuera de ventana (no debe contar
      // ni en el numerador ni en el denominador).
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-06-01', 'manual')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-06-02', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-06-10', 'app')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data

      assert.deepEqual(Object.keys(data).sort(), EXPECTED_DATA_KEYS.sort())
      assert.deepEqual(data.ventana, { inicio: '2020-06-01', fin: '2020-06-03' })
      assert.deepEqual(Object.keys(data.frecuencia).sort(), EXPECTED_FRECUENCIA_KEYS.sort())

      assert.equal(data.frecuencia.estado, 'con-base')
      assert.isAbove(data.frecuencia.empleadoDiasEvaluables, 0)
      assert.isAbove(data.frecuencia.registros, 0)

      // Autoconsistencia: el porcentaje siempre sale de sus propios números,
      // pase lo que pase con la cifra absoluta (prohibido assertarla, §5).
      const esperado =
        Math.round((data.frecuencia.registros / data.frecuencia.empleadoDiasEvaluables) * 1000) / 10
      assert.equal(data.frecuencia.porcentaje, esperado)

      // CA-02: la serie suma el acumulado, y trae un punto por cada día
      // [2020-06-01, 2020-06-03] inclusive → exactamente 3 puntos (regla del
      // motor, no una cifra de negocio: el tamaño de la ventana lo fija esta
      // misma prueba, no un total absoluto ajeno).
      assert.lengthOf(data.serie, 3)
      for (const dia of data.serie) {
        assert.deepEqual(Object.keys(dia).sort(), EXPECTED_SERIE_DIA_KEYS.sort())
      }
      const sumaRegistros = data.serie.reduce((acc: number, d: { registros: number }) => acc + d.registros, 0)
      const sumaBase = data.serie.reduce(
        (acc: number, d: { empleadoDiasEvaluables: number }) => acc + d.empleadoDiasEvaluables,
        0
      )
      assert.equal(sumaRegistros, data.frecuencia.registros)
      assert.equal(sumaBase, data.frecuencia.empleadoDiasEvaluables)
      // La del 3ro de junio no aparece: quedó fuera de la ventana.
      assert.isFalse(data.serie.some((d: { dia: string }) => d.dia === '2020-06-10'))
    } finally {
      if (employeeId) await db.from('assists').where('assist_emp_id', employeeId).delete()
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-03 · sin ningún empleado con turno: sin-base, porcentaje null — NUNCA 0', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'ca03', trialDays: 3, subscribedAtOverride: '2020-07-01', trialEndsAtOverride: '2020-07-03' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.frecuencia.estado, 'sin-base')
      assert.isNull(data.frecuencia.porcentaje)
      assert.equal(data.frecuencia.registros, 0)
      assert.equal(data.frecuencia.empleadoDiasEvaluables, 0)
      // Todos los puntos de la serie también salen sin-base (CA-06/RB-7).
      for (const dia of data.serie) {
        assert.equal(dia.estado, 'sin-base')
        assert.isNull(dia.porcentaje)
      }
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-04 · con empleados con turno y CERO checadas: con-base, porcentaje 0 — distinguible de sin-base', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'ca04', trialDays: 3, subscribedAtOverride: '2020-08-01', trialEndsAtOverride: '2020-08-03' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      await seedEmployeeWithShift(tenant.businessUnitId, 'ca04')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.frecuencia.estado, 'con-base')
      assert.equal(data.frecuencia.porcentaje, 0)
      assert.equal(data.frecuencia.registros, 0)
      assert.isAbove(data.frecuencia.empleadoDiasEvaluables, 0)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-05 · prueba cancelada a la mitad: el corte llega resuelto — estrictamente menos base, mismo numerador, mayor %', async ({
    client,
    assert,
  }) => {
    // Dos tenants idénticos: mismo empleado+turno, mismas checadas los
    // primeros días. Uno se cancela a la mitad de una ventana de 10 días; el
    // otro corre completa. La verificación es por DESIGUALDAD, nunca por
    // cifra absoluta (§5, CA-05 obligatorio).
    const fixture = await createTenantTrialFixture([
      {
        tag: 'ca05-cancel',
        trialDays: 10,
        subscribedAtOverride: '2020-09-01',
        trialEndsAtOverride: '2020-09-10',
        canceledAt: '2020-09-05',
        status: 'canceled',
      },
      {
        tag: 'ca05-full',
        trialDays: 10,
        subscribedAtOverride: '2020-09-01',
        trialEndsAtOverride: '2020-09-10',
      },
    ])
    const [cancelado, completo] = fixture.tenants
    try {
      // Mismas checadas para los dos, TODAS antes del día de cancelación
      // (2020-09-05), para que el numerador sea idéntico entre ambos.
      for (const tenant of [cancelado!, completo!]) {
        const employee = await seedEmployeeWithShift(tenant.businessUnitId, tenant.tag)
        await seedOnTimeDay(tenant.businessUnitId, employee, '2020-09-02', 'manual')
        await seedOnTimeDay(tenant.businessUnitId, employee, '2020-09-03', 'app')
      }

      const [respCancelado, respCompleto] = await Promise.all([
        client.get(`${BASE_URL}/${cancelado!.businessUnitPublicId}/trial/usage`).loginAs(admin!.user),
        client.get(`${BASE_URL}/${completo!.businessUnitPublicId}/trial/usage`).loginAs(admin!.user),
      ])

      respCancelado.assertStatus(200)
      respCompleto.assertStatus(200)
      const dataCancelado = respCancelado.body().data
      const dataCompleto = respCompleto.body().data

      // El borde llega resuelto: ventana.fin del cancelado es el día de la
      // cancelación, no el fin contratado.
      assert.equal(dataCancelado.ventana.fin, '2020-09-05')
      assert.equal(dataCompleto.ventana.fin, '2020-09-10')
      assert.lengthOf(dataCancelado.serie, 5) // 01..05
      assert.lengthOf(dataCompleto.serie, 10) // 01..10

      assert.equal(dataCancelado.frecuencia.registros, dataCompleto.frecuencia.registros)
      assert.isBelow(
        dataCancelado.frecuencia.empleadoDiasEvaluables,
        dataCompleto.frecuencia.empleadoDiasEvaluables
      )
      assert.isAbove(dataCancelado.frecuencia.porcentaje, dataCompleto.frecuencia.porcentaje)
    } finally {
      await cleanupBu(cancelado!.businessUnitId)
      await cleanupBu(completo!.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-08 · el canal no cambia la frecuencia: captura de administrador/sincronización cuentan igual', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'ca08', trialDays: 2, subscribedAtOverride: '2020-10-01', trialEndsAtOverride: '2020-10-02' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'ca08')
      // Ninguna es de autoservicio: un día con captura de administrador, otro
      // con sync.
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-10-01', 'admin_capture')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-10-02', 'sync')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.frecuencia.estado, 'con-base')
      assert.isAbove(data.frecuencia.registros, 0)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-09 · prueba terminada por vencimiento: ventana.fin === finEfectivo === prueba.fin, sin días posteriores', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'ca09', trialDays: 4, subscribedAtOverride: '2020-11-01', trialEndsAtOverride: '2020-11-04' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.ventana.fin, '2020-11-04')
      assert.lengthOf(data.serie, 4)
      assert.isFalse(data.serie.some((d: { dia: string }) => d.dia > '2020-11-04'))
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-13 · aislamiento entre empresas: sembrar un segundo tenant en la misma ventana da delta CERO en el primero', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'ca13-a', trialDays: 5, subscribedAtOverride: '2020-12-01', trialEndsAtOverride: '2020-12-05' },
    ])
    const tenantA = fixture.tenants[0]!
    try {
      const employeeA = await seedEmployeeWithShift(tenantA.businessUnitId, 'ca13-a')
      await createAssistRow(
        tenantA.businessUnitId,
        employeeA,
        DateTime.fromISO('2020-12-02T14:00:00', { zone: 'utc' }),
        'app'
      )

      const antes = await client
        .get(`${BASE_URL}/${tenantA.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)
      antes.assertStatus(200)
      const dataAntes = antes.body().data

      // Segundo tenant, MISMA ventana civil, con más gente y más checadas.
      const fixtureB = await createTenantTrialFixture([
        { tag: 'ca13-b', trialDays: 5, subscribedAtOverride: '2020-12-01', trialEndsAtOverride: '2020-12-05' },
      ])
      const tenantB = fixtureB.tenants[0]!
      try {
        const employeeB1 = await seedEmployeeWithShift(tenantB.businessUnitId, 'ca13-b1')
        const employeeB2 = await seedEmployeeWithShift(tenantB.businessUnitId, 'ca13-b2')
        await seedOnTimeDay(tenantB.businessUnitId, employeeB1, '2020-12-03', 'app')
        await seedOnTimeDay(tenantB.businessUnitId, employeeB2, '2020-12-04', 'app')

        const despues = await client
          .get(`${BASE_URL}/${tenantA.businessUnitPublicId}/trial/usage`)
          .loginAs(admin!.user)
        despues.assertStatus(200)
        const dataDespues = despues.body().data

        // Delta CERO en el tenant A, punto por punto de la serie incluido.
        assert.equal(dataDespues.frecuencia.registros, dataAntes.frecuencia.registros)
        assert.equal(
          dataDespues.frecuencia.empleadoDiasEvaluables,
          dataAntes.frecuencia.empleadoDiasEvaluables
        )
        assert.equal(dataDespues.frecuencia.empleadosEvaluados, dataAntes.frecuencia.empleadosEvaluados)
        assert.deepEqual(dataDespues.serie, dataAntes.serie)
      } finally {
        await cleanupBu(tenantB.businessUnitId)
        await fixtureB.cleanup()
      }
    } finally {
      await cleanupBu(tenantA.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-06 · un día de descanso dentro de una ventana con base: ese día sale sin-base; los demás no se contagian', async ({
    client,
    assert,
  }) => {
    // Ventana de 3 días: lunes, MARTES (descanso), miércoles.
    const fixture = await createTenantTrialFixture([
      { tag: 'ca06', trialDays: 3, subscribedAtOverride: '2020-07-06', trialEndsAtOverride: '2020-07-08' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const dept = await createDepartment(tenant.businessUnitId, 'ca06')
      const pos = await createPosition(tenant.businessUnitId, 'ca06')
      // shiftRestDays='2' → martes de descanso (convención lunes=1..domingo=7,
      // ver comentario de attendance-stats.repository.mysql.ts:507-509).
      const shift = await createShiftWithRestDays(tenant.businessUnitId, 'ca06', '2')
      const employee = await createEmployee(tenant.businessUnitId, dept.departmentId, pos.positionId, 'ca06')
      await createEmployeeShift(employee.employeeId, shift.shiftId, tenant.businessUnitId)
      // Checadas los TRES días — el motor debe ignorar la del día de
      // descanso al construir el calendario (hasShift && !isRestDay), no por
      // ausencia de checada.
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-07-06', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-07-07', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-07-08', 'app')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.lengthOf(data.serie, 3)

      const lunes = data.serie.find((d: { dia: string }) => d.dia === '2020-07-06')
      const martes = data.serie.find((d: { dia: string }) => d.dia === '2020-07-07')
      const miercoles = data.serie.find((d: { dia: string }) => d.dia === '2020-07-08')

      assert.equal(lunes.estado, 'con-base')
      assert.equal(miercoles.estado, 'con-base')
      // El día de descanso sale sin-base — NUNCA 0% (RB-3): no hay base que
      // medir ese día, no es que el empleado haya faltado.
      assert.equal(martes.estado, 'sin-base')
      assert.isNull(martes.porcentaje)
      assert.equal(martes.empleadoDiasEvaluables, 0)

      // El agregado de la ventana solo suma los DOS días evaluables (RB-2):
      // el descanso no cuenta en el denominador ni se contagia a los vecinos.
      assert.equal(data.frecuencia.empleadoDiasEvaluables, lunes.empleadoDiasEvaluables + miercoles.empleadoDiasEvaluables)
      assert.equal(data.frecuencia.registros, lunes.registros + miercoles.registros)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-24 · un festivo oficial dentro de la ventana también sale sin-base, igual que el descanso', async ({
    client,
    assert,
  }) => {
    // El ticket (§"Cómo sabremos que quedó bien") nombra CUATRO exclusiones
    // por separado: descanso, vacaciones, festivo, incapacidad. CA-06 ya
    // prueba descanso; este caso prueba festivo — el motor no distingue tipo
    // de exclusión en el código de ESTE servicio (RN-24: "no se define una
    // regla propia"), pero el ticket las nombra una por una, así que se
    // ejercita al menos un segundo tipo en vez de asumir que "una alcanza".
    const fixture = await createTenantTrialFixture([
      { tag: 'rn24-hol', trialDays: 3, subscribedAtOverride: '2020-05-04', trialEndsAtOverride: '2020-05-06' },
    ])
    const tenant = fixture.tenants[0]!
    let holidayId: number | null = null
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'rn24-hol')
      const businessUnitSlug = await db
        .from('business_units')
        .where('business_unit_id', tenant.businessUnitId)
        .select('business_unit_slug')
        .first()
      const holiday = await Holiday.create({
        holidayName: `Festivo RN24 ${STAMP()}`,
        holidayDate: '2020-05-05',
        holidayBusinessUnits: businessUnitSlug.business_unit_slug,
        holidayIcon: null,
        holidayIconId: null,
        holidayFrequency: 1,
        holidayIsOfficialRestDay: true,
      })
      holidayId = holiday.holidayId
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-04', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-05', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-06', 'app')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      const festivo = data.serie.find((d: { dia: string }) => d.dia === '2020-05-05')
      const otroDia = data.serie.find((d: { dia: string }) => d.dia === '2020-05-04')

      assert.equal(festivo.estado, 'sin-base')
      assert.isNull(festivo.porcentaje)
      assert.equal(festivo.empleadoDiasEvaluables, 0)
      assert.equal(otroDia.estado, 'con-base')
    } finally {
      if (holidayId) await db.from('holidays').where('holiday_id', holidayId).delete()
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-24 · vacaciones dentro de la ventana (mecanismo de shift_exceptions) también sale sin-base', async ({
    client,
    assert,
  }) => {
    // Tercer mecanismo distinto de exclusión (los otros dos: shift_rest_days
    // en CA-06, tabla holidays en la prueba de festivo): vacaciones e
    // incapacidad viven en `shift_exceptions` — comparten el mismo join que
    // `has_day_excluding_exc` en el repositorio del motor. Se ejercita con
    // 'vacation' porque no depende de una tabla adicional (work_disability_*).
    const vacationType = await ExceptionType.query()
      .where('exception_type_slug', 'vacation')
      .firstOrFail()

    const fixture = await createTenantTrialFixture([
      { tag: 'rn24-vac', trialDays: 3, subscribedAtOverride: '2020-05-11', trialEndsAtOverride: '2020-05-13' },
    ])
    const tenant = fixture.tenants[0]!
    let shiftExceptionId: number | null = null
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'rn24-vac')
      const exception = await ShiftException.create({
        employeeId: employee.employeeId,
        businessUnitId: tenant.businessUnitId,
        exceptionTypeId: vacationType.exceptionTypeId,
        shiftExceptionsDate: '2020-05-12',
        shiftExceptionsDescription: 'RN-24 vacaciones',
      })
      shiftExceptionId = exception.shiftExceptionId
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-11', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-12', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-05-13', 'app')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      const vacaciones = data.serie.find((d: { dia: string }) => d.dia === '2020-05-12')
      const otroDia = data.serie.find((d: { dia: string }) => d.dia === '2020-05-11')

      assert.equal(vacaciones.estado, 'sin-base')
      assert.isNull(vacaciones.porcentaje)
      assert.equal(vacaciones.empleadoDiasEvaluables, 0)
      assert.equal(otroDia.estado, 'con-base')
    } finally {
      if (shiftExceptionId) await db.from('shift_exceptions').where('shift_exception_id', shiftExceptionId).delete()
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-07 · alta a mitad de la ventana: los días previos al turno salen sin-base, no faltas', async ({
    client,
    assert,
  }) => {
    // Ventana de 5 días; el turno del único empleado aplica desde el DÍA 3
    // (alta tardía) — replica el caso citado por el spec: "el primer
    // empleado del tenant se da de alta a mitad de la prueba".
    const fixture = await createTenantTrialFixture([
      { tag: 'ca07', trialDays: 5, subscribedAtOverride: '2020-08-10', trialEndsAtOverride: '2020-08-14' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const dept = await createDepartment(tenant.businessUnitId, 'ca07')
      const pos = await createPosition(tenant.businessUnitId, 'ca07')
      const shift = await createShift(tenant.businessUnitId, 'ca07')
      const employee = await createEmployee(tenant.businessUnitId, dept.departmentId, pos.positionId, 'ca07')
      // Alta el día 3 de la ventana (2020-08-12): los días 10-11 no tienen
      // turno vigente todavía.
      await createEmployeeShift(employee.employeeId, shift.shiftId, tenant.businessUnitId, '2020-08-12')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-08-12', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-08-13', 'app')
      await seedOnTimeDay(tenant.businessUnitId, employee, '2020-08-14', 'app')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.lengthOf(data.serie, 5)

      const previos = data.serie.filter((d: { dia: string }) => d.dia < '2020-08-12')
      const conTurno = data.serie.filter((d: { dia: string }) => d.dia >= '2020-08-12')

      assert.lengthOf(previos, 2)
      assert.lengthOf(conTurno, 3)
      for (const dia of previos) {
        // Sin turno vigente ese día = sin base que medir, NUNCA una falta ni
        // un 0% (RB-3/RB-7): el empleado todavía no existía para el motor.
        assert.equal(dia.estado, 'sin-base', `día previo al alta (${dia.dia}) debía ser sin-base`)
        assert.isNull(dia.porcentaje)
      }
      for (const dia of conTurno) {
        assert.equal(dia.estado, 'con-base', `día con turno vigente (${dia.dia}) debía ser con-base`)
      }

      // El agregado de la ventana completa solo cuenta los 3 días con turno.
      const sumaBaseConTurno = conTurno.reduce(
        (acc: number, d: { empleadoDiasEvaluables: number }) => acc + d.empleadoDiasEvaluables,
        0
      )
      assert.equal(data.frecuencia.empleadoDiasEvaluables, sumaBaseConTurno)
      assert.equal(data.frecuencia.estado, 'con-base')
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })
})

/**
 * `assist_origin = NULL` — checadas de la demo del recorrido guiado o
 * históricos previos a USRH1787157820192 (RN-3): no entran a ningún canal ni
 * al total. `createAssistRow` no admite `null` en su firma (`origin: string`);
 * se crea con un origen cualquiera y se limpia la columna a mano.
 */
async function createAssistRowWithoutOrigin(
  businessUnitId: number,
  employee: Employee,
  punchTime: DateTime
): Promise<void> {
  const assist = await createAssistRow(businessUnitId, employee, punchTime, ASSIST_ORIGIN.MANUAL)
  await db.from('assists').where('assist_id', assist.assistId).update({ assist_origin: null })
}

test.group('GET /trial/usage — desglose por canal `canales` (USRH1789079078172)', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('usage-channels-admin', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-1 · varias vías: los seis canales traen su conteo y el total es la suma exacta', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'canal01', trialDays: 3, subscribedAtOverride: '2021-06-01', trialEndsAtOverride: '2021-06-03' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'canal01')
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-01T13:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-01T21:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-02T13:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.ADMIN_CAPTURE
      )
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-02T21:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SYNC
      )
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-03T13:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.MANUAL
      )
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-03T21:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.ADMS
      )

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.deepEqual(Object.keys(data.canales).sort(), EXPECTED_CANALES_KEYS.sort())
      assert.equal(data.canales.autoservicio, 2)
      assert.equal(data.canales.capturaAdministrador, 1)
      assert.equal(data.canales.sincronizacion, 1)
      assert.equal(data.canales.manualLegado, 1)
      assert.equal(data.canales.checadorAdms, 1)
      // RN-5 declarado: "dispositivo" está reservado, hoy nunca tiene checadas.
      assert.equal(data.canales.dispositivo, 0)
      // RN-4: el total es la suma exacta de los seis.
      assert.equal(
        data.canales.total,
        data.canales.autoservicio +
          data.canales.capturaAdministrador +
          data.canales.sincronizacion +
          data.canales.manualLegado +
          data.canales.dispositivo +
          data.canales.checadorAdms
      )
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-2 · todo lo capturó el administrador: ese canal trae todas, los otros cinco en cero', async ({
    client,
    assert,
  }) => {
    // El caso que le da valor al ticket: una empresa que "parece sana" en
    // frecuencia pero no adoptó la forma de registrar — se ve solo en canales.
    const fixture = await createTenantTrialFixture([
      { tag: 'canal02', trialDays: 3, subscribedAtOverride: '2021-06-10', trialEndsAtOverride: '2021-06-12' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'canal02')
      for (const day of ['2021-06-10', '2021-06-11', '2021-06-12']) {
        await seedOnTimeDay(tenant.businessUnitId, employee, day, ASSIST_ORIGIN.ADMIN_CAPTURE)
      }

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.isAbove(data.canales.capturaAdministrador, 0)
      assert.equal(data.canales.total, data.canales.capturaAdministrador)
      assert.equal(data.canales.autoservicio, 0)
      assert.equal(data.canales.sincronizacion, 0)
      assert.equal(data.canales.manualLegado, 0)
      assert.equal(data.canales.dispositivo, 0)
      assert.equal(data.canales.checadorAdms, 0)
      // RN-6: el canal no tiene por qué cuadrar con la frecuencia — no se
      // exige ninguna relación entre `canales.total` y `frecuencia.registros`.
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-3 · prueba viva sin checadas todavía: los seis canales y el total salen en cero, sin error', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([{ tag: 'canal03', trialDays: 5 }])
    const tenant = fixture.tenants[0]!
    try {
      await seedEmployeeWithShift(tenant.businessUnitId, 'canal03')

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.deepEqual(Object.keys(data.canales).sort(), EXPECTED_CANALES_KEYS.sort())
      for (const campo of EXPECTED_CANALES_KEYS) {
        assert.equal(data.canales[campo], 0, `canal "${campo}" debía salir en 0, no ausente ni error`)
      }
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('CA-4 · prueba terminada: solo cuentan las checadas de su ventana, ni antes del inicio ni después del fin', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'canal04', trialDays: 3, subscribedAtOverride: '2021-07-01', trialEndsAtOverride: '2021-07-03' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'canal04')
      // Dentro de la ventana [2021-07-01, 2021-07-03].
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-07-02T15:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )
      // Antes del inicio de la ventana.
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-06-28T15:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )
      // Después del fin de la ventana.
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-07-10T15:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      // Exactamente una checada cuenta — la de dentro de la ventana. Las de
      // fuera (antes/después) están fuera del corte por construcción.
      assert.equal(data.canales.autoservicio, 1)
      assert.equal(data.canales.total, 1)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-3 · checadas sin canal (demo del recorrido guiado) no se suman a ningún canal ni al total', async ({
    client,
    assert,
  }) => {
    const fixture = await createTenantTrialFixture([
      { tag: 'canal05', trialDays: 3, subscribedAtOverride: '2021-07-15', trialEndsAtOverride: '2021-07-17' },
    ])
    const tenant = fixture.tenants[0]!
    try {
      const employee = await seedEmployeeWithShift(tenant.businessUnitId, 'canal05')
      await createAssistRowWithoutOrigin(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-07-16T15:00:00', { zone: 'utc' })
      )
      // Una checada CON canal, para comprobar que la ausencia de canal no
      // rompe el conteo de las demás.
      await createAssistRow(
        tenant.businessUnitId,
        employee,
        DateTime.fromISO('2021-07-16T21:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )

      const response = await client
        .get(`${BASE_URL}/${tenant.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.canales.autoservicio, 1)
      // El total NUNCA cuenta la checada sin canal: 1, no 2.
      assert.equal(data.canales.total, 1)
    } finally {
      await cleanupBu(tenant.businessUnitId)
      await fixture.cleanup()
    }
  })

  test('RN-8 · aislamiento entre empresas: el desglose de una NUNCA incluye checadas de otra', async ({
    client,
    assert,
  }) => {
    // El propio ticket es explícito: "solo se detecta con dos empresas
    // sembradas" — un `GROUP BY assist_origin` sin `WHERE business_unit_id`
    // da un total plausible que no se ve mal y esconde la fuga.
    const fixture = await createTenantTrialFixture([
      { tag: 'canal06-a', trialDays: 3, subscribedAtOverride: '2021-08-01', trialEndsAtOverride: '2021-08-03' },
    ])
    const tenantA = fixture.tenants[0]!
    try {
      const employeeA = await seedEmployeeWithShift(tenantA.businessUnitId, 'canal06-a')
      await createAssistRow(
        tenantA.businessUnitId,
        employeeA,
        DateTime.fromISO('2021-08-02T15:00:00', { zone: 'utc' }),
        ASSIST_ORIGIN.SELF_SERVICE
      )

      const antes = await client
        .get(`${BASE_URL}/${tenantA.businessUnitPublicId}/trial/usage`)
        .loginAs(admin!.user)
      antes.assertStatus(200)
      const dataAntes = antes.body().data

      const fixtureB = await createTenantTrialFixture([
        { tag: 'canal06-b', trialDays: 3, subscribedAtOverride: '2021-08-01', trialEndsAtOverride: '2021-08-03' },
      ])
      const tenantB = fixtureB.tenants[0]!
      try {
        const employeeB = await seedEmployeeWithShift(tenantB.businessUnitId, 'canal06-b')
        // Muchas más checadas en B, mismo canal, MISMA ventana civil que A.
        await createAssistRow(
          tenantB.businessUnitId,
          employeeB,
          DateTime.fromISO('2021-08-02T14:00:00', { zone: 'utc' }),
          ASSIST_ORIGIN.SELF_SERVICE
        )
        await createAssistRow(
          tenantB.businessUnitId,
          employeeB,
          DateTime.fromISO('2021-08-02T15:30:00', { zone: 'utc' }),
          ASSIST_ORIGIN.SELF_SERVICE
        )
        await createAssistRow(
          tenantB.businessUnitId,
          employeeB,
          DateTime.fromISO('2021-08-02T16:30:00', { zone: 'utc' }),
          ASSIST_ORIGIN.SELF_SERVICE
        )

        const despues = await client
          .get(`${BASE_URL}/${tenantA.businessUnitPublicId}/trial/usage`)
          .loginAs(admin!.user)
        despues.assertStatus(200)
        const dataDespues = despues.body().data

        // Delta CERO en A: sembrar B no le suma ni una checada.
        assert.deepEqual(dataDespues.canales, dataAntes.canales)
        assert.equal(dataDespues.canales.autoservicio, 1)
        assert.equal(dataDespues.canales.total, 1)
      } finally {
        await cleanupBu(tenantB.businessUnitId)
        await fixtureB.cleanup()
      }
    } finally {
      await cleanupBu(tenantA.businessUnitId)
      await fixture.cleanup()
    }
  })
})

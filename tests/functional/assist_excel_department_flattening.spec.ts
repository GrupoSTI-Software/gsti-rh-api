import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'
import DepartmentPosition from '#models/department_position'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import AssistsService from '#services/assist_service'
import EmployeeService from '#services/employee_service'
import type { AssistExcelFilterInterface } from '../../app/interfaces/assist_excel_filter_interface.js'

/**
 * USRH1789328927579 — la Exportación detallada y el resumen de incidencias
 * muestran, dentro de su departamento, a quien no tiene puesto o tiene un
 * puesto que no está ligado, agrupados por el puesto visible y por nombre.
 *
 * El juego de datos se arma aquí. La fixture compartida de alcance siembra
 * empleados genéricos que entrarían al archivo, y sus constructores no están
 * exportados; alias, baja de puesto, nombres y la liga se fijan en local.
 */

const FILTER_DATE = '2026-09-01'
const FILTER_DATE_END = '2026-09-02'
const SHIFT_SINCE = '2024-06-01'

const VENTAS_ORDER = ['Diana Soto', 'Adela Rivas', 'Beto Ruiz', 'Carla Mena', 'Ernesto Gil']
const DETAILED_HEADER = [
  'Empleado ID',
  'Empleado Nombre',
  'Departamento',
  'Posición',
  'Fecha',
  '',
  'Turno asignado',
  'Fecha de inicio del turno',
  'Fecha de fin del turno',
  '',
  'Entrada',
  'Salida a comer',
  'Regreso de comer',
  'Salida',
  'Horas trabajadas',
  'Estatus',
  'Notas de excepción',
]

/**
 * Conteos que el subtotal ya suma hoy. `days_worked` (columna 6) no entra:
 * `addIncidentSummaryDepartmentTotal` no lo acumula, y sumarlo cambiaría el
 * subtotal también en los departamentos que no recuperan a nadie.
 */
const COUNT_COLUMN_START = 7
const COUNT_COLUMN_END = 20

interface ReportResult {
  status: number
  type?: string
  title?: string
  error?: string
  buffer?: ArrayBuffer
}

interface ProgressCall {
  current: number
  total: number
}

interface NamedRow {
  name: string
  department: string
  position: string
}

interface SummaryEntry {
  kind: 'employee' | 'subtotal' | 'grand'
  name: string
  department: string
  counts: Array<number | null>
}

interface World {
  stamp: string
  businessUnitIds: number[]
  departmentIds: number[]
  positionIds: number[]
  personIds: number[]
  employeeIds: number[]
  shiftIds: number[]
  roleId: number | null
  userId: number | null
  companyA: number
  ventasId: number
  almacenId: number
  ventasBId: number
  restrictedUserId: number
}

function locale() {
  return i18nManager.locale(i18nManager.defaultLocale)
}

function visibleName(first: string, last: string, second: string): string {
  return [first, last, second].filter((part) => part.trim() !== '').join(' ')
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text
  }
  return String(value)
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function countCells(row: ExcelJS.Row): Array<number | null> {
  const counts: Array<number | null> = []
  for (let column = COUNT_COLUMN_START; column <= COUNT_COLUMN_END; column++) {
    const value = row.getCell(column).value
    if (typeof value === 'number') {
      counts.push(value)
    } else if (value === null || value === undefined || value === '') {
      counts.push(0)
    } else {
      counts.push(null)
    }
  }
  return counts
}

async function loadFirstSheet(buffer: ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new Error('El archivo no trae hoja')
  }
  return sheet
}

function detailedRows(sheet: ExcelJS.Worksheet): NamedRow[] {
  const rows: NamedRow[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) {
      return
    }
    const name = normalize(cellText(row.getCell(2)))
    if (!name) {
      return
    }
    rows.push({
      name,
      department: normalize(cellText(row.getCell(3))),
      position: normalize(cellText(row.getCell(4))),
    })
  })
  return rows
}

function appearanceOrder(rows: NamedRow[]): string[] {
  const order: string[] = []
  let previous = ''
  for (const row of rows) {
    if (row.name === previous) {
      continue
    }
    if (order.includes(row.name)) {
      throw new Error(`${row.name} aparece otra vez después de otro empleado`)
    }
    order.push(row.name)
    previous = row.name
  }
  return order
}

function summaryEntries(sheet: ExcelJS.Worksheet, knownNames: Set<string>): SummaryEntry[] {
  const entries: SummaryEntry[] = []
  let started = false
  sheet.eachRow((row) => {
    const department = normalize(cellText(row.getCell(3)))
    const employeeId = normalize(cellText(row.getCell(4)))
    const name = normalize(cellText(row.getCell(5)))
    if (knownNames.has(name)) {
      started = true
      entries.push({ kind: 'employee', name, department, counts: countCells(row) })
      return
    }
    if (!started) {
      return
    }
    if (department.toUpperCase() === 'TOTALES') {
      entries.push({ kind: 'grand', name, department, counts: countCells(row) })
      return
    }
    if (!name && !employeeId) {
      entries.push({ kind: 'subtotal', name, department, counts: countCells(row) })
    }
  })
  return entries
}

function assertCountsMatchSum(
  assert: { deepEqual: (actual: unknown, expected: unknown, message?: string) => void },
  label: string,
  actual: Array<number | null>,
  parts: Array<Array<number | null>>
) {
  const expected = actual.map((_, index) => {
    if (actual[index] === null || parts.some((part) => part[index] === null)) {
      return null
    }
    return parts.reduce((sum, part) => sum + (part[index] as number), 0)
  })
  assert.deepEqual(actual, expected, label)
}

function recordProgress(): { calls: ProgressCall[]; onProgress: (current: number, total: number) => Promise<void> } {
  const calls: ProgressCall[] = []
  return {
    calls,
    onProgress: async (current, total) => {
      calls.push({ current, total })
    },
  }
}

function assertProgress(
  assert: {
    isAbove: (actual: number, expected: number) => void
    equal: (actual: unknown, expected: unknown) => void
    isAtMost: (actual: number, expected: number) => void
  },
  calls: ProgressCall[],
  total: number
) {
  assert.isAbove(calls.length, 0)
  const last = calls[calls.length - 1]
  assert.equal(last.current, total)
  assert.equal(last.total, total)
  for (const call of calls) {
    assert.isAtMost(call.current, call.total)
  }
}

async function insertDepartment(
  businessUnitId: number,
  name: string,
  code: string,
  stamp: string
): Promise<number> {
  const [id] = await db.table('departments').insert({
    department_sync_id: `${code}-${stamp}`.slice(0, 50),
    department_code: `${code}-${stamp}`.slice(0, 50),
    department_name: name,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: new Date(),
  })
  return Number(id)
}

async function insertPosition(
  businessUnitId: number,
  name: string,
  code: string,
  alias: string | null,
  stamp: string,
  deleted: boolean
): Promise<number> {
  const [id] = await db.table('positions').insert({
    position_sync_id: `${code}-${stamp}`.slice(0, 50),
    position_code: `${code}-${stamp}`.slice(0, 50),
    position_name: name,
    position_alias: alias,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: deleted ? 0 : 1,
    position_created_at: new Date(),
    position_deleted_at: deleted ? new Date() : null,
  })
  return Number(id)
}

async function insertEmployee(input: {
  businessUnitId: number
  departmentId: number | null
  positionId: number | null
  first: string
  last: string
  second: string
  stamp: string
  personIds: number[]
  employeeIds: number[]
}): Promise<number> {
  const person = await Person.create({
    personFirstname: input.first,
    personLastname: input.last,
    personSecondLastname: input.second,
    personEmail: `${input.first}-${input.last}-${input.stamp}@reportes-asistencia.local`.toLowerCase(),
  })
  input.personIds.push(person.personId)
  const [employeeId] = await db.table('employees').insert({
    employee_sync_id: `EMP-${input.stamp}-${input.first}`,
    employee_code: `EMP-${input.stamp}-${input.first}`,
    employee_payroll_code: `NOM-${input.first}-${input.stamp}`.slice(0, 50),
    employee_first_name: input.first,
    employee_last_name: input.last,
    employee_second_last_name: input.second,
    company_id: input.businessUnitId,
    business_unit_id: input.businessUnitId,
    department_id: input.departmentId,
    position_id: input.positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_type_of_contract: 'Internal',
    payroll_business_unit_id: input.businessUnitId,
    employee_business_email: `trabajo-${input.first}-${input.stamp}@reportes-asistencia.local`.toLowerCase(),
    employee_created_at: new Date(),
  })
  const id = Number(employeeId)
  input.employeeIds.push(id)
  return id
}

let pendingWorld: World | null = null

async function createWorld(): Promise<World> {
  const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
  const world: World = {
    stamp,
    businessUnitIds: [],
    departmentIds: [],
    positionIds: [],
    personIds: [],
    employeeIds: [],
    shiftIds: [],
    roleId: null,
    userId: null,
    companyA: 0,
    ventasId: 0,
    almacenId: 0,
    ventasBId: 0,
    restrictedUserId: 0,
  }
  pendingWorld = world

  const companyA = await BusinessUnit.create({
    businessUnitName: `Reportes A ${stamp}`,
    businessUnitSlug: `rep-a-${stamp}`,
    businessUnitLegalName: `Reportes A legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const companyB = await BusinessUnit.create({
    businessUnitName: `Reportes B ${stamp}`,
    businessUnitSlug: `rep-b-${stamp}`,
    businessUnitLegalName: `Reportes B legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  world.businessUnitIds.push(companyA.businessUnitId, companyB.businessUnitId)
  world.companyA = companyA.businessUnitId

  world.ventasId = await insertDepartment(companyA.businessUnitId, 'Ventas', 'VEN', stamp)
  world.almacenId = await insertDepartment(companyA.businessUnitId, 'Almacén', 'ALM', stamp)
  world.ventasBId = await insertDepartment(companyB.businessUnitId, 'Ventas B', 'VB', stamp)
  world.departmentIds.push(world.ventasId, world.almacenId, world.ventasBId)

  const auxiliarId = await insertPosition(companyA.businessUnitId, 'Auxiliar', 'AUX', 'Vendedor', stamp, false)
  const choferId = await insertPosition(companyA.businessUnitId, 'Chofer', 'CHO', null, stamp, false)
  const supervisorId = await insertPosition(companyA.businessUnitId, 'Supervisor', 'SUP', null, stamp, true)
  const puestoBId = await insertPosition(companyB.businessUnitId, 'Chofer B', 'CHB', null, stamp, false)
  world.positionIds.push(auxiliarId, choferId, supervisorId, puestoBId)

  await DepartmentPosition.create({
    departmentId: world.ventasId,
    positionId: auxiliarId,
    businessUnitId: companyA.businessUnitId,
  })

  const people = [
    { first: 'Diana', last: 'Soto', departmentId: world.ventasId, positionId: choferId, businessUnitId: companyA.businessUnitId },
    { first: 'Adela', last: 'Rivas', departmentId: world.ventasId, positionId: auxiliarId, businessUnitId: companyA.businessUnitId },
    { first: 'Beto', last: 'Ruiz', departmentId: world.ventasId, positionId: auxiliarId, businessUnitId: companyA.businessUnitId },
    { first: 'Carla', last: 'Mena', departmentId: world.ventasId, positionId: null, businessUnitId: companyA.businessUnitId },
    { first: 'Ernesto', last: 'Gil', departmentId: world.ventasId, positionId: supervisorId, businessUnitId: companyA.businessUnitId },
    { first: 'Luis', last: 'Mora', departmentId: world.almacenId, positionId: null, businessUnitId: companyA.businessUnitId },
    { first: 'Olga', last: 'Nula', departmentId: null, positionId: null, businessUnitId: companyA.businessUnitId },
    { first: 'Zoe', last: 'Luna', departmentId: world.ventasBId, positionId: puestoBId, businessUnitId: companyB.businessUnitId },
  ]

  const withShift: number[] = []
  let dianaId = 0
  for (const person of people) {
    const employeeId = await insertEmployee({
      businessUnitId: person.businessUnitId,
      departmentId: person.departmentId,
      positionId: person.positionId,
      first: person.first,
      last: person.last,
      second: '',
      stamp,
      personIds: world.personIds,
      employeeIds: world.employeeIds,
    })
    if (person.first === 'Diana') {
      dianaId = employeeId
    }
    if (person.first !== 'Olga' && person.first !== 'Zoe') {
      withShift.push(employeeId)
    }
  }

  const shift = await Shift.create({
    shiftName: `Turno ${stamp}`,
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 0,
    businessUnitId: companyA.businessUnitId,
    shiftTemp: 0,
  })
  world.shiftIds.push(shift.shiftId)
  for (const employeeId of withShift) {
    await EmployeeShift.create({
      employeeId,
      shiftId: shift.shiftId,
      businessUnitId: companyA.businessUnitId,
      employeShiftsApplySince: SHIFT_SINCE,
    })
  }

  const role = await Role.create({
    roleName: `Reporte restringido ${stamp}`,
    roleSlug: `reporte-restringido-${stamp}`,
    roleDescription: 'Rol temporal del reporte de asistencia',
    roleActive: 1,
    businessUnitId: companyA.businessUnitId,
    roleManagementDays: 10,
  })
  world.roleId = role.roleId
  const actorPerson = await Person.create({
    personFirstname: 'Actor',
    personLastname: 'Restringido',
    personSecondLastname: stamp,
    personEmail: `actor-${stamp}@reportes-asistencia.local`,
  })
  world.personIds.push(actorPerson.personId)
  const user = await User.create({
    userEmail: `actor-${stamp}@reportes-asistencia.local`,
    userPassword: 'ReportesAsistencia123!',
    userActive: 1,
    roleId: role.roleId,
    personId: actorPerson.personId,
    userEmailType: 'institutional',
  })
  world.userId = user.userId
  world.restrictedUserId = user.userId
  await UserResponsibleEmployee.create({
    userId: user.userId,
    employeeId: dianaId,
  })

  return world
}

async function cleanupWorld(world: World): Promise<void> {
  if (world.userId) {
    await db.from('user_responsible_employees').where('user_id', world.userId).delete()
    await db.from('business_unit_users').where('user_id', world.userId).delete()
    await db.from('users').where('user_id', world.userId).delete()
  }
  if (world.roleId) {
    await db.from('roles').where('role_id', world.roleId).delete()
  }
  if (world.employeeIds.length > 0) {
    await db.from('employee_shifts').whereIn('employee_id', world.employeeIds).delete()
    await db.from('employees').whereIn('employee_id', world.employeeIds).delete()
  }
  if (world.shiftIds.length > 0) {
    await db.from('shifts').whereIn('shift_id', world.shiftIds).delete()
  }
  if (world.departmentIds.length > 0) {
    await db.from('department_position').whereIn('department_id', world.departmentIds).delete()
    await db.from('departments').whereIn('department_id', world.departmentIds).delete()
  }
  if (world.positionIds.length > 0) {
    await db.from('positions').whereIn('position_id', world.positionIds).delete()
  }
  if (world.personIds.length > 0) {
    await db.from('people').whereIn('person_id', world.personIds).delete()
  }
  if (world.businessUnitIds.length > 0) {
    await db.from('business_units').whereIn('business_unit_id', world.businessUnitIds).delete()
  }
}

function companyFilters(world: World, userResponsibleId?: number): AssistExcelFilterInterface {
  return {
    filterDate: FILTER_DATE,
    filterDateEnd: FILTER_DATE_END,
    businessUnitId: world.companyA,
    userResponsibleId,
  }
}

interface GeneratedReport {
  buffer: ArrayBuffer
  calls: ProgressCall[]
}

test.group('Asistencia Excel — empleados del departamento aunque el puesto no esté ligado', (group) => {
  let world: World | null = null
  let detailedReport: Promise<GeneratedReport> | null = null
  let summaryReport: Promise<GeneratedReport> | null = null

  group.setup(async () => {
    try {
      world = await createWorld()
    } catch (error) {
      if (pendingWorld) {
        await cleanupWorld(pendingWorld)
      }
      throw error
    }
  })

  group.teardown(async () => {
    if (world) {
      await cleanupWorld(world)
    }
  })

  function detailed(): Promise<GeneratedReport> {
    if (!detailedReport) {
      const current = world!
      const progress = recordProgress()
      const service = new AssistsService(locale())
      detailedReport = service
        .generateAssistanceAllBuffer(
          companyFilters(current),
          [current.ventasId, current.almacenId],
          [current.companyA],
          progress.onProgress
        )
        .then((value) => {
          const result = value as ReportResult
          if (!result.buffer) {
            throw new Error(`La exportación detallada no devolvió archivo (status ${result.status})`)
          }
          return { buffer: result.buffer, calls: progress.calls }
        })
    }
    return detailedReport
  }

  function summary(): Promise<GeneratedReport> {
    if (!summaryReport) {
      const current = world!
      const progress = recordProgress()
      const service = new AssistsService(locale())
      summaryReport = service
        .generateIncidentSummaryBuffer(
          companyFilters(current),
          [current.ventasId, current.almacenId],
          [current.companyA],
          false,
          false,
          progress.onProgress
        )
        .then((value) => {
          const result = value as ReportResult
          if (result.status !== 201 || !result.buffer) {
            throw new Error(`El resumen no devolvió archivo (status ${result.status})`)
          }
          return { buffer: result.buffer, calls: progress.calls }
        })
    }
    return summaryReport
  }

  test('CA1 — la exportación detallada recupera a cada empleado en su departamento', async ({ assert }) => {
    const report = await detailed()
    const rows = detailedRows(await loadFirstSheet(report.buffer))
    const order = appearanceOrder(rows)
    assert.deepEqual(order, [...VENTAS_ORDER, 'Luis Mora'])
    assert.notInclude(order, 'Olga Nula')
    for (const row of rows) {
      const expected = row.name === 'Luis Mora' ? 'Almacén' : 'Ventas'
      assert.equal(row.department, expected)
    }
  }).timeout(90_000)

  test('CA2 — el resumen recupera a los cinco de Ventas y el subtotal los suma', async ({ assert }) => {
    const report = await summary()
    const sheet = await loadFirstSheet(report.buffer)
    const known = new Set([...VENTAS_ORDER, 'Luis Mora', 'Olga Nula', 'Zoe Luna'])
    const entries = summaryEntries(sheet, known)
    const ventas = entries.filter((entry) => entry.kind === 'employee' && entry.department === 'Ventas')
    const almacen = entries.filter((entry) => entry.kind === 'employee' && entry.department === 'Almacén')
    assert.deepEqual(
      ventas.map((entry) => entry.name),
      VENTAS_ORDER
    )
    assert.deepEqual(
      almacen.map((entry) => entry.name),
      ['Luis Mora']
    )

    const subtotals = entries.filter((entry) => entry.kind === 'subtotal')
    const grand = entries.filter((entry) => entry.kind === 'grand')
    assert.lengthOf(subtotals, 2)
    assert.lengthOf(grand, 1)
    assertCountsMatchSum(
      assert,
      'subtotal de Ventas',
      subtotals[0].counts,
      ventas.map((entry) => entry.counts)
    )
    assertCountsMatchSum(
      assert,
      'subtotal de Almacén',
      subtotals[1].counts,
      almacen.map((entry) => entry.counts)
    )
    assertCountsMatchSum(
      assert,
      'TOTALES',
      grand[0].counts,
      subtotals.map((entry) => entry.counts)
    )
  }).timeout(90_000)

  test('CA3 — index ordena por puesto visible y deja al final a quien no tiene puesto vigente', async ({ assert }) => {
    const current = world!
    const service = new EmployeeService(locale())
    const result = await service.index(
      {
        search: '',
        page: 1,
        limit: 999999999999999,
        employeeWorkSchedule: '',
        departmentId: current.ventasId,
        positionId: 0,
        ignoreExternal: 1,
        businessUnitId: current.companyA,
        orderBy: 'positionThenName',
        orderDirection: 'ascend',
      },
      [current.ventasId],
      [current.companyA]
    )
    const names = result.all().map((employee) =>
      visibleName(employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName ?? '')
    )
    assert.deepEqual(names, VENTAS_ORDER)
  }).timeout(60_000)

  test('CA4 — el archivo muestra el puesto visible y conserva el encabezado', async ({ assert }) => {
    const report = await detailed()
    const sheet = await loadFirstSheet(report.buffer)
    const header = DETAILED_HEADER.map((_, index) => cellText(sheet.getRow(4).getCell(index + 1)))
    assert.deepEqual(header, DETAILED_HEADER)

    const positionByName = new Map<string, string>()
    for (const row of detailedRows(sheet)) {
      if (!positionByName.has(row.name)) {
        positionByName.set(row.name, row.position)
      }
    }
    assert.equal(positionByName.get('Diana Soto'), 'Chofer')
    assert.equal(positionByName.get('Adela Rivas'), 'Vendedor')
    assert.equal(positionByName.get('Beto Ruiz'), 'Vendedor')
    assert.equal(positionByName.get('Carla Mena'), '')
  }).timeout(90_000)

  test('CA5 — el avance de ambos archivos cuenta a los seis empleados y llega al final', async ({ assert }) => {
    const detailedRun = await detailed()
    const summaryRun = await summary()
    assertProgress(assert, detailedRun.calls, 6)
    assertProgress(assert, summaryRun.calls, 6)
  }).timeout(90_000)

  test('CA6 — el restringido solo ve a quien tiene a su cargo', async ({ assert }) => {
    const current = world!
    const progress = recordProgress()
    const service = new AssistsService(locale())
    const result = (await service.generateAssistanceAllBuffer(
      companyFilters(current, current.restrictedUserId),
      [current.ventasId, current.almacenId],
      [current.companyA],
      progress.onProgress
    )) as ReportResult

    assert.equal(result.status, 201)
    const sheet = await loadFirstSheet(result.buffer!)
    const order = appearanceOrder(detailedRows(sheet))
    assert.deepEqual(order, ['Diana Soto'])
    assertProgress(assert, progress.calls, 1)
  }).timeout(90_000)

  test('CA7 — un departamento de otra empresa no entra y sin empresa el reporte se cierra', async ({ assert }) => {
    const current = world!
    const progress = recordProgress()
    const service = new AssistsService(locale())
    const result = (await service.generateAssistanceAllBuffer(
      companyFilters(current),
      [current.ventasId, current.almacenId, current.ventasBId],
      [current.companyA],
      progress.onProgress
    )) as ReportResult

    assert.equal(result.status, 201)
    const sheet = await loadFirstSheet(result.buffer!)
    const order = appearanceOrder(detailedRows(sheet))
    assert.notInclude(order, 'Zoe Luna')
    assert.deepEqual(order, [...VENTAS_ORDER, 'Luis Mora'])
    assertProgress(assert, progress.calls, 6)

    const closed = recordProgress()
    const rejected = (await service.generateAssistanceAllBuffer(
      { filterDate: FILTER_DATE, filterDateEnd: FILTER_DATE_END },
      [current.ventasId, current.almacenId],
      [],
      closed.onProgress
    )) as ReportResult
    assert.equal(rejected.status, 400)
    assert.equal(rejected.type, 'warning')
    assert.equal(rejected.title, 'Parámetros inválidos')
    assert.equal(rejected.error, 'MISSING_BUSINESS_UNIT_SCOPE')
    assert.isUndefined(rejected.buffer)
    assert.lengthOf(closed.calls, 0)
  }).timeout(90_000)
})

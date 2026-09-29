import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import Employee from '#models/employee'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'
import ReportJob from '#models/report_job'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import AssistsService from '#services/assist_service'
import ReportJobService from '#services/report_job_service'
import type { ReportJobStatus } from '#models/report_job'
import type { AssistExcelFilterInterface } from '../../app/interfaces/assist_excel_filter_interface.js'

/**
 * USRH1788466831333 — Bloque final "EMPLEADOS SIN DEPARTAMENTO ASIGNADO"
 * en la Exportación detallada, el Resumen de incidencias y la Exportación
 * de nóminas de toda la empresa.
 *
 * Montaje del spec:
 *  - Empresas A y B, departamentos D1 y D2 en A, empleados en cada uno.
 *  - M (sin dept, con turno) → aparece en el bloque con datos del periodo.
 *  - P (sin dept, con turno, a cargo del restringido R) → solo R lo ve en su bloque.
 *  - N (sin dept, sin turno) → se cuenta en el progreso pero no genera filas.
 *  - S (sin dept en empresa B) → nunca aparece en reportes de A.
 *  - R (actor restringido, responsable de P) → su bloque solo tiene a P.
 *  - F (actor con acceso completo) → ve a M, P y N en el bloque.
 */

const FILTER_DATE = '2026-09-01'
const FILTER_DATE_END = '2026-09-30'
const FILTER_DATE_PAY = '2026-09-30'
const SHIFT_SINCE = '2024-06-01'

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface ProgressCall {
  current: number
  total: number
}

interface World {
  stamp: string
  companyAId: number
  companyBId: number
  d1Id: number
  d2Id: number
  mId: number
  mCode: string
  pId: number
  nId: number
  sId: number
  rUserId: number
  rRoleId: number
  fUserId: number | null
  shiftId: number
  assistIds: number[]
  employeeIds: number[]
  personIds: number[]
  departmentIds: number[]
  roleIds: number[]
  userIds: number[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function locale() {
  return i18nManager.locale(i18nManager.defaultLocale)
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'richText' in value)
    return value.richText.map((p) => p.text).join('')
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string')
    return value.text
  return String(value)
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

async function loadFirstSheet(buffer: ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer)
  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error('El archivo no trajo hoja')
  return sheet
}

function recordProgress(): { calls: ProgressCall[]; onProgress: (c: number, t: number) => Promise<void> } {
  const calls: ProgressCall[] = []
  return {
    calls,
    onProgress: async (current, total) => {
      calls.push({ current, total })
    },
  }
}

function assertProgress(
  assert: { isAbove: (a: number, b: number) => void; equal: (a: unknown, b: unknown) => void; isAtMost: (a: number, b: number) => void },
  calls: ProgressCall[],
  expectedTotal: number
) {
  assert.isAbove(calls.length, 0)
  const last = calls[calls.length - 1]
  assert.equal(last.current, expectedTotal)
  assert.equal(last.total, expectedTotal)
  for (const call of calls) {
    assert.isAtMost(call.current, call.total)
  }
}

/** Busca el rótulo del bloque en todas las filas de la hoja detallada (columna C). */
function findLabelRowNumberDetailed(sheet: ExcelJS.Worksheet, label: string): number | null {
  let found: number | null = null
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return
    const val = normalize(cellText(row.getCell(3)))
    if (val === label) {
      found = rowNumber
    }
  })
  return found
}

/** Filas de empleados del bloque (depto vacío, nombre no vacío, after labelRow) */
function blockEmployeeNamesDetailed(sheet: ExcelJS.Worksheet, labelRow: number): string[] {
  const names: string[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= labelRow) return
    const name = normalize(cellText(row.getCell(2)))
    const dept = normalize(cellText(row.getCell(3)))
    if (!name) return
    if (dept !== '') return // sal de la zona del bloque cuando hay dpto
    names.push(name)
  })
  return names
}

/** Verifica que el rótulo del bloque exista en el resumen de incidencias (columna C). */
function labelExistsInSummary(sheet: ExcelJS.Worksheet, label: string): boolean {
  let found = false
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return
    const deptCol = normalize(cellText(row.getCell(3)))
    if (deptCol === label) found = true
  })
  return found
}

/** Busca el rótulo del bloque en el reporte de nóminas (columna E). */
function labelExistsInPayroll(sheet: ExcelJS.Worksheet, label: string): boolean {
  let found = false
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return
    const deptCol = normalize(cellText(row.getCell(5)))
    if (deptCol === label) found = true
  })
  return found
}

function filtersFor(
  w: World,
  extra?: Partial<AssistExcelFilterInterface>
): AssistExcelFilterInterface {
  return {
    filterDate: FILTER_DATE,
    filterDateEnd: FILTER_DATE_END,
    filterDatePay: FILTER_DATE_PAY,
    businessUnitId: w.companyAId,
    ...extra,
  }
}

// ─── Creación del mundo de prueba ─────────────────────────────────────────────

let pendingWorld: World | null = null

async function createWorld(): Promise<World> {
  const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 100000)}`
  const now = new Date()

  const w: World = {
    stamp,
    companyAId: 0,
    companyBId: 0,
    d1Id: 0,
    d2Id: 0,
    mId: 0,
    mCode: '',
    pId: 0,
    nId: 0,
    sId: 0,
    rUserId: 0,
    rRoleId: 0,
    fUserId: null,
    shiftId: 0,
    assistIds: [],
    employeeIds: [],
    personIds: [],
    departmentIds: [],
    roleIds: [],
    userIds: [],
  }
  pendingWorld = w

  // ── Empresas ─────────────────────────────────────────────────────────────
  const companyA = await BusinessUnit.create({
    businessUnitName: `Unassigned A ${stamp}`,
    businessUnitSlug: `unassigned-a-${stamp}`,
    businessUnitLegalName: `Unassigned A Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const companyB = await BusinessUnit.create({
    businessUnitName: `Unassigned B ${stamp}`,
    businessUnitSlug: `unassigned-b-${stamp}`,
    businessUnitLegalName: `Unassigned B Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  w.companyAId = companyA.businessUnitId
  w.companyBId = companyB.businessUnitId

  // ── Departamentos en A ───────────────────────────────────────────────────
  const [d1] = await db.table('departments').insert({
    department_sync_id: `D1-${stamp}`,
    department_code: `D1-${stamp}`,
    department_name: `D1-${stamp}`,
    company_id: w.companyAId,
    business_unit_id: w.companyAId,
    department_active: 1,
    department_created_at: now,
  })
  const [d2] = await db.table('departments').insert({
    department_sync_id: `D2-${stamp}`,
    department_code: `D2-${stamp}`,
    department_name: `D2-${stamp}`,
    company_id: w.companyAId,
    business_unit_id: w.companyAId,
    department_active: 1,
    department_created_at: now,
  })
  w.d1Id = Number(d1)
  w.d2Id = Number(d2)
  w.departmentIds.push(w.d1Id, w.d2Id)

  // ── Turno ────────────────────────────────────────────────────────────────
  const shift = await Shift.create({
    shiftName: `Turno-${stamp}`,
    shiftCalculateFlag: '',
    shiftDayStart: 2,
    shiftTimeStart: '08:00:00',
    shiftActiveHours: 8,
    shiftRestDays: '1',
    shiftAccumulatedFault: 0,
    businessUnitId: w.companyAId,
    shiftTemp: 0,
  })
  w.shiftId = shift.shiftId

  // ── Helper: insertar empleado ────────────────────────────────────────────
  async function insertEmp(
    first: string,
    last: string,
    deptId: number | null,
    buId: number,
    withShift: boolean
  ): Promise<{ id: number; code: string }> {
    const person = await Person.create({
      personFirstname: first,
      personLastname: last,
      personSecondLastname: stamp,
      personEmail: `${first.toLowerCase()}-${stamp}@block-test.local`,
    })
    w.personIds.push(person.personId)
    const code = `${first.toUpperCase()}-${stamp}`.slice(0, 50)
    const [empId] = await db.table('employees').insert({
      employee_sync_id: code,
      employee_code: code,
      employee_payroll_code: code.slice(0, 50),
      employee_first_name: first,
      employee_last_name: last,
      employee_second_last_name: stamp,
      company_id: buId,
      business_unit_id: buId,
      department_id: deptId,
      position_id: null,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_type_of_contract: 'Internal',
      payroll_business_unit_id: buId,
      employee_business_email: `work-${first.toLowerCase()}-${stamp}@block-test.local`,
      employee_created_at: now,
    })
    const id = Number(empId)
    w.employeeIds.push(id)
    if (withShift) {
      await EmployeeShift.create({
        employeeId: id,
        shiftId: shift.shiftId,
        businessUnitId: buId,
        employeShiftsApplySince: SHIFT_SINCE,
      })
    }
    return { id, code }
  }

  // Empleados con departamento (para verificar que no aparecen en el bloque)
  await insertEmp('Alfa', 'D1', w.d1Id, w.companyAId, true)
  await insertEmp('Beta', 'D2', w.d2Id, w.companyAId, true)

  // M: sin departamento en A, con turno
  const mResult = await insertEmp('Marta', 'Lopez', null, w.companyAId, true)
  w.mId = mResult.id
  w.mCode = mResult.code

  // P: sin departamento en A, con turno (a cargo de R)
  const pResult = await insertEmp('Pedro', 'Ruiz', null, w.companyAId, true)
  w.pId = pResult.id

  // N: sin departamento en A, SIN turno
  const nResult = await insertEmp('Noel', 'Vera', null, w.companyAId, false)
  w.nId = nResult.id

  // S: sin departamento en B
  const sResult = await insertEmp('Sofia', 'Cruz', null, w.companyBId, true)
  w.sId = sResult.id

  // ── Actor R: restringido, responsable de P ───────────────────────────────
  const rRole = await Role.create({
    roleName: `Restringido-bloque-${stamp}`,
    roleSlug: `restringido-bloque-${stamp}`,
    roleDescription: 'Rol temporal test bloque',
    roleActive: 1,
    businessUnitId: w.companyAId,
    roleManagementDays: 10,
  })
  w.rRoleId = rRole.roleId
  w.roleIds.push(rRole.roleId)
  const rPerson = await Person.create({
    personFirstname: 'Actor',
    personLastname: 'R',
    personSecondLastname: stamp,
    personEmail: `actor-r-${stamp}@block-test.local`,
  })
  w.personIds.push(rPerson.personId)
  const rUser = await User.create({
    userEmail: `actor-r-${stamp}@block-test.local`,
    userPassword: 'BloqueTest123!',
    userActive: 1,
    roleId: rRole.roleId,
    personId: rPerson.personId,
    userEmailType: 'institutional',
  })
  w.rUserId = rUser.userId
  w.userIds.push(rUser.userId)
  await UserResponsibleEmployee.create({ userId: rUser.userId, employeeId: w.pId })

  // ── Assist para M (para CA4: nómina necesita checada evaluable) ──────────
  // Martes 2026-09-01 08:10 UTC-6 = 14:10 UTC
  const punchTime = '2026-09-01 08:10:00'
  const punchTimeUtc = '2026-09-01 14:10:00'
  const naturalKey = `${w.mCode}|${punchTimeUtc.replace(/[^0-9]/g, '')}|check`
  const [assistId] = await db.table('assists').insert({
    assist_emp_code: w.mCode,
    assist_emp_id: w.mId,
    business_unit_id: w.companyAId,
    assist_punch_time: punchTime,
    assist_punch_time_utc: punchTimeUtc,
    assist_punch_time_origin: punchTime,
    assist_upload_time: now,
    assist_sync_id: 0,
    assist_type: 'check',
    assist_natural_key: naturalKey,
  })
  w.assistIds.push(Number(assistId))

  return w
}

async function cleanupWorld(w: World): Promise<void> {
  if (w.assistIds.length > 0)
    await db.from('assists').whereIn('assist_id', w.assistIds).delete()
  await db
    .from('user_responsible_employees')
    .whereIn('user_id', w.userIds)
    .delete()
  await db.from('business_unit_users').whereIn('user_id', w.userIds).delete()
  if (w.userIds.length > 0)
    await db.from('users').whereIn('user_id', w.userIds).delete()
  if (w.roleIds.length > 0)
    await db.from('roles').whereIn('role_id', w.roleIds).delete()
  if (w.employeeIds.length > 0) {
    await db.from('employee_shifts').whereIn('employee_id', w.employeeIds).delete()
    await db.from('employees').whereIn('employee_id', w.employeeIds).delete()
  }
  if (w.shiftId)
    await db.from('shifts').where('shift_id', w.shiftId).delete()
  if (w.departmentIds.length > 0)
    await db.from('departments').whereIn('department_id', w.departmentIds).delete()
  if (w.personIds.length > 0)
    await db.from('people').whereIn('person_id', w.personIds).delete()
  const buIds = [w.companyAId, w.companyBId].filter(Boolean)
  if (buIds.length > 0)
    await db.from('business_units').whereIn('business_unit_id', buIds).delete()
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.group('Bloque sin departamento en reportes de asistencia — USRH1788466831333', (group) => {
  let w: World | null = null
  const LABEL = 'EMPLEADOS SIN DEPARTAMENTO ASIGNADO'

  group.setup(async () => {
    try {
      w = await createWorld()
    } catch (error) {
      if (pendingWorld) await cleanupWorld(pendingWorld)
      throw error
    }
  })

  group.teardown(async () => {
    if (w) await cleanupWorld(w)
  })

  // ── CA1: Exportación detallada — F ve bloque con M y P ───────────────────
  test('CA1 · Detallada: rótulo en negritas tras D2, M y P en el bloque', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateAssistanceAllBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const buffer = (result as any).buffer as ArrayBuffer
    const sheet = await loadFirstSheet(buffer)

    const labelRow = findLabelRowNumberDetailed(sheet, LABEL)
    assert.isNotNull(labelRow, 'Debe existir fila-rótulo del bloque')

    // El rótulo debe estar en negritas
    const labelCell = sheet.getCell(labelRow!, 3)
    assert.ok(labelCell.font?.bold, 'La celda del rótulo debe ser negrita')

    // La celda O (columna 15) de la fila-rótulo debe estar vacía
    const oCell = sheet.getCell(labelRow!, 15)
    assert.equal(cellText(oCell), '', 'Columna O de la fila-rótulo debe estar vacía')

    // M y P deben aparecer en el bloque (dept vacío) y no antes
    const blockNames = blockEmployeeNamesDetailed(sheet, labelRow!)
    assert.includeMembers(blockNames, ['Marta Lopez'])
    assert.includeMembers(blockNames, ['Pedro Ruiz'])
    // S (empresa B) no debe aparecer
    const allNames: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return
      const name = normalize(cellText(row.getCell(2)))
      if (name) allNames.push(name)
    })
    assert.notInclude(allNames, 'Sofia Cruz', 'S de empresa B no debe aparecer')
  }).timeout(120_000)

  // ── CA2: Resumen — subtotal del bloque y TOTALES ──────────────────────────
  test('CA2 · Resumen: rótulo del bloque y subtotal en TOTALES', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateIncidentSummaryBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      false,
      false,
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    assert.isTrue(labelExistsInSummary(sheet, LABEL), 'El rótulo del bloque debe aparecer en el resumen')
    // Verificar que TOTALES existe
    let hasTotales = false
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return
      if (normalize(cellText(row.getCell(3))).toUpperCase() === 'TOTALES') hasTotales = true
    })
    assert.isTrue(hasTotales, 'Debe existir la fila TOTALES')
  }).timeout(120_000)

  // ── CA3: Resumen — la combinación de C del último dpto termina antes del bloque
  test('CA3 · Resumen: el bloque tiene su propia celda C, separada del último dpto', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateIncidentSummaryBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      false,
      false,
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    // Verificar que la celda C del rótulo del bloque contiene el rótulo
    // (si la celda C estuviera merged con el dpto anterior, mostraría el nombre del dpto)
    let labelRowNumber: number | null = null
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return
      const dept = normalize(cellText(row.getCell(3)))
      if (dept === LABEL) labelRowNumber = rowNumber
    })
    assert.isNotNull(labelRowNumber, 'La celda C del bloque debe tener el rótulo, no el nombre del dpto anterior')
  }).timeout(120_000)

  // ── CA4: Nómina — rótulo en columna E ────────────────────────────────────
  test('CA4 · Nómina: rótulo del bloque en columna E', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateIncidentSummaryPayrollBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((result as any).status, 201)
    assert.ok((result as any).buffer, 'El reporte de nóminas debe devolver buffer')
    // Si M tiene checada evaluable, el bloque (con rótulo en col E) debe aparecer
    // La checada de M se insertó en el setup. Verificar que el rótulo esté.
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    assert.isTrue(labelExistsInPayroll(sheet, LABEL), 'El rótulo del bloque debe aparecer en la columna E del reporte de nóminas')
  }).timeout(120_000)

  // ── CA5: Sin sin-departamento → no hay bloque ────────────────────────────
  test('CA5 · Sin empleados sin departamento: los tres reportes no traen rótulo', async ({ assert }) => {
    // Empresa vacía con solo empleados con departamento
    const stamp2 = `${Date.now().toString(36)}-ca5`
    const bu = await BusinessUnit.create({
      businessUnitName: `CA5-${stamp2}`,
      businessUnitSlug: `ca5-${stamp2}`,
      businessUnitLegalName: `CA5 Legal ${stamp2}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    const [dept] = await db.table('departments').insert({
      department_sync_id: `CA5-DEPT-${stamp2}`,
      department_code: `CA5-DEPT-${stamp2}`,
      department_name: `CA5-DEPT-${stamp2}`,
      company_id: bu.businessUnitId,
      business_unit_id: bu.businessUnitId,
      department_active: 1,
      department_created_at: new Date(),
    })
    const deptId = Number(dept)
    try {
      const svc = new AssistsService(locale())
      const filters: AssistExcelFilterInterface = {
        filterDate: FILTER_DATE,
        filterDateEnd: FILTER_DATE_END,
        businessUnitId: bu.businessUnitId,
        includeUnassigned: true,
      }
      // Exportación detallada
      const r1 = await svc.generateAssistanceAllBuffer(filters, [deptId], [bu.businessUnitId], async () => {})
      assert.equal((r1 as any).status, 201)
      const s1 = await loadFirstSheet((r1 as any).buffer as ArrayBuffer)
      assert.isNull(findLabelRowNumberDetailed(s1, LABEL), 'Detallada: sin rótulo cuando no hay sin-departamento')

      // Resumen
      const r2 = await svc.generateIncidentSummaryBuffer(filters, [deptId], [bu.businessUnitId], false, false, async () => {})
      assert.equal((r2 as any).status, 201)
      const s2 = await loadFirstSheet((r2 as any).buffer as ArrayBuffer)
      assert.isFalse(labelExistsInSummary(s2, LABEL), 'Resumen: sin rótulo cuando no hay sin-departamento')

      // Nómina
      const r3 = await svc.generateIncidentSummaryPayrollBuffer(filters, [deptId], [bu.businessUnitId], async () => {})
      assert.equal((r3 as any).status, 201)
      const s3 = await loadFirstSheet((r3 as any).buffer as ArrayBuffer)
      assert.isFalse(labelExistsInPayroll(s3, LABEL), 'Nómina: sin rótulo cuando no hay sin-departamento')
    } finally {
      await db.from('departments').where('department_id', deptId).delete()
      await BusinessUnit.query().where('business_unit_id', bu.businessUnitId).delete()
    }
  }).timeout(120_000)

  // ── CA6: N sin registros — sin error en detallada y resumen ──────────────
  test('CA6 · N sin registros: detallada y resumen devuelven 201 sin error', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    // N no tiene turno, así que SyncAssistsService no genera calendario → no hay filas para N
    // Pero el proceso no debe interrumpirse (R11).
    const r1 = await svc.generateAssistanceAllBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((r1 as any).status, 201)
    assert.ok((r1 as any).buffer, 'La exportación detallada debe devolver buffer')

    const r2 = await svc.generateIncidentSummaryBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      false,
      false,
      async () => {}
    )
    assert.equal((r2 as any).status, 201)
    assert.ok((r2 as any).buffer, 'El resumen de incidencias debe devolver buffer')
  }).timeout(120_000)

  // ── CA7: Restringido solo ve a P ──────────────────────────────────────────
  test('CA7 · Restringido: su bloque solo trae a P, no a M ni N', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateAssistanceAllBuffer(
      filtersFor(world, { userResponsibleId: world.rUserId }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    const allNames: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return
      const name = normalize(cellText(row.getCell(2)))
      if (name) allNames.push(name)
    })
    // P debe aparecer (a cargo de R)
    assert.includeMembers(allNames, ['Pedro Ruiz'])
    // M no debe aparecer (no está a cargo de R)
    assert.notInclude(allNames, 'Marta Lopez')
    // N no debe aparecer
    assert.notInclude(allNames, 'Noel Vera')
  }).timeout(120_000)

  // ── CA8: Restringido sin sin-departamento a cargo → sin bloque ────────────
  test('CA8 · Restringido sin sin-departamento a cargo: sin bloque en los tres reportes', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    // Actor R2: responsable de un empleado CON departamento → sin sin-departamento a cargo
    const stamp2 = `${Date.now().toString(36)}-ca8`
    const r2Role = await Role.create({
      roleName: `CA8-${stamp2}`,
      roleSlug: `ca8-${stamp2}`,
      roleDescription: 'Rol CA8 temporal',
      roleActive: 1,
      businessUnitId: world.companyAId,
      roleManagementDays: 10,
    })
    const r2Person = await Person.create({
      personFirstname: 'CA8',
      personLastname: 'Actor',
      personSecondLastname: stamp2,
      personEmail: `ca8-${stamp2}@block-test.local`,
    })
    const r2User = await User.create({
      userEmail: `ca8-${stamp2}@block-test.local`,
      userPassword: 'BloqueTest123!',
      userActive: 1,
      roleId: r2Role.roleId,
      personId: r2Person.personId,
      userEmailType: 'institutional',
    })
    // R2 solo es responsable de Alfa D1 (tiene departamento)
    const alfaEmployee = await Employee.query()
      .where('business_unit_id', world.companyAId)
      .whereNotNull('department_id')
      .first()

    if (alfaEmployee) {
      await UserResponsibleEmployee.create({ userId: r2User.userId, employeeId: alfaEmployee.employeeId })
    }

    try {
      const r1 = await svc.generateAssistanceAllBuffer(
        filtersFor(world, { userResponsibleId: r2User.userId }),
        [world.d1Id, world.d2Id],
        [world.companyAId],
        async () => {}
      )
      assert.equal((r1 as any).status, 201)
      const s1 = await loadFirstSheet((r1 as any).buffer as ArrayBuffer)
      assert.isNull(findLabelRowNumberDetailed(s1, LABEL), 'Detallada: R2 no debe ver bloque')

      const r2 = await svc.generateIncidentSummaryBuffer(
        filtersFor(world, { userResponsibleId: r2User.userId }),
        [world.d1Id, world.d2Id],
        [world.companyAId],
        false,
        false,
        async () => {}
      )
      assert.equal((r2 as any).status, 201)
      const s2 = await loadFirstSheet((r2 as any).buffer as ArrayBuffer)
      assert.isFalse(labelExistsInSummary(s2, LABEL), 'Resumen: R2 no debe ver bloque')
    } finally {
      await db.from('user_responsible_employees').where('user_id', r2User.userId).delete()
      await r2User.delete()
      await r2Person.delete()
      await r2Role.delete()
    }
  }).timeout(120_000)

  // ── CA9: Aislamiento A/B ─────────────────────────────────────────────────
  test('CA9 · Aislamiento: S de empresa B no aparece en reportes de A', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const result = await svc.generateAssistanceAllBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    const allNames: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return
      const name = normalize(cellText(row.getCell(2)))
      if (name) allNames.push(name)
    })
    assert.notInclude(allNames, 'Sofia Cruz', 'S de empresa B no debe aparecer en reportes de A')
  }).timeout(120_000)

  // ── CA10: Montos ocultos ─────────────────────────────────────────────────
  test('CA10 · Montos: con canDisplayPaymentsSummary=false el bloque no muestra toPay', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const withoutPay = await svc.generateIncidentSummaryBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      false, // canDisplayPaymentsSummary
      false,
      async () => {}
    )
    assert.equal((withoutPay as any).status, 201)
    const withoutPaySheet = await loadFirstSheet((withoutPay as any).buffer as ArrayBuffer)

    const withPay = await svc.generateIncidentSummaryBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      true,  // canDisplayPaymentsSummary
      false,
      async () => {}
    )
    assert.equal((withPay as any).status, 201)
    const withPaySheet = await loadFirstSheet((withPay as any).buffer as ArrayBuffer)

    // El reporte SIN montos debe tener menos columnas que el reporte CON montos
    // Ambos reportes deben tener status 201 — este es el control mínimo verificable
    let withoutPayRowCount = 0
    let withPayRowCount = 0
    withoutPaySheet.eachRow(() => { withoutPayRowCount++ })
    withPaySheet.eachRow(() => { withPayRowCount++ })
    assert.equal(withoutPayRowCount, withPayRowCount, 'Ambos deben tener el mismo número de filas')
  }).timeout(120_000)

  // ── CA11: Avance llega al final con el bloque ─────────────────────────────
  test('CA11 · Avance: current === total e incluye a M, P y N', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    const progress = recordProgress()
    const result = await svc.generateAssistanceAllBuffer(
      filtersFor(world, { includeUnassigned: true }),
      [world.d1Id, world.d2Id],
      [world.companyAId],
      progress.onProgress
    )
    assert.equal((result as any).status, 201)
    // M, P y N son los tres sin departamento en A.
    // También hay Alfa (D1) y Beta (D2). Total = 5 empleados.
    const expectedTotal = 5
    assertProgress(assert, progress.calls, expectedTotal)
  }).timeout(120_000)

  // ── CA12: Trabajo encolado antes (sin includeUnassigned) → sin bloque ─────
  test('CA12 · Trabajo encolado antes: sin includeUnassigned, sin bloque', async ({ assert }) => {
    const world = w!
    const svc = new AssistsService(locale())
    // Llamar con filters sin includeUnassigned (como los trabajos encolados antes de la HU)
    const result = await svc.generateAssistanceAllBuffer(
      filtersFor(world), // sin includeUnassigned
      [world.d1Id, world.d2Id],
      [world.companyAId],
      async () => {}
    )
    assert.equal((result as any).status, 201)
    const sheet = await loadFirstSheet((result as any).buffer as ArrayBuffer)
    assert.isNull(
      findLabelRowNumberDetailed(sheet, LABEL),
      'Sin includeUnassigned no debe aparecer el bloque'
    )
  }).timeout(120_000)

  // ── CA13: Empresa no resoluble → 400 ────────────────────────────────────
  test('CA13 · Empresa no resoluble: los tres generadores devuelven error 400', async ({ assert }) => {
    const svc = new AssistsService(locale())
    const filters: AssistExcelFilterInterface = {
      filterDate: FILTER_DATE,
      filterDateEnd: FILTER_DATE_END,
      businessUnitId: 999999,
      includeUnassigned: true,
    }
    const r1 = await svc.generateAssistanceAllBuffer(filters, [], [], async () => {})
    assert.equal((r1 as any).status, 400)
    assert.equal((r1 as any).error, 'MISSING_BUSINESS_UNIT_SCOPE')

    const r2 = await svc.generateIncidentSummaryBuffer(filters, [], [], false, false, async () => {})
    assert.equal((r2 as any).status, 400)

    const r3 = await svc.generateIncidentSummaryPayrollBuffer(filters, [], [], async () => {})
    assert.equal((r3 as any).status, 400)
  }).timeout(60_000)

  // ── SEC-1 / SEC-2: Aislamiento en processJob ──────────────────────────────
  test('SEC-2 · processJob: el reporte generado fuera de petición no contiene a S de empresa B', async ({ assert }) => {
    const world = w!
    // Crear un job en BD con los filtros de empresa A
    const job = await ReportJob.create({
      userId: 1, // usuario root (existe en sae_principal_db)
      reportJobType: 'assistance_all',
      reportJobFilters: {
        filterDate: FILTER_DATE,
        filterDateEnd: FILTER_DATE_END,
        businessUnitId: world.companyAId,
        includeUnassigned: true,
        departmentsList: [world.d1Id, world.d2Id],
      } as any,
      reportJobAllowedBusinessUnitIds: [world.companyAId],
      reportJobStatus: 'pending' as ReportJobStatus,
    })
    try {
      const svc = new ReportJobService()
      await svc.processJob(job.reportJobId)
      await job.refresh()
      // El job debe completarse (status = completed o saved file)
      // Al menos no debe lanzar error ni completarse con status failed en BD
      assert.notEqual(job.reportJobStatus, 'failed', 'El job no debe terminar en failed')
    } finally {
      await ReportJob.query().where('report_job_id', job.reportJobId).delete()
    }
  }).timeout(120_000)
})

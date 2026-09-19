import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import {
  ABSENCES_MAX_RANGE_DAYS,
  applyContractingCompanyVisibility,
  buildAbsencesResponse,
  collectCandidateBranchIds,
  countRangeDaysInclusive,
  selectLoanForDay,
  toAbsencesBranch,
} from '../../../app/modules/attendance-stats/attendance-stats.absences.js'
import type { BuildAbsencesInput } from '../../../app/modules/attendance-stats/attendance-stats.absences.js'
import AttendanceStatsService from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import type { AttendanceStatsServiceDependencies } from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import AttendanceStatsRepositoryMysql from '../../../app/modules/attendance-stats/attendance-stats.repository.mysql.js'
import {
  getAttendanceAbsencesValidator,
  splitBranchOfficeIdsQuery,
} from '../../../app/modules/attendance-stats/validators/get-attendance-absences.validator.js'
import type { AttendanceStatsRepository } from '../../../app/modules/attendance-stats/attendance-stats.repository.js'
import type { EmployeeRoleScope } from '../../../app/helpers/resolve_employee_role_scope.js'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import type { ShiftExceptionInterface } from '../../../app/interfaces/shift_exception_interface.js'
import type {
  AbsencesBranch,
  AbsencesBranchRow,
  AbsencesFilters,
  AbsencesResponse,
  AttendanceStatsViewer,
  CoverageRangeLoanRow,
  EmployeeCalendarBundle,
} from '../../../app/modules/attendance-stats/dto/attendance-stats.dto.js'

/**
 * Motor único de ausencias: el drawer de Ausencias del monitor pinta
 * Organigrama, Sucursales y Clientes REPSE con las mismas entradas por día
 * (colaborador y sucursal efectiva, con préstamos). Las reglas corren sobre
 * calendarios en memoria y el orquestador con dobles del repositorio y de sus
 * dependencias, sin BD; el controller, el SQL y el grafo de imports se revisan
 * por censo.
 */
const MODULE_DIR = join(process.cwd(), 'app/modules/attendance-stats')
const CONTROLLER_FILE = join(MODULE_DIR, 'attendance-stats.controller.ts')
const REPO_FILE = join(MODULE_DIR, 'attendance-stats.repository.mysql.ts')
const ABSENCES_FILE = join(MODULE_DIR, 'attendance-stats.absences.ts')
const RULES_FILE = join(MODULE_DIR, 'attendance-stats.rules.ts')
const ROUTES_FILE = join(process.cwd(), 'start/routes/attendance_stats_routes.ts')

const I18N_STUB = { formatMessage: (key: string) => key } as unknown as I18n
const THRESHOLDS = { delayMinutes: 10, faultMinutes: 30 }
const START_DAY = '2026-09-01'
const END_DAY = '2026-09-05'
const PERIOD_DAYS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']

/** Sucursales del catálogo; OUTSIDE_BRANCH no está en él (borrada o de otra empresa). */
const BRANCH_A = 10
const BRANCH_B = 20
const BRANCH_C = 30
const OUTSIDE_BRANCH = 99
const BRANCH_REFS: Record<'a' | 'b' | 'c', AbsencesBranch> = {
  a: { branchOfficeId: BRANCH_A, name: 'Almacén Norte', empresaContratanteId: null, empresaContratanteName: null },
  b: { branchOfficeId: BRANCH_B, name: 'Bodega Sur', empresaContratanteId: 7, empresaContratanteName: 'Cliente Uno SA' },
  c: { branchOfficeId: BRANCH_C, name: 'Corporativo', empresaContratanteId: null, empresaContratanteName: null },
}
/** Catálogo tal como lo entrega el repositorio (sin el orden por nombre de la respuesta). */
const CATALOG: AbsencesBranch[] = [BRANCH_REFS.c, BRANCH_REFS.b, BRANCH_REFS.a]

/** Marca de `branchByDay` para un día en que el colaborador no aparece. */
const NO_ENTRY = 'sin-falta'

interface DayParams {
  checkInStatus?: string
  isFutureDay?: boolean
  isRestDay?: boolean
  isVacationDate?: boolean
  isHoliday?: boolean
  isWorkDisabilityDate?: boolean
  exceptions?: ShiftExceptionInterface[]
}

/** Día-empleado mínimo; solo se llenan los campos que lee la clasificación. */
function buildDay(day: string, params: DayParams = {}): AssistDayInterface {
  return {
    day,
    assist: {
      checkIn: null,
      checkOut: null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: null,
      dateShiftApplySince: null,
      employeeShiftId: null,
      shiftCalculateFlag: '',
      checkInDateTime: null,
      checkOutDateTime: null,
      checkInStatus: params.checkInStatus ?? '',
      checkOutStatus: '',
      isFutureDay: params.isFutureDay ?? false,
      isSundayBonus: false,
      isRestDay: params.isRestDay ?? false,
      isVacationDate: params.isVacationDate ?? false,
      isWorkDisabilityDate: params.isWorkDisabilityDate ?? false,
      isHoliday: params.isHoliday ?? false,
      isBirthday: false,
      holiday: null,
      hasExceptions: false,
      exceptions: params.exceptions ?? [],
    },
  }
}

function faultOn(day: string, params: DayParams = {}): AssistDayInterface {
  return buildDay(day, { ...params, checkInStatus: 'fault' })
}

function allFaults(): AssistDayInterface[] {
  return PERIOD_DAYS.map((day) => faultOn(day))
}

function buildBundle(params: {
  employeeId: number
  firstName: string | null
  lastName?: string | null
  secondLastName?: string | null
  photo?: string | null
  homeBranchId: number | null
  calendar: AssistDayInterface[]
  departmentId?: number | null
  departmentName?: string | null
  departmentAlias?: string | null
  positionName?: string | null
  positionAlias?: string | null
}): EmployeeCalendarBundle {
  const departmentId = params.departmentId === undefined ? 1 : params.departmentId
  const departmentName = params.departmentName ?? null
  return {
    employee: {
      employeeId: params.employeeId,
      employeeSlug: `slug-${params.employeeId}`,
      employeeCode: null,
      employeePayrollCode: null,
      employeeFirstName: params.firstName,
      employeeLastName: params.lastName === undefined ? 'Prueba' : params.lastName,
      employeeSecondLastName: params.secondLastName ?? null,
      employeePhoto: params.photo ?? null,
      departmentId,
      positionId: params.positionName === undefined ? null : 1,
      businessUnitId: 1,
      payrollBusinessUnitId: 1,
      branchOfficeId: params.homeBranchId,
      branchOfficeName: null,
      departmentAlias: params.departmentAlias ?? null,
      positionAlias: params.positionAlias ?? null,
      department: departmentId === null ? null : { departmentId, departmentName },
      position:
        params.positionName === undefined
          ? null
          : { positionId: 1, positionName: params.positionName },
      businessUnit: null,
    },
    departmentName,
    calendar: params.calendar,
  }
}

function buildLoan(params: {
  assignmentId: number
  employeeId: number
  targetBranchId: number
  startDate: string
  endDate: string
  cancelledAt?: string | null
}): CoverageRangeLoanRow {
  return {
    assignmentId: params.assignmentId,
    employeeId: params.employeeId,
    sourceBranchId: BRANCH_A,
    targetBranchId: params.targetBranchId,
    startDate: params.startDate,
    endDate: params.endDate,
    cancelledAt: params.cancelledAt ?? null,
  }
}

/**
 * Periodo del 1 al 5 de septiembre, catálogo A/B/C, todos los colaboradores
 * visibles y usuario con `shift-coverage`, salvo que se indique.
 */
function build(
  input: Partial<BuildAbsencesInput> & Pick<BuildAbsencesInput, 'bundles'>
): AbsencesResponse {
  return buildAbsencesResponse({
    startDay: START_DAY,
    endDay: END_DAY,
    branches: CATALOG,
    loans: [],
    visibleEmployeeIds: new Set(input.bundles.map((bundle) => bundle.employee.employeeId)),
    canSeeContractingCompany: true,
    thresholds: THRESHOLDS,
    ...input,
  })
}

/** Sucursal de la entrada del colaborador cada día del periodo, o `NO_ENTRY` si ese día no faltó. */
function branchByDay(
  response: AbsencesResponse,
  employeeId: number
): Array<number | null | typeof NO_ENTRY> {
  return response.days.map((day) => {
    const entry = day.entries.find((row) => row.employeeId === employeeId)
    return entry ? entry.branchOfficeId : NO_ENTRY
  })
}

function entriesPerDay(response: AbsencesResponse | null | undefined): number[] {
  return (response?.days ?? []).map((day) => day.entries.length)
}

async function validationFails(payload: Record<string, unknown>): Promise<boolean> {
  try {
    await getAttendanceAbsencesValidator.validate(payload)
    return false
  } catch {
    return true
  }
}

/** Mensaje de VineJS; el controller los devuelve tal cual en `details`. */
interface ValidationMessage {
  message: string
  rule: string
  field: string
}

/** Mensajes con los que falla la validación; vacío si la entrada es válida. */
async function validationMessages(payload: Record<string, unknown>): Promise<ValidationMessage[]> {
  try {
    await getAttendanceAbsencesValidator.validate(payload)
    return []
  } catch (error: unknown) {
    const messages = (error as { messages?: ValidationMessage[] }).messages
    if (!messages) throw error
    return messages
  }
}

/** Cuerpo de un método de clase: desde su firma hasta el siguiente método async. */
function methodBody(content: string, signature: string): string {
  const start = content.indexOf(signature)
  if (start === -1) throw new Error(`no se encontró ${signature}`)
  const rest = content.slice(start + signature.length)
  const nextMethod = rest.search(/\n {2}(?:private )?async /)
  return nextMethod === -1 ? rest : rest.slice(0, nextMethod)
}

/** Repositorio que registra cualquier consulta y la rechaza: el caso probado no debe tocar la BD. */
function failingRepo(calls: string[]): AttendanceStatsRepository {
  const fail = (name: string) => async (): Promise<never> => {
    calls.push(name)
    throw new Error(`no debe consultar ${name}`)
  }
  return {
    getEmployeeCalendars: fail('getEmployeeCalendars'),
    getAbsencesEmployeeIds: fail('getAbsencesEmployeeIds'),
    getAbsencesBranches: fail('getAbsencesBranches'),
    getLoansForRange: fail('getLoansForRange'),
    getEmployeeIdsInResponsibleScope: fail('getEmployeeIdsInResponsibleScope'),
  }
}

/** Consulta que recibió un doble, con sus argumentos. */
interface RecordedCall {
  name: string
  args: unknown[]
}

function argsOf(calls: readonly RecordedCall[], name: string): unknown[][] {
  return calls.filter((call) => call.name === name).map((call) => call.args)
}

/** Acceso completo a la plantilla, con el departamento por defecto de `buildBundle`. */
const FULL_ROLE_SCOPE: EmployeeRoleScope = { departmentsList: [1], userResponsibleId: null }
const ORCHESTRATOR_FILTERS: AbsencesFilters = {
  startDay: START_DAY,
  endDay: END_DAY,
  branchOfficeIds: [BRANCH_A, BRANCH_B],
  payrollBusinessUnitId: 3,
}
const ORCHESTRATOR_SCOPE = { allowedBusinessUnitIds: [4, 5] }
const USER_ID = 30
const ROLE_ID = 12
const VIEWER: AttendanceStatsViewer = { userId: USER_ID, roleId: ROLE_ID }

/**
 * Service con dobles: el repositorio entrega el universo, los calendarios, los
 * préstamos y el catálogo indicados; las dependencias resuelven el alcance, las
 * tolerancias y el permiso `shift-coverage` (concedido salvo que se indique)
 * sin BD. Cada doble registra sus argumentos; las consultas que el caso no
 * prepara fallan como en `failingRepo`.
 */
function orchestrator(params: {
  universe: number[]
  bundles?: EmployeeCalendarBundle[]
  loans?: CoverageRangeLoanRow[]
  roleScope?: EmployeeRoleScope | null
  responsibleIds?: number[]
  canSeeContractingCompany?: boolean
}): { service: AttendanceStatsService; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const answer =
    <T>(name: string, value: T) =>
    async (...args: unknown[]): Promise<T> => {
      calls.push({ name, args })
      return value
    }
  const repo: AttendanceStatsRepository = {
    ...failingRepo([]),
    getAbsencesEmployeeIds: answer('getAbsencesEmployeeIds', params.universe),
    getEmployeeCalendars: answer('getEmployeeCalendars', params.bundles ?? []),
    getLoansForRange: answer('getLoansForRange', params.loans ?? []),
    getAbsencesBranches: answer('getAbsencesBranches', CATALOG),
    getEmployeeIdsInResponsibleScope: answer(
      'getEmployeeIdsInResponsibleScope',
      params.responsibleIds ?? []
    ),
  }
  const dependencies: AttendanceStatsServiceDependencies = {
    resolveEmployeeRoleScope: answer(
      'resolveEmployeeRoleScope',
      params.roleScope === undefined ? FULL_ROLE_SCOPE : params.roleScope
    ),
    loadToleranceThresholds: answer('loadToleranceThresholds', THRESHOLDS),
    hasShiftCoverageAccess: answer(
      'hasShiftCoverageAccess',
      params.canSeeContractingCompany === undefined ? true : params.canSeeContractingCompany
    ),
  }
  return { service: new AttendanceStatsService(I18N_STUB, repo, dependencies), calls }
}

test.group('Attendance-stats — motor único de ausencias por día con sucursal efectiva y empresa contratante', () => {
  test('atribuye cada falta a la sucursal efectiva cuando un préstamo cambia de sucursal a mitad del rango', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: allFaults() }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: allFaults() }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: BRANCH_B, startDate: '2026-09-03', endDate: '2026-09-04' }),
        buildLoan({ assignmentId: 2, employeeId: 2, targetBranchId: BRANCH_C, startDate: '2026-09-02', endDate: '2026-09-10' }),
      ],
    })

    assert.deepEqual(branchByDay(response, 1), [BRANCH_A, BRANCH_A, BRANCH_B, BRANCH_B, BRANCH_A])
    assert.deepEqual(branchByDay(response, 2), [BRANCH_A, BRANCH_C, BRANCH_C, BRANCH_C, BRANCH_C])
    // Catálogo de las referenciadas, con su empresa contratante y por nombre.
    assert.deepEqual(response.branches, [BRANCH_REFS.a, BRANCH_REFS.b, BRANCH_REFS.c])
  })

  test('un préstamo cancelado deja de mover al colaborador desde cancelled_at', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: allFaults() }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: allFaults() }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: BRANCH_B, startDate: START_DAY, endDate: END_DAY, cancelledAt: '2026-09-03' }),
        // Cancelado el mismo día en que iniciaba: nunca movió al colaborador.
        buildLoan({ assignmentId: 2, employeeId: 2, targetBranchId: BRANCH_B, startDate: START_DAY, endDate: END_DAY, cancelledAt: START_DAY }),
      ],
    })

    assert.deepEqual(branchByDay(response, 1), [BRANCH_B, BRANCH_B, BRANCH_A, BRANCH_A, BRANCH_A])
    assert.deepEqual(branchByDay(response, 2), [BRANCH_A, BRANCH_A, BRANCH_A, BRANCH_A, BRANCH_A])
  })

  test('con dos préstamos vigentes gana el de inicio más reciente y, empatando, el de id mayor', ({ assert }) => {
    const loans = [
      buildLoan({ assignmentId: 7, employeeId: 1, targetBranchId: BRANCH_A, startDate: '2026-09-01', endDate: '2026-09-05' }),
      buildLoan({ assignmentId: 3, employeeId: 1, targetBranchId: BRANCH_B, startDate: '2026-09-03', endDate: '2026-09-05' }),
      buildLoan({ assignmentId: 9, employeeId: 1, targetBranchId: BRANCH_C, startDate: '2026-09-03', endDate: '2026-09-04' }),
    ]
    const reversed = [...loans].reverse()

    const chosen = PERIOD_DAYS.map((day) => selectLoanForDay(loans, day)?.assignmentId)
    assert.deepEqual(chosen, [7, 7, 9, 9, 3])
    assert.deepEqual(
      PERIOD_DAYS.map((day) => selectLoanForDay(reversed, day)?.assignmentId),
      chosen
    )

    const bundles = [buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: null, calendar: allFaults() })]
    const expected = [BRANCH_A, BRANCH_A, BRANCH_C, BRANCH_C, BRANCH_B]
    assert.deepEqual(branchByDay(build({ bundles, loans }), 1), expected)
    assert.deepEqual(branchByDay(build({ bundles, loans: reversed }), 1), expected)
  })

  test('con varias sucursales base activas usa la de branchOfficeId menor sin importar el orden de las filas', ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_B, calendar: allFaults() }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_C, calendar: allFaults() }),
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: null, calendar: allFaults() }),
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: allFaults() }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_B, calendar: allFaults() }),
      // Una fila sin base no gana a una con base.
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: BRANCH_C, calendar: allFaults() }),
    ]
    // El préstamo sigue mandando sobre la base elegida.
    const loans = [
      buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: BRANCH_C, startDate: '2026-09-03', endDate: '2026-09-03' }),
    ]

    const response = build({ bundles, loans })

    assert.deepEqual(branchByDay(response, 1), [BRANCH_A, BRANCH_A, BRANCH_C, BRANCH_A, BRANCH_A])
    assert.deepEqual(branchByDay(response, 2), [BRANCH_B, BRANCH_B, BRANCH_B, BRANCH_B, BRANCH_B])
    assert.deepEqual(branchByDay(response, 3), [BRANCH_C, BRANCH_C, BRANCH_C, BRANCH_C, BRANCH_C])
    // Una entrada por colaborador por día y un solo registro en employees.
    assert.deepEqual(entriesPerDay(response), [3, 3, 3, 3, 3])
    assert.deepEqual(
      response.employees.map((employee) => employee.employeeId),
      [1, 2, 3]
    )
    assert.deepEqual(build({ bundles: [...bundles].reverse(), loans }), response)
  })

  test('sin base ni préstamo, o con la sucursal fuera del catálogo, la entrada va con branchOfficeId null', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: null, calendar: allFaults() }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: OUTSIDE_BRANCH, calendar: allFaults() }),
        buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: BRANCH_A, calendar: allFaults() }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 3, targetBranchId: OUTSIDE_BRANCH, startDate: '2026-09-02', endDate: '2026-09-02' }),
      ],
    })

    assert.deepEqual(branchByDay(response, 1), [null, null, null, null, null])
    assert.deepEqual(branchByDay(response, 2), [null, null, null, null, null])
    assert.deepEqual(branchByDay(response, 3), [BRANCH_A, null, BRANCH_A, BRANCH_A, BRANCH_A])
    // B y C están en el catálogo pero ninguna entrada las referencia.
    assert.deepEqual(response.branches, [BRANCH_REFS.a])
  })

  test('el catálogo expone la empresa contratante solo si está viva y es del tenant', ({ assert }) => {
    const allowed = [4, 5]
    const row = (empresaContratante: AbsencesBranchRow['empresaContratante']): AbsencesBranchRow => ({
      branchOfficeId: BRANCH_B,
      name: 'Bodega Sur',
      empresaContratante,
    })
    const empresa = { empresaContratanteId: 7, razonSocial: 'Cliente Uno SA', businessUnitId: 5, isDeleted: false }
    const withoutEmpresa = { branchOfficeId: BRANCH_B, name: 'Bodega Sur', empresaContratanteId: null, empresaContratanteName: null }

    assert.deepEqual(toAbsencesBranch(row(empresa), allowed), {
      branchOfficeId: BRANCH_B,
      name: 'Bodega Sur',
      empresaContratanteId: 7,
      empresaContratanteName: 'Cliente Uno SA',
    })
    assert.deepEqual(toAbsencesBranch(row({ ...empresa, isDeleted: true }), allowed), withoutEmpresa)
    assert.deepEqual(toAbsencesBranch(row({ ...empresa, businessUnitId: 6 }), allowed), withoutEmpresa)
    assert.deepEqual(toAbsencesBranch(row(null), allowed), withoutEmpresa)
    assert.deepEqual(toAbsencesBranch(row(empresa), []), withoutEmpresa)
  })

  test('sin shift-coverage las sucursales van sin empresa contratante, con la misma forma y las mismas entradas', ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_B, calendar: [faultOn('2026-09-02')] }),
    ]
    const hiddenB: AbsencesBranch = { ...BRANCH_REFS.b, empresaContratanteId: null, empresaContratanteName: null }

    const allowed = build({ bundles, canSeeContractingCompany: true })
    const denied = build({ bundles, canSeeContractingCompany: false })

    assert.deepEqual(allowed.branches, [BRANCH_REFS.a, BRANCH_REFS.b])
    assert.deepEqual(denied.branches, [BRANCH_REFS.a, hiddenB])
    for (const branch of denied.branches) {
      assert.sameMembers(Object.keys(branch), Object.keys(BRANCH_REFS.b))
    }
    assert.deepEqual(denied.period, allowed.period)
    assert.deepEqual(denied.days, allowed.days)
    assert.deepEqual(denied.employees, allowed.employees)

    // El mapeo es puro: no muta la sucursal de entrada.
    assert.deepEqual(applyContractingCompanyVisibility(BRANCH_REFS.b, true), BRANCH_REFS.b)
    assert.deepEqual(applyContractingCompanyVisibility(BRANCH_REFS.b, false), hiddenB)
    assert.equal(BRANCH_REFS.b.empresaContratanteId, 7)
    assert.equal(BRANCH_REFS.b.empresaContratanteName, 'Cliente Uno SA')
  })

  test('las sucursales candidatas son las bases de los calendarios y los destinos de los préstamos, sin repetir', ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_B, calendar: [] }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: null, calendar: [] }),
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: BRANCH_A, calendar: [] }),
    ]
    const loans = [
      buildLoan({ assignmentId: 1, employeeId: 2, targetBranchId: BRANCH_C, startDate: START_DAY, endDate: END_DAY }),
      buildLoan({ assignmentId: 2, employeeId: 1, targetBranchId: BRANCH_A, startDate: START_DAY, endDate: END_DAY }),
    ]

    assert.deepEqual(collectCandidateBranchIds(bundles, loans), [BRANCH_A, BRANCH_B, BRANCH_C])
    assert.deepEqual(collectCandidateBranchIds([], []), [])
  })

  test('days trae todos los días del periodo en orden, con entries vacío si nadie faltó', ({ assert }) => {
    const response = build({ startDay: '2026-08-28', endDay: '2026-09-03', bundles: [] })

    assert.deepEqual(response, {
      period: { startDay: '2026-08-28', endDay: '2026-09-03' },
      branches: [],
      employees: [],
      days: [
        { day: '2026-08-28', entries: [] },
        { day: '2026-08-29', entries: [] },
        { day: '2026-08-30', entries: [] },
        { day: '2026-08-31', entries: [] },
        { day: '2026-09-01', entries: [] },
        { day: '2026-09-02', entries: [] },
        { day: '2026-09-03', entries: [] },
      ],
    })
  })

  test('entries y employees se ordenan por nombre completo en español y desempatan por id', ({ assert }) => {
    const firstDay = [faultOn(START_DAY)]
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Óscar', lastName: 'Ruiz', homeBranchId: BRANCH_A, calendar: firstDay }),
        buildBundle({ employeeId: 9, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: firstDay }),
        buildBundle({ employeeId: 2, firstName: 'Ana', lastName: 'Zamora', homeBranchId: BRANCH_A, calendar: firstDay }),
        buildBundle({ employeeId: 4, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: firstDay }),
        buildBundle({ employeeId: 5, firstName: 'Ana', lastName: 'Álvarez', homeBranchId: BRANCH_A, calendar: firstDay }),
      ],
    })

    const expectedOrder = [5, 2, 4, 9, 1]
    assert.deepEqual(
      response.days[0].entries.map((entry) => entry.employeeId),
      expectedOrder
    )
    assert.deepEqual(
      response.employees.map((employee) => employee.employeeId),
      expectedOrder
    )
  })

  test('employees lista una vez a cada colaborador con alias de puesto y departamento cuando existe', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({
          employeeId: 1,
          firstName: 'Ana',
          lastName: 'López',
          secondLastName: 'Díaz',
          photo: 'fotos/1.jpg',
          homeBranchId: BRANCH_A,
          departmentId: 3,
          departmentName: 'Operaciones',
          departmentAlias: 'Ops',
          positionName: 'Guardia',
          positionAlias: 'Vigilante',
          calendar: [faultOn('2026-09-01'), faultOn('2026-09-02')],
        }),
        buildBundle({
          employeeId: 2,
          firstName: 'Beto',
          lastName: null,
          homeBranchId: BRANCH_A,
          departmentId: null,
          calendar: [faultOn('2026-09-01')],
        }),
        buildBundle({
          employeeId: 3,
          firstName: 'Carla',
          homeBranchId: BRANCH_A,
          departmentName: 'Ventas',
          departmentAlias: '   ',
          positionName: 'Cajera',
          positionAlias: '',
          calendar: [faultOn('2026-09-02')],
        }),
        buildBundle({ employeeId: 4, firstName: null, lastName: 'Zeta', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-03')] }),
        // Sin faltas: no se lista.
        buildBundle({ employeeId: 5, firstName: 'Diana', homeBranchId: BRANCH_A, calendar: [buildDay('2026-09-01', { checkInStatus: 'ontime' })] }),
      ],
    })

    assert.deepEqual(response.employees, [
      { employeeId: 1, employeeSlug: 'slug-1', firstName: 'Ana', lastName: 'López', secondLastName: 'Díaz', photo: 'fotos/1.jpg', positionName: 'Vigilante', departmentId: 3, departmentName: 'Ops' },
      { employeeId: 2, employeeSlug: 'slug-2', firstName: 'Beto', lastName: null, secondLastName: null, photo: null, positionName: null, departmentId: null, departmentName: null },
      { employeeId: 3, employeeSlug: 'slug-3', firstName: 'Carla', lastName: 'Prueba', secondLastName: null, photo: null, positionName: 'Cajera', departmentId: 1, departmentName: 'Ventas' },
      { employeeId: 4, employeeSlug: 'slug-4', firstName: '', lastName: 'Zeta', secondLastName: null, photo: null, positionName: null, departmentId: 1, departmentName: null },
    ])
  })

  test('recorta por visibles antes de contar: días, empleados y sucursales', ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Carla', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Ana', homeBranchId: BRANCH_B, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 3, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 4, firstName: 'Diana', homeBranchId: BRANCH_C, calendar: [faultOn('2026-09-01'), faultOn('2026-09-02')] }),
    ]

    const response = build({ bundles, visibleEmployeeIds: new Set([1, 3, 4]) })

    assert.deepEqual(response.days.slice(0, 2), [
      {
        day: '2026-09-01',
        entries: [
          { employeeId: 3, branchOfficeId: BRANCH_A },
          { employeeId: 1, branchOfficeId: BRANCH_A },
          { employeeId: 4, branchOfficeId: BRANCH_C },
        ],
      },
      { day: '2026-09-02', entries: [{ employeeId: 4, branchOfficeId: BRANCH_C }] },
    ])
    assert.deepEqual(
      response.employees.map((employee) => employee.employeeId),
      [3, 1, 4]
    )
    // B solo la referenciaba un colaborador no visible.
    assert.deepEqual(response.branches, [BRANCH_REFS.a, BRANCH_REFS.c])

    const nobody = build({ bundles, visibleEmployeeIds: new Set() })
    assert.deepEqual(entriesPerDay(nobody), [0, 0, 0, 0, 0])
    assert.lengthOf(nobody.employees, 0)
    assert.lengthOf(nobody.branches, 0)
  })

  test('descanso, vacaciones, festivo, incapacidad, día futuro y excepción no general no cuentan', ({ assert }) => {
    const nonGeneral = {
      exceptionType: { exceptionTypeSlug: 'absence-from-work', exceptionTypeIsGeneral: 0 },
    } as unknown as ShiftExceptionInterface
    const response = build({
      endDay: '2026-09-06',
      bundles: [
        buildBundle({
          employeeId: 1,
          firstName: 'Ana',
          homeBranchId: BRANCH_A,
          calendar: [
            faultOn('2026-09-01', { isRestDay: true }),
            faultOn('2026-09-02', { isVacationDate: true }),
            faultOn('2026-09-03', { isHoliday: true }),
            faultOn('2026-09-04', { isWorkDisabilityDate: true }),
            faultOn('2026-09-05', { isFutureDay: true }),
            faultOn('2026-09-06', { exceptions: [nonGeneral] }),
          ],
        }),
        // Control: la misma falta en un día laborable sí cuenta.
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01')] }),
      ],
    })

    assert.deepEqual(entriesPerDay(response), [1, 0, 0, 0, 0, 0])
    assert.deepEqual(branchByDay(response, 1), [NO_ENTRY, NO_ENTRY, NO_ENTRY, NO_ENTRY, NO_ENTRY, NO_ENTRY])
    assert.deepEqual(
      response.employees.map((employee) => employee.employeeId),
      [2]
    )
  })

  test('solo cuenta el día en que classifyDay registra exactamente una falta', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({
          employeeId: 1,
          firstName: 'Ana',
          homeBranchId: BRANCH_A,
          calendar: [
            buildDay('2026-09-01', { checkInStatus: 'ontime' }),
            buildDay('2026-09-02', { checkInStatus: 'tolerance' }),
            buildDay('2026-09-03', { checkInStatus: 'delay' }),
            buildDay('2026-09-04', { checkInStatus: '' }),
            faultOn('2026-09-05'),
          ],
        }),
      ],
    })

    assert.deepEqual(entriesPerDay(response), [0, 0, 0, 0, 1])
  })

  test('el tope es de 62 días inclusive y una fecha inexistente no da conteo', ({ assert }) => {
    assert.equal(ABSENCES_MAX_RANGE_DAYS, 62)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-09-01'), 1)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-11-01'), 62)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-11-02'), 63)
    assert.isNull(countRangeDaysInclusive('2026-02-31', '2026-03-01'))
  })

  test('el service valida alcance y periodo antes de tocar la BD; 62 días sí consulta el universo', async ({ assert }) => {
    const calls: string[] = []
    const service = new AttendanceStatsService(I18N_STUB, failingRepo(calls))
    const scope = { allowedBusinessUnitIds: [1] }
    const request = (startDay: string, endDay: string): AbsencesFilters => ({ startDay, endDay })

    const exceeded = await service.getAbsences(request('2026-09-01', '2026-11-02'), scope, VIEWER)
    assert.include(exceeded, {
      status: 400,
      key: 'rango-maximo-excedido',
      title: 'attendance_stats_absences_range_exceeded_title',
      message: 'attendance_stats_absences_range_exceeded_detail',
    })

    const inverted = await service.getAbsences(request('2026-09-05', '2026-09-01'), scope, VIEWER)
    assert.include(inverted, { status: 400, key: 'rango-invalido' })

    const nonexistent = await service.getAbsences(request('2026-02-31', '2026-03-01'), scope, VIEWER)
    assert.include(nonexistent, { status: 400, key: 'entrada-invalida' })

    const noScope = await service.getAbsences(request(START_DAY, END_DAY), { allowedBusinessUnitIds: [] }, VIEWER)
    assert.include(noScope, { status: 403, key: 'scope-insuficiente' })

    assert.deepEqual(calls, [])

    const atLimit = orchestrator({ universe: [] })
    const result = await atLimit.service.getAbsences(request('2026-09-01', '2026-11-01'), scope, VIEWER)
    assert.equal(result.status, 200)
    assert.lengthOf(result.data?.days ?? [], 62)
  })

  test('orquestador: con universo vacío no calcula calendarios, préstamos, tolerancias, alcance ni catálogo', async ({ assert }) => {
    const { service, calls } = orchestrator({ universe: [] })

    const result = await service.getAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, VIEWER)

    assert.equal(result.status, 200)
    assert.deepEqual(argsOf(calls, 'getAbsencesEmployeeIds'), [
      [START_DAY, END_DAY, [4, 5], [BRANCH_A, BRANCH_B]],
    ])
    assert.deepEqual(
      calls.map((call) => call.name),
      ['getAbsencesEmployeeIds']
    )
    assert.deepEqual(result.data, {
      period: { startDay: START_DAY, endDay: END_DAY },
      branches: [],
      employees: [],
      days: PERIOD_DAYS.map((day) => ({ day, entries: [] })),
    })
  })

  test('orquestador: con universo lleno pasa employeeIds y payrollBusinessUnitId, y busca el catálogo de las candidatas', async ({ assert }) => {
    const { service, calls } = orchestrator({
      universe: [1, 2],
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01'), faultOn('2026-09-03')] }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_B, calendar: [faultOn('2026-09-02')] }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: BRANCH_C, startDate: '2026-09-03', endDate: '2026-09-03' }),
      ],
    })

    const result = await service.getAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, VIEWER)

    assert.equal(result.status, 200)
    assert.deepEqual(
      calls.map((call) => call.name),
      [
        'getAbsencesEmployeeIds',
        'getEmployeeCalendars',
        'getLoansForRange',
        'loadToleranceThresholds',
        'resolveEmployeeRoleScope',
        'getAbsencesBranches',
        'hasShiftCoverageAccess',
      ]
    )
    assert.deepEqual(argsOf(calls, 'getEmployeeCalendars'), [
      [{ startDay: START_DAY, endDay: END_DAY, employeeIds: [1, 2], payrollBusinessUnitId: 3 }, [4, 5]],
    ])
    assert.deepEqual(argsOf(calls, 'getLoansForRange'), [[[1, 2], START_DAY, END_DAY, [4, 5]]])
    assert.deepEqual(argsOf(calls, 'getAbsencesBranches'), [[[BRANCH_A, BRANCH_B, BRANCH_C], [4, 5]]])
    assert.deepEqual(argsOf(calls, 'hasShiftCoverageAccess'), [[ROLE_ID]])
    assert.deepEqual(
      result.data?.days.map((day) => day.entries),
      [
        [{ employeeId: 1, branchOfficeId: BRANCH_A }],
        [{ employeeId: 2, branchOfficeId: BRANCH_B }],
        [{ employeeId: 1, branchOfficeId: BRANCH_C }],
        [],
        [],
      ]
    )
    assert.deepEqual(result.data?.branches, [BRANCH_REFS.a, BRANCH_REFS.b, BRANCH_REFS.c])
  })

  test('orquestador: recorta a los visibles del usuario antes de contar', async ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, departmentId: 9, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_B, departmentId: 8, calendar: [faultOn('2026-09-01')] }),
    ]
    const run = async (roleScope: EmployeeRoleScope | null, responsibleIds?: number[]) => {
      const fixture = orchestrator({ universe: [1, 2], bundles, roleScope, responsibleIds })
      const result = await fixture.service.getAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, VIEWER)
      return { result, calls: fixture.calls }
    }

    // Sin acceso completo: solo a quienes tiene a cargo, resueltos sobre los calendarios del universo.
    const responsible = await run({ departmentsList: [], userResponsibleId: USER_ID }, [2])
    assert.deepEqual(
      argsOf(responsible.calls, 'resolveEmployeeRoleScope').map(([userId]) => userId),
      [USER_ID]
    )
    assert.deepEqual(argsOf(responsible.calls, 'getEmployeeIdsInResponsibleScope'), [
      [USER_ID, [1, 2], [4, 5]],
    ])
    assert.deepEqual(responsible.result.data?.days[0], {
      day: START_DAY,
      entries: [{ employeeId: 2, branchOfficeId: BRANCH_B }],
    })
    assert.deepEqual(
      responsible.result.data?.employees.map((employee) => employee.employeeId),
      [2]
    )
    assert.deepEqual(responsible.result.data?.branches, [BRANCH_REFS.b])

    // Con acceso completo: los de sus departamentos visibles.
    const byDepartment = await run({ departmentsList: [9], userResponsibleId: null })
    assert.deepEqual(byDepartment.result.data?.days[0], {
      day: START_DAY,
      entries: [{ employeeId: 1, branchOfficeId: BRANCH_A }],
    })

    // Usuario inexistente: nadie (fail-closed).
    const nobody = await run(null)
    assert.deepEqual(entriesPerDay(nobody.result.data), [0, 0, 0, 0, 0])
    assert.deepEqual(nobody.result.data?.employees, [])
    assert.deepEqual(nobody.result.data?.branches, [])
  })

  test('orquestador: consulta shift-coverage con el rol del usuario y sin él oculta la empresa contratante', async ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: BRANCH_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: BRANCH_B, calendar: [faultOn('2026-09-01')] }),
    ]
    const run = async (canSeeContractingCompany: boolean) => {
      const fixture = orchestrator({ universe: [1, 2], bundles, canSeeContractingCompany })
      const result = await fixture.service.getAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, VIEWER)
      return { result, calls: fixture.calls }
    }

    const allowed = await run(true)
    const denied = await run(false)

    for (const { result, calls } of [allowed, denied]) {
      assert.equal(result.status, 200)
      assert.deepEqual(argsOf(calls, 'hasShiftCoverageAccess'), [[ROLE_ID]])
      assert.deepEqual(
        argsOf(calls, 'resolveEmployeeRoleScope').map(([userId]) => userId),
        [USER_ID]
      )
    }
    assert.deepEqual(allowed.result.data?.branches, [BRANCH_REFS.a, BRANCH_REFS.b])
    assert.deepEqual(denied.result.data?.branches, [
      BRANCH_REFS.a,
      { ...BRANCH_REFS.b, empresaContratanteId: null, empresaContratanteName: null },
    ])
    assert.deepEqual(denied.result.data?.days, allowed.result.data?.days)
    assert.deepEqual(denied.result.data?.employees, allowed.result.data?.employees)
  })

  test('el validador exige fechas yyyy-MM-dd y no pide empresa contratante', async ({ assert }) => {
    const minimal = { startDay: START_DAY, endDay: END_DAY }
    const validated = await getAttendanceAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: [String(BRANCH_A), String(BRANCH_B)],
      payrollBusinessUnitId: 3,
    })
    assert.deepEqual(validated, { ...minimal, branchOfficeIds: [BRANCH_A, BRANCH_B], payrollBusinessUnitId: 3 })

    assert.isFalse(await validationFails(minimal))
    assert.deepEqual(await getAttendanceAbsencesValidator.validate({ ...minimal, empresaContratanteId: 7 }), minimal)
    assert.isTrue(await validationFails({ startDay: START_DAY }))
    assert.isTrue(await validationFails({ ...minimal, startDay: '2026-9-1' }))
    assert.isTrue(await validationFails({ ...minimal, branchOfficeIds: ['0'] }))
    assert.isTrue(await validationFails({ ...minimal, payrollBusinessUnitId: 1.5 }))
  })

  test('una fecha con formato válido pero inexistente falla con el campo en los mensajes (details)', async ({ assert }) => {
    const minimal = { startDay: START_DAY, endDay: END_DAY }
    const fieldsAndRules = (messages: ValidationMessage[]) =>
      messages.map(({ field, rule }) => ({ field, rule }))

    assert.deepEqual(fieldsAndRules(await validationMessages({ ...minimal, startDay: '2026-02-31' })), [
      { field: 'startDay', rule: 'existingIsoDay' },
    ])
    assert.deepEqual(fieldsAndRules(await validationMessages({ ...minimal, endDay: '2026-13-01' })), [
      { field: 'endDay', rule: 'existingIsoDay' },
    ])
    // Año bisiesto: el 29 de febrero sí existe.
    assert.deepEqual(
      await validationMessages({ ...minimal, startDay: '2024-02-29', endDay: '2024-03-01' }),
      []
    )
  })

  test('branchOfficeIds con una pieza que no es entero decimal de 1 a MAX_SAFE_INTEGER falla la validación en lugar de quitar el filtro', async ({ assert }) => {
    const minimal = { startDay: START_DAY, endDay: END_DAY }

    for (const blank of [undefined, null, '', '   ', []]) {
      assert.isUndefined(splitBranchOfficeIdsQuery(blank), `${JSON.stringify(blank)} no es un filtro`)
    }
    assert.deepEqual(splitBranchOfficeIdsQuery(' 5, 7 '), ['5', '7'])
    assert.deepEqual(splitBranchOfficeIdsQuery(['5', ' 7']), ['5', '7'])

    const filtered = await getAttendanceAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery('5, 7'),
    })
    assert.deepEqual(filtered.branchOfficeIds, [5, 7])
    const unfiltered = await getAttendanceAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery(''),
    })
    assert.isUndefined(unfiltered.branchOfficeIds)

    // El tope es Number.MAX_SAFE_INTEGER inclusive.
    const maxSafe = await getAttendanceAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery('9007199254740991'),
    })
    assert.deepEqual(maxSafe.branchOfficeIds, [Number.MAX_SAFE_INTEGER])

    // Por encima, Number() redondearía en silencio a otro entero: falla con su propia regla.
    const overflow = await validationMessages({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery('5,9007199254740993'),
    })
    assert.deepEqual(
      overflow.map(({ field, rule }) => ({ field, rule })),
      [{ field: 'branchOfficeIds.1', rule: 'maxSafeId' }]
    )

    // Un número crudo no pasa: el query siempre trae texto y la conversión la hace el validador.
    assert.isTrue(await validationFails({ ...minimal, branchOfficeIds: [5] }))

    // Number() aceptaría estas notaciones; el validador revisa el texto antes de convertir.
    const invalidTokens = [
      '0',
      'abc',
      '5,abc',
      '1.5',
      '5,',
      '-3',
      '0x10',
      '1e3',
      '0b11',
      '0o7',
      '+5',
      '5.0',
      '007',
      'Infinity',
      '9007199254740992',
      '9007199254740993',
    ]
    for (const invalid of invalidTokens) {
      const messages = await validationMessages({
        ...minimal,
        branchOfficeIds: splitBranchOfficeIdsQuery(invalid),
      })
      assert.isNotEmpty(messages, `branchOfficeIds=${invalid} debió fallar`)
      assert.isTrue(
        messages.every((message) => message.field.startsWith('branchOfficeIds')),
        `branchOfficeIds=${invalid} reporta otro campo`
      )
    }
  })

  test('censo: absences no exige permiso propio, valida estricto, responde detail en errores y no filtra el error crudo', ({ assert }) => {
    const controller = readFileSync(CONTROLLER_FILE, 'utf-8')
    const body = methodBody(controller, 'async absences(')

    // Sin permiso propio: nunca 403 por permiso. shift-coverage solo oculta la empresa, y eso lo decide el service.
    assert.notInclude(body, 'hasAccess(')
    assert.notInclude(body, 'hasShiftCoverageAccess(')
    assert.notInclude(body, "key: 'sin-permiso'")
    assert.include(body, 'roleId: user.roleId')
    const service = readFileSync(join(MODULE_DIR, 'attendance-stats.service.ts'), 'utf-8')
    assert.include(service, "import { hasShiftCoverageAccess } from './attendance-stats.permissions.js'")
    assert.include(service, 'hasShiftCoverageAccess: dependencies.hasShiftCoverageAccess ?? hasShiftCoverageAccess')
    assert.include(body, 'getAttendanceAbsencesValidator.validate(')
    // branchOfficeIds llega crudo al validador: el parseo permisivo lo convertiría en "sin filtro".
    assert.include(body, "splitBranchOfficeIdsQuery(request.input('branchOfficeIds'))")
    assert.notInclude(body, 'parseIdList(')
    assert.include(body, "key: 'entrada-invalida'")
    assert.include(body, 'details: messages')
    assert.include(body, '...(isError ? { detail: result.message } : {})')
    assert.include(body, 'logger.error(')
    assert.notInclude(body, 'error.message')

    // Los endpoints retirados ya no existen ni en el controller ni en las rutas:
    // /coverage/absences se fue antes y /coverage al quedarse sin consumidor.
    const routes = readFileSync(ROUTES_FILE, 'utf-8')
    assert.notInclude(controller, 'coverageAbsences')
    assert.include(routes, "router.get('/absences', '#modules/attendance-stats/attendance-stats.controller.absences')")
    assert.notInclude(routes, '/coverage')
    assert.notInclude(controller, 'async coverage(')
  })

  test('censo: universo y préstamos con corte de tenant, cancelación, filtro opcional y orden determinista', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    const loans = methodBody(content, 'async getLoansForRange(')
    const universe = methodBody(content, 'async getAbsencesEmployeeIds(')

    assert.include(loans, "whereIn('source_bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(loans, "whereIn('target_bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(loans, "whereIn('e.business_unit_id', allowedBusinessUnitIds)")
    assert.include(loans, "whereNull('eta.employee_temporary_assignment_deleted_at')")
    assert.include(loans, "orWhere('eta.cancelled_at', '>', startDay)")
    assert.include(loans, "orderBy('eta.start_date', 'desc')")
    assert.include(loans, "orderBy('eta.employee_temporary_assignment_id', 'desc')")

    assert.include(universe, "whereIn('e.business_unit_id', allowedBusinessUnitIds)")
    assert.include(universe, "whereNull('e.employee_deleted_at')")
    assert.include(universe, 'COALESCE(e.employee_assist_discriminator, 0) <> 1')
    assert.include(universe, 'if (uniqueBranchIds.length > 0)')
    assert.include(universe, "where('ebo.employee_branch_office_active', 1)")
    assert.include(universe, "whereIn('ebo.branch_office_id', uniqueBranchIds)")
    assert.include(universe, "whereIn('eta.target_branch_id', uniqueBranchIds)")
    // Sin join a sucursales: una fila por colaborador aunque tenga varias bases activas.
    assert.notInclude(universe, 'leftJoin(')
    assert.notInclude(universe, 'innerJoin(\'employee_branch_offices')
  })

  test('censo: el catálogo de sucursales corta por tenant, excluye borradas y delega la empresa en toAbsencesBranch', ({ assert }) => {
    const branches = methodBody(readFileSync(REPO_FILE, 'utf-8'), 'async getAbsencesBranches(')

    assert.include(branches, "whereIn('bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(branches, "whereNull('bo.branch_office_deleted_at')")
    assert.include(branches, "leftJoin('empresas_contratantes AS ec', 'ec.empresa_contratante_id', 'bo.empresa_contratante_id')")
    assert.include(branches, 'toAbsencesBranch(')
  })

  test('censo: el calendario ordena por nombre, desempata por colaborador y sucursal base y lee los alias', ({ assert }) => {
    const scope = methodBody(readFileSync(REPO_FILE, 'utf-8'), 'private async resolveEmployeesInScope(')
    const positions = [
      "orderBy('e.employee_first_name', 'asc')",
      "orderBy('e.employee_last_name', 'asc')",
      "orderBy('e.employee_id', 'asc')",
      "orderBy('bo.branch_office_id', 'asc')",
    ].map((clause) => scope.indexOf(clause))

    assert.notInclude(positions, -1)
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions
    )
    assert.include(scope, "'d.department_alias AS department_alias'")
    assert.include(scope, "'p.position_alias AS position_alias'")

    // Aislamiento por empresa del join de sucursal base. Venía del spec de
    // cobertura, que se retiró con su endpoint: el método sigue vivo y alimenta
    // ausencias, así que la guarda se rescata aquí. Sin el `andOnIn`, la
    // sucursal base de otra empresa entraría como sucursal efectiva; el alias
    // debe salir de `bo` (acotado) y nunca de `ebo` (sin acotar).
    assert.include(scope, "andOnIn('bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(scope, "'bo.branch_office_id AS branch_office_id'")
    assert.notInclude(scope, "'ebo.branch_office_id AS branch_office_id'")
    assert.include(scope, "whereIn('ebo.branch_office_id', branchOfficeIds)")
  })

  test('las consultas de universo, préstamos y catálogo no devuelven nada sin unidades de negocio o sin ids', async ({ assert }) => {
    const repo = new AttendanceStatsRepositoryMysql({} as unknown as I18n)

    assert.deepEqual(await repo.getAbsencesEmployeeIds(START_DAY, END_DAY, []), [])
    assert.deepEqual(await repo.getAbsencesEmployeeIds(START_DAY, END_DAY, [], [BRANCH_A]), [])
    assert.deepEqual(await repo.getLoansForRange([], START_DAY, END_DAY, [1]), [])
    assert.deepEqual(await repo.getLoansForRange([1], START_DAY, END_DAY, []), [])
    assert.deepEqual(await repo.getAbsencesBranches([], [1]), [])
    assert.deepEqual(await repo.getAbsencesBranches([BRANCH_A], []), [])
    // Rescatado del spec de cobertura retirado: el método sigue vivo y ausencias
    // lo alcanza por `resolveVisibleEmployeeIds`. Sin unidades de negocio no
    // puede devolver colaboradores de nadie.
    assert.deepEqual(await repo.getEmployeeIdsInResponsibleScope(1, [1], []), [])
  })

  test('censo: las reglas de día y el motor de ausencias son módulos puros, sin ciclo con el service ni el repositorio', ({ assert }) => {
    const absences = readFileSync(ABSENCES_FILE, 'utf-8')
    const rules = readFileSync(RULES_FILE, 'utf-8')

    assert.include(absences, "from './attendance-stats.rules.js'")
    for (const [name, content] of [
      ['absences', absences],
      ['rules', rules],
    ]) {
      assert.notInclude(content, 'attendance-stats.service', `${name} no debe importar el service`)
      for (const dependency of ['@adonisjs/lucid', '#models/', 'repository', 'helpers/']) {
        assert.notInclude(content, dependency, `${name} no debe depender de ${dependency}`)
      }
    }
  })
})

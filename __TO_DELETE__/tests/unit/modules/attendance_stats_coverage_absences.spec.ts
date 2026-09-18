import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import {
  buildCoverageAbsencesResponse,
  countRangeDaysInclusive,
  COVERAGE_ABSENCES_MAX_RANGE_DAYS,
  selectLoanForDay,
} from '../../../app/modules/attendance-stats/attendance-stats.coverage-absences.js'
import type { BuildCoverageAbsencesInput } from '../../../app/modules/attendance-stats/attendance-stats.coverage-absences.js'
import AttendanceStatsService from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import type { AttendanceStatsServiceDependencies } from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import {
  aggregateCalendar,
  toStatistics,
} from '../../../app/modules/attendance-stats/attendance-stats.rules.js'
import AttendanceStatsRepositoryMysql from '../../../app/modules/attendance-stats/attendance-stats.repository.mysql.js'
import {
  getAttendanceCoverageAbsencesValidator,
  splitBranchOfficeIdsQuery,
} from '../../../app/modules/attendance-stats/validators/get-attendance-coverage-absences.validator.js'
import type { AttendanceStatsRepository } from '../../../app/modules/attendance-stats/attendance-stats.repository.js'
import type { EmployeeRoleScope } from '../../../app/helpers/resolve_employee_role_scope.js'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import type { ShiftExceptionInterface } from '../../../app/interfaces/shift_exception_interface.js'
import type {
  CoverageAbsencesFilters,
  CoverageAbsencesResponse,
  CoverageRangeLoanRow,
  CoverageSiteRef,
  EmployeeCalendarBundle,
} from '../../../app/modules/attendance-stats/dto/attendance-stats.dto.js'

/**
 * Faltas por sitio REPSE: el drawer de cobertura lista, día por día, a quienes
 * faltaron estando asignados (sucursal efectiva, con préstamos) a un sitio de la
 * empresa contratante. Las reglas corren sobre calendarios en memoria y el
 * orquestador con dobles del repositorio y de sus dependencias, sin BD; el
 * permiso del controller, el SQL y el grafo de imports se revisan por censo.
 */
const MODULE_DIR = join(process.cwd(), 'app/modules/attendance-stats')
const CONTROLLER_FILE = join(MODULE_DIR, 'attendance-stats.controller.ts')
const REPO_FILE = join(MODULE_DIR, 'attendance-stats.repository.mysql.ts')
const COVERAGE_FILE = join(MODULE_DIR, 'attendance-stats.coverage.ts')
const COVERAGE_ABSENCES_FILE = join(MODULE_DIR, 'attendance-stats.coverage-absences.ts')
const RULES_FILE = join(MODULE_DIR, 'attendance-stats.rules.ts')
const ROUTES_FILE = join(process.cwd(), 'start/routes/attendance_stats_routes.ts')

const I18N_STUB = { formatMessage: (key: string) => key } as unknown as I18n
const THRESHOLDS = { delayMinutes: 10, faultMinutes: 30 }
const START_DAY = '2026-09-01'
const END_DAY = '2026-09-05'
const PERIOD_DAYS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']

/** Sitios de la empresa contratante; OUTSIDE_SITE es una sucursal que no es de ella. */
const SITE_A = 10
const SITE_B = 20
const OUTSIDE_SITE = 99
/** Sitios tal como los entrega el repositorio (sin el orden por nombre de la respuesta). */
const SITE_REFS: CoverageSiteRef[] = [
  { branchOfficeId: SITE_B, branchOfficeName: 'Bodega Sur' },
  { branchOfficeId: SITE_A, branchOfficeName: 'Almacén Norte' },
]

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

function buildBundle(params: {
  employeeId: number
  firstName: string
  homeBranchId: number | null
  calendar: AssistDayInterface[]
  departmentId?: number
}): EmployeeCalendarBundle {
  return {
    employee: {
      employeeId: params.employeeId,
      employeeCode: null,
      employeePayrollCode: null,
      employeeFirstName: params.firstName,
      employeeLastName: 'Prueba',
      employeeSecondLastName: null,
      employeePhoto: null,
      departmentId: params.departmentId ?? 1,
      positionId: null,
      businessUnitId: 1,
      payrollBusinessUnitId: 1,
      branchOfficeId: params.homeBranchId,
      branchOfficeName: null,
      department: null,
      position: null,
      businessUnit: null,
    },
    departmentName: null,
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
    sourceBranchId: SITE_A,
    targetBranchId: params.targetBranchId,
    startDate: params.startDate,
    endDate: params.endDate,
    cancelledAt: params.cancelledAt ?? null,
  }
}

/** Periodo del 1 al 5 de septiembre, dos sitios y todos los colaboradores visibles salvo que se indique. */
function build(
  input: Partial<BuildCoverageAbsencesInput> & Pick<BuildCoverageAbsencesInput, 'bundles'>
): CoverageAbsencesResponse {
  return buildCoverageAbsencesResponse({
    startDay: START_DAY,
    endDay: END_DAY,
    sites: SITE_REFS,
    loans: [],
    visibleEmployeeIds: new Set(input.bundles.map((bundle) => bundle.employee.employeeId)),
    thresholds: THRESHOLDS,
    ...input,
  })
}

/** Sitio en el que aparece el colaborador cada día del periodo, o null si ese día no aparece. */
function siteByDay(response: CoverageAbsencesResponse, employeeId: number): Array<number | null> {
  return response.days.map(
    (day) => day.sites.find((site) => site.employeeIds.includes(employeeId))?.branchOfficeId ?? null
  )
}

async function validationFails(payload: Record<string, unknown>): Promise<boolean> {
  try {
    await getAttendanceCoverageAbsencesValidator.validate(payload)
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
    await getAttendanceCoverageAbsencesValidator.validate(payload)
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
    getSitesByCompany: fail('getSitesByCompany'),
    getShiftQuotasByBranchIds: fail('getShiftQuotasByBranchIds'),
    getActiveLoansForDay: fail('getActiveLoansForDay'),
    getCoverageAbsencesEmployeeIds: fail('getCoverageAbsencesEmployeeIds'),
    getLoansForRange: fail('getLoansForRange'),
    getBranchOfficeNamesByIds: fail('getBranchOfficeNamesByIds'),
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
const ORCHESTRATOR_FILTERS: CoverageAbsencesFilters = {
  startDay: START_DAY,
  endDay: END_DAY,
  empresaContratanteId: 7,
  branchOfficeIds: [SITE_A, SITE_B],
  payrollBusinessUnitId: 3,
}
const ORCHESTRATOR_SCOPE = { allowedBusinessUnitIds: [4, 5] }
const USER_ID = 30

/**
 * Service con dobles: el repositorio entrega `SITE_REFS`, el universo y los
 * calendarios indicados, sin préstamos; las dependencias validan la empresa,
 * resuelven el alcance y las tolerancias sin BD. Cada doble registra sus
 * argumentos; las consultas que el caso no prepara fallan como en `failingRepo`.
 */
function orchestrator(params: {
  universe: number[]
  bundles?: EmployeeCalendarBundle[]
  roleScope?: EmployeeRoleScope | null
  responsibleIds?: number[]
}): { service: AttendanceStatsService; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const answer =
    <T>(name: string, value: T) =>
    async (...args: unknown[]): Promise<T> => {
      calls.push({ name, args })
      return value
    }
  const noLoans: CoverageRangeLoanRow[] = []
  const repo: AttendanceStatsRepository = {
    ...failingRepo([]),
    getSitesByCompany: answer('getSitesByCompany', SITE_REFS),
    getCoverageAbsencesEmployeeIds: answer('getCoverageAbsencesEmployeeIds', params.universe),
    getEmployeeCalendars: answer('getEmployeeCalendars', params.bundles ?? []),
    getLoansForRange: answer('getLoansForRange', noLoans),
    getEmployeeIdsInResponsibleScope: answer(
      'getEmployeeIdsInResponsibleScope',
      params.responsibleIds ?? []
    ),
  }
  const dependencies: AttendanceStatsServiceDependencies = {
    findEmpresaContratanteInTenantOrFail: answer('findEmpresaContratanteInTenantOrFail', null),
    resolveEmployeeRoleScope: answer(
      'resolveEmployeeRoleScope',
      params.roleScope === undefined ? FULL_ROLE_SCOPE : params.roleScope
    ),
    loadToleranceThresholds: answer('loadToleranceThresholds', THRESHOLDS),
  }
  return { service: new AttendanceStatsService(I18N_STUB, repo, dependencies), calls }
}

test.group('Attendance-stats — faltas por sitio REPSE con sucursal efectiva y alcance', () => {
  test('atribuye cada día a la sucursal efectiva cuando un préstamo cambia de sitio a mitad del rango', ({ assert }) => {
    const allFaults = PERIOD_DAYS.map((day) => faultOn(day))
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_A, calendar: allFaults }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_A, calendar: allFaults }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: SITE_B, startDate: '2026-09-03', endDate: '2026-09-04' }),
        // Prestado fuera de la empresa: deja de contar en sus sitios.
        buildLoan({ assignmentId: 2, employeeId: 2, targetBranchId: OUTSIDE_SITE, startDate: '2026-09-02', endDate: '2026-09-10' }),
      ],
    })

    assert.deepEqual(siteByDay(response, 1), [SITE_A, SITE_A, SITE_B, SITE_B, SITE_A])
    assert.deepEqual(siteByDay(response, 2), [SITE_A, null, null, null, null])
  })

  test('un préstamo cancelado deja de mover al colaborador desde cancelled_at', ({ assert }) => {
    const allFaults = PERIOD_DAYS.map((day) => faultOn(day))
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_A, calendar: allFaults }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_A, calendar: allFaults }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: SITE_B, startDate: START_DAY, endDate: END_DAY, cancelledAt: '2026-09-03' }),
        // Cancelado el mismo día en que iniciaba: nunca movió al colaborador.
        buildLoan({ assignmentId: 2, employeeId: 2, targetBranchId: SITE_B, startDate: START_DAY, endDate: END_DAY, cancelledAt: START_DAY }),
      ],
    })

    assert.deepEqual(siteByDay(response, 1), [SITE_B, SITE_B, SITE_A, SITE_A, SITE_A])
    assert.deepEqual(siteByDay(response, 2), [SITE_A, SITE_A, SITE_A, SITE_A, SITE_A])
  })

  test('con dos préstamos vigentes gana el de inicio más reciente y, empatando, el de id mayor', ({ assert }) => {
    const loans = [
      buildLoan({ assignmentId: 7, employeeId: 1, targetBranchId: SITE_A, startDate: '2026-09-01', endDate: '2026-09-05' }),
      buildLoan({ assignmentId: 3, employeeId: 1, targetBranchId: SITE_B, startDate: '2026-09-03', endDate: '2026-09-05' }),
      buildLoan({ assignmentId: 9, employeeId: 1, targetBranchId: OUTSIDE_SITE, startDate: '2026-09-03', endDate: '2026-09-04' }),
    ]
    const reversed = [...loans].reverse()

    const chosen = PERIOD_DAYS.map((day) => selectLoanForDay(loans, day)?.assignmentId)
    assert.deepEqual(chosen, [7, 7, 9, 9, 3])
    assert.deepEqual(
      PERIOD_DAYS.map((day) => selectLoanForDay(reversed, day)?.assignmentId),
      chosen
    )

    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: null, calendar: PERIOD_DAYS.map((day) => faultOn(day)) }),
    ]
    assert.deepEqual(siteByDay(build({ bundles, loans }), 1), [SITE_A, SITE_A, null, null, SITE_B])
    assert.deepEqual(siteByDay(build({ bundles, loans: reversed }), 1), [SITE_A, SITE_A, null, null, SITE_B])
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
          homeBranchId: SITE_A,
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
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_A, calendar: [faultOn('2026-09-01')] }),
      ],
    })

    assert.deepEqual(
      response.days.map((day) => day.faults),
      [1, 0, 0, 0, 0, 0]
    )
    assert.deepEqual(siteByDay(response, 1), [null, null, null, null, null, null])
    assert.deepEqual(
      response.employees.map((row) => row.employee.employeeId),
      [2]
    )
  })

  test('solo cuenta el día en que classifyDay registra exactamente una falta', ({ assert }) => {
    const response = build({
      bundles: [
        buildBundle({
          employeeId: 1,
          firstName: 'Ana',
          homeBranchId: SITE_A,
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

    assert.deepEqual(
      response.days.map((day) => day.faults),
      [0, 0, 0, 0, 1]
    )
  })

  test('recorta por visibles antes de contar y faults cuadra con employeeIds', ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Carla', homeBranchId: SITE_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Ana', homeBranchId: SITE_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 3, firstName: 'Beto', homeBranchId: SITE_A, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 4, firstName: 'Diana', homeBranchId: SITE_B, calendar: [faultOn('2026-09-01'), faultOn('2026-09-02')] }),
    ]

    const response = build({ bundles, visibleEmployeeIds: new Set([1, 2, 4]) })

    assert.deepEqual(response.days[0], {
      day: '2026-09-01',
      faults: 3,
      // Almacén Norte antes que Bodega Sur; Ana antes que Carla.
      sites: [
        { branchOfficeId: SITE_A, employeeIds: [2, 1] },
        { branchOfficeId: SITE_B, employeeIds: [4] },
      ],
    })
    for (const day of response.days) {
      const listed = day.sites.reduce((total, site) => total + site.employeeIds.length, 0)
      assert.equal(day.faults, listed, `el día ${day.day} no cuadra con sus listas`)
    }
    assert.deepEqual(
      response.employees.map((row) => row.employee.employeeId),
      [2, 1, 4]
    )

    const nobody = build({ bundles, visibleEmployeeIds: new Set() })
    assert.deepEqual(
      nobody.days.map((day) => day.faults),
      [0, 0, 0, 0, 0]
    )
    assert.lengthOf(nobody.employees, 0)
  })

  test('days trae todos los días del periodo en orden aunque no haya faltas', ({ assert }) => {
    const response = build({ startDay: '2026-08-28', endDay: '2026-09-03', bundles: [] })

    assert.deepEqual(response.period, { startDay: '2026-08-28', endDay: '2026-09-03' })
    assert.deepEqual(response.sites, [
      { branchOfficeId: SITE_A, name: 'Almacén Norte' },
      { branchOfficeId: SITE_B, name: 'Bodega Sur' },
    ])
    assert.deepEqual(response.days, [
      { day: '2026-08-28', faults: 0, sites: [] },
      { day: '2026-08-29', faults: 0, sites: [] },
      { day: '2026-08-30', faults: 0, sites: [] },
      { day: '2026-08-31', faults: 0, sites: [] },
      { day: '2026-09-01', faults: 0, sites: [] },
      { day: '2026-09-02', faults: 0, sites: [] },
      { day: '2026-09-03', faults: 0, sites: [] },
    ])
    assert.lengthOf(response.employees, 0)
  })

  test('employees lista una vez a cada colaborador con las estadísticas de todo el periodo', ({ assert }) => {
    const calendar = [
      faultOn('2026-09-01'),
      buildDay('2026-09-02', { checkInStatus: 'ontime' }),
      faultOn('2026-09-03'),
      buildDay('2026-09-04', { checkInStatus: 'tolerance' }),
      faultOn('2026-09-05'),
    ]
    const response = build({
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_A, calendar }),
        // Duplicado de una segunda sucursal base activa: cuenta una sola vez.
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_B, calendar }),
      ],
      loans: [
        buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: SITE_B, startDate: '2026-09-03', endDate: '2026-09-03' }),
        buildLoan({ assignmentId: 2, employeeId: 1, targetBranchId: OUTSIDE_SITE, startDate: '2026-09-05', endDate: '2026-09-05' }),
      ],
    })

    assert.deepEqual(siteByDay(response, 1), [SITE_A, null, SITE_B, null, null])
    assert.deepEqual(
      response.days.map((day) => day.faults),
      [1, 0, 1, 0, 0]
    )
    assert.lengthOf(response.employees, 1)

    const { clean, informational } = aggregateCalendar(calendar, THRESHOLDS)
    const [row] = response.employees
    assert.deepEqual(row.statistics, toStatistics(clean, informational))
    // Incluye la falta del día prestado fuera de la empresa: son las del periodo, no las del sitio.
    assert.include(row.statistics, { faults: 3, assists: 1, tolerances: 1, totalAvailable: 5 })
  })

  test('con varias sucursales base activas atribuye a la que está entre los sitios aunque llegue después', ({ assert }) => {
    const allFaults = PERIOD_DAYS.map((day) => faultOn(day))
    const bundles = [
      // La fila fuera de los sitios llega primero.
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: OUTSIDE_SITE, calendar: allFaults }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_B, calendar: allFaults }),
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: OUTSIDE_SITE, calendar: allFaults }),
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_B, calendar: allFaults }),
      // Dos bases entre los sitios: gana la de branchOfficeId menor.
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_A, calendar: allFaults }),
      // Ninguna base entre los sitios: sin préstamo no cae en ninguno.
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: 98, calendar: allFaults }),
    ]
    // El préstamo sigue mandando sobre la base elegida.
    const loans = [
      buildLoan({ assignmentId: 1, employeeId: 1, targetBranchId: SITE_A, startDate: '2026-09-03', endDate: '2026-09-03' }),
    ]

    const response = build({ bundles, loans })

    assert.deepEqual(siteByDay(response, 1), [SITE_B, SITE_B, SITE_A, SITE_B, SITE_B])
    assert.deepEqual(siteByDay(response, 2), [SITE_A, SITE_A, SITE_A, SITE_A, SITE_A])
    assert.deepEqual(siteByDay(response, 3), [null, null, null, null, null])
    assert.deepEqual(
      response.days.map((day) => day.faults),
      [2, 2, 2, 2, 2]
    )
    // La fila listada es la de la base atribuida.
    assert.deepEqual(
      response.employees.map((row) => [row.employee.employeeId, row.employee.branchOfficeId]),
      [
        [1, SITE_B],
        [2, SITE_A],
      ]
    )
    // Mismo resultado sin importar el orden en que lleguen las filas.
    assert.deepEqual(build({ bundles: [...bundles].reverse(), loans }), response)
  })

  test('el tope es de 62 días inclusive y una fecha inexistente no da conteo', ({ assert }) => {
    assert.equal(COVERAGE_ABSENCES_MAX_RANGE_DAYS, 62)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-09-01'), 1)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-11-01'), 62)
    assert.equal(countRangeDaysInclusive('2026-09-01', '2026-11-02'), 63)
    assert.isNull(countRangeDaysInclusive('2026-02-31', '2026-03-01'))
  })

  test('el service valida el periodo antes de tocar la BD', async ({ assert }) => {
    const calls: string[] = []
    const service = new AttendanceStatsService(I18N_STUB, failingRepo(calls))
    const scope = { allowedBusinessUnitIds: [1] }
    const request = (startDay: string, endDay: string): CoverageAbsencesFilters => ({
      startDay,
      endDay,
      empresaContratanteId: 7,
    })

    const exceeded = await service.getCoverageAbsences(request('2026-09-01', '2026-11-02'), scope, 1)
    assert.include(exceeded, {
      status: 400,
      key: 'rango-maximo-excedido',
      title: 'attendance_stats_coverage_absences_range_exceeded_title',
    })

    const inverted = await service.getCoverageAbsences(request('2026-09-05', '2026-09-01'), scope, 1)
    assert.include(inverted, { status: 400, key: 'rango-invalido' })

    const nonexistent = await service.getCoverageAbsences(request('2026-02-31', '2026-03-01'), scope, 1)
    assert.include(nonexistent, { status: 400, key: 'entrada-invalida' })

    // 62 días pasa el tope y sigue a la empresa contratante: sin tenant activo responde 404 sin consultar.
    const atLimit = await service.getCoverageAbsences(request('2026-09-01', '2026-11-01'), scope, 1)
    assert.include(atLimit, { status: 404, key: 'empresa-contratante-no-encontrada' })

    assert.deepEqual(calls, [])
  })

  test('orquestador: con universo vacío no calcula calendarios, préstamos, tolerancias ni alcance', async ({ assert }) => {
    const { service, calls } = orchestrator({ universe: [] })

    const result = await service.getCoverageAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, USER_ID)

    assert.equal(result.status, 200)
    assert.deepEqual(
      calls.map((call) => call.name),
      ['findEmpresaContratanteInTenantOrFail', 'getSitesByCompany', 'getCoverageAbsencesEmployeeIds']
    )
    assert.deepEqual(
      result.data?.sites.map((site) => site.branchOfficeId),
      [SITE_A, SITE_B]
    )
    assert.deepEqual(
      result.data?.days.map((day) => day.faults),
      [0, 0, 0, 0, 0]
    )
    assert.deepEqual(result.data?.employees, [])
  })

  test('orquestador: calcula calendarios y préstamos solo del universo, con la unidad de nómina', async ({ assert }) => {
    const { service, calls } = orchestrator({
      universe: [1, 2],
      bundles: [
        buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_A, calendar: [faultOn('2026-09-01')] }),
        buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_B, calendar: [faultOn('2026-09-02')] }),
      ],
    })

    const result = await service.getCoverageAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, USER_ID)

    assert.equal(result.status, 200)
    assert.deepEqual(argsOf(calls, 'findEmpresaContratanteInTenantOrFail'), [
      [7, 'empresa-contratante-no-encontrada'],
    ])
    assert.deepEqual(argsOf(calls, 'getSitesByCompany'), [[7, [4, 5], [SITE_A, SITE_B]]])
    assert.deepEqual(argsOf(calls, 'getCoverageAbsencesEmployeeIds'), [
      [[SITE_B, SITE_A], START_DAY, END_DAY, [4, 5]],
    ])
    assert.deepEqual(argsOf(calls, 'getEmployeeCalendars'), [
      [{ startDay: START_DAY, endDay: END_DAY, employeeIds: [1, 2], payrollBusinessUnitId: 3 }, [4, 5]],
    ])
    assert.deepEqual(argsOf(calls, 'getLoansForRange'), [[[1, 2], START_DAY, END_DAY, [4, 5]]])
    assert.lengthOf(argsOf(calls, 'loadToleranceThresholds'), 1)
    assert.deepEqual(
      result.data?.days.map((day) => day.faults),
      [1, 1, 0, 0, 0]
    )
  })

  test('orquestador: recorta a los visibles del usuario antes de contar', async ({ assert }) => {
    const bundles = [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_A, departmentId: 9, calendar: [faultOn('2026-09-01')] }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_A, departmentId: 8, calendar: [faultOn('2026-09-01')] }),
    ]
    const run = (roleScope: EmployeeRoleScope | null, responsibleIds?: number[]) => {
      const fixture = orchestrator({ universe: [1, 2], bundles, roleScope, responsibleIds })
      return fixture.service
        .getCoverageAbsences(ORCHESTRATOR_FILTERS, ORCHESTRATOR_SCOPE, USER_ID)
        .then((result) => ({ result, calls: fixture.calls }))
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
      faults: 1,
      sites: [{ branchOfficeId: SITE_A, employeeIds: [2] }],
    })
    assert.deepEqual(
      responsible.result.data?.employees.map((row) => row.employee.employeeId),
      [2]
    )

    // Con acceso completo: los de sus departamentos visibles.
    const byDepartment = await run({ departmentsList: [9], userResponsibleId: null })
    assert.deepEqual(byDepartment.result.data?.days[0], {
      day: START_DAY,
      faults: 1,
      sites: [{ branchOfficeId: SITE_A, employeeIds: [1] }],
    })

    // Usuario inexistente: nadie (fail-closed).
    const nobody = await run(null)
    assert.deepEqual(
      nobody.result.data?.days.map((day) => day.faults),
      [0, 0, 0, 0, 0]
    )
    assert.deepEqual(nobody.result.data?.employees, [])
  })

  test('el validador exige empresaContratanteId entero y fechas yyyy-MM-dd', async ({ assert }) => {
    const validated = await getAttendanceCoverageAbsencesValidator.validate({
      startDay: START_DAY,
      endDay: END_DAY,
      empresaContratanteId: 7,
      branchOfficeIds: [SITE_A, SITE_B],
      payrollBusinessUnitId: 3,
    })
    assert.deepEqual(validated, {
      startDay: START_DAY,
      endDay: END_DAY,
      empresaContratanteId: 7,
      branchOfficeIds: [SITE_A, SITE_B],
      payrollBusinessUnitId: 3,
    })

    const minimal = { startDay: START_DAY, endDay: END_DAY, empresaContratanteId: 7 }
    assert.isFalse(await validationFails(minimal))
    assert.isTrue(await validationFails({ startDay: START_DAY, endDay: END_DAY }))
    assert.isTrue(await validationFails({ ...minimal, empresaContratanteId: 1.5 }))
    assert.isTrue(await validationFails({ ...minimal, startDay: '2026-9-1' }))
    assert.isTrue(await validationFails({ ...minimal, branchOfficeIds: [0] }))
  })

  test('una fecha con formato válido pero inexistente falla con el campo en los mensajes (details)', async ({ assert }) => {
    const minimal = { startDay: START_DAY, endDay: END_DAY, empresaContratanteId: 7 }
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

  test('branchOfficeIds con una pieza que no es entero >= 1 falla la validación en lugar de quitar el filtro', async ({ assert }) => {
    const minimal = { startDay: START_DAY, endDay: END_DAY, empresaContratanteId: 7 }

    for (const blank of [undefined, null, '', '   ', []]) {
      assert.isUndefined(splitBranchOfficeIdsQuery(blank), `${JSON.stringify(blank)} no es un filtro`)
    }
    assert.deepEqual(splitBranchOfficeIdsQuery(' 5, 7 '), ['5', '7'])
    assert.deepEqual(splitBranchOfficeIdsQuery(['5', ' 7']), ['5', '7'])

    const filtered = await getAttendanceCoverageAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery('5, 7'),
    })
    assert.deepEqual(filtered.branchOfficeIds, [5, 7])
    const unfiltered = await getAttendanceCoverageAbsencesValidator.validate({
      ...minimal,
      branchOfficeIds: splitBranchOfficeIdsQuery(''),
    })
    assert.isUndefined(unfiltered.branchOfficeIds)

    for (const invalid of ['0', 'abc', '5,abc', '1.5', '5,', '-3']) {
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

  test('censo: coverageAbsences exige shift-coverage antes de validar y no filtra el error crudo', ({ assert }) => {
    const body = methodBody(readFileSync(CONTROLLER_FILE, 'utf-8'), 'async coverageAbsences(')

    assert.include(body, 'SHIFT_COVERAGE_PERMISSION_SLUG')
    assert.include(body, "key: 'sin-permiso'")
    assert.isAbove(body.indexOf('hasAccess('), -1)
    assert.isBelow(
      body.indexOf('hasAccess('),
      body.indexOf('getAttendanceCoverageAbsencesValidator.validate(')
    )
    assert.include(body, 'logger.error(')
    assert.notInclude(body, 'error.message')
    // branchOfficeIds llega crudo al validador: el parseo permisivo lo convertiría en "sin filtro".
    assert.include(body, "splitBranchOfficeIdsQuery(request.input('branchOfficeIds'))")
    assert.notInclude(body, 'parseIdList(')
    assert.include(
      readFileSync(ROUTES_FILE, 'utf-8'),
      "'#modules/attendance-stats/attendance-stats.controller.coverageAbsences'"
    )
  })

  test('censo: préstamos del rango y universo con corte de tenant, cancelación y orden determinista', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    const loans = methodBody(content, 'async getLoansForRange(')
    const universe = methodBody(content, 'async getCoverageAbsencesEmployeeIds(')

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
    assert.include(universe, "where('ebo.employee_branch_office_active', 1)")
    assert.include(universe, "whereIn('eta.target_branch_id', uniqueSiteIds)")
  })

  test('censo: el calendario ordena por nombre y desempata por colaborador y sucursal base', ({ assert }) => {
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
  })

  test('las consultas de universo y préstamos no devuelven nada sin sitios, colaboradores o unidades de negocio', async ({ assert }) => {
    const repo = new AttendanceStatsRepositoryMysql({} as unknown as I18n)

    assert.deepEqual(await repo.getCoverageAbsencesEmployeeIds([], START_DAY, END_DAY, [1]), [])
    assert.deepEqual(await repo.getCoverageAbsencesEmployeeIds([SITE_A], START_DAY, END_DAY, []), [])
    assert.deepEqual(await repo.getLoansForRange([], START_DAY, END_DAY, [1]), [])
    assert.deepEqual(await repo.getLoansForRange([1], START_DAY, END_DAY, []), [])
  })

  test('censo: las reglas de día viven en un módulo puro, sin ciclo con el service', ({ assert }) => {
    const coverage = readFileSync(COVERAGE_FILE, 'utf-8')
    const absences = readFileSync(COVERAGE_ABSENCES_FILE, 'utf-8')
    const rules = readFileSync(RULES_FILE, 'utf-8')

    assert.notInclude(coverage, 'coverageIsEvaluableDay')
    assert.include(coverage, "import { isEvaluableDay } from './attendance-stats.rules.js'")
    assert.include(absences, "from './attendance-stats.rules.js'")
    for (const [name, content] of [
      ['coverage', coverage],
      ['coverage-absences', absences],
      ['rules', rules],
    ]) {
      assert.notInclude(content, 'attendance-stats.service', `${name} no debe importar el service`)
    }
    for (const dependency of ['@adonisjs/lucid', '#models/', 'repository', 'helpers/']) {
      assert.notInclude(rules, dependency, `las reglas no deben depender de ${dependency}`)
    }
  })
})

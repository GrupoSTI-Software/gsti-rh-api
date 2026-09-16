import { DateTime } from 'luxon'
import { classifyDay, enumerateDays, isEvaluableDay } from './attendance-stats.rules.js'
import type {
  AbsencesBranch,
  AbsencesBranchRow,
  AbsencesDay,
  AbsencesEmployee,
  AbsencesResponse,
  CoverageActiveLoanRow,
  CoverageRangeLoanRow,
  EmployeeCalendarBundle,
  EmployeeInfo,
  ToleranceThresholds,
} from './dto/attendance-stats.dto.js'

/**
 * Tope de días (inclusive) del periodo de ausencias. Cubre dos meses
 * calendario; el calendario SQL crece con colaboradores por días.
 */
export const ABSENCES_MAX_RANGE_DAYS = 62

/** Nombre completo del colaborador (nombre y apellidos presentes, separados por espacio). */
export function buildEmployeeDisplayName(employee: EmployeeInfo): string {
  return [employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName]
    .filter((part) => part && part.trim().length > 0)
    .join(' ')
    .trim()
}

/**
 * Sucursal efectiva del colaborador dado el préstamo que lo mueve ese día: el
 * destino del préstamo o, sin préstamo, su sucursal base. Solo resuelve la
 * sucursal; elegir el préstamo cuando hay varios vigentes le toca al llamador
 * (`selectLoanForDay`, que se queda con el de start_date más reciente y,
 * empatando, con el de id mayor).
 *
 * Vivía en el motor de cobertura; al retirarse ese endpoint se mudó aquí, que
 * es su único consumidor, para no dejar un módulo suelto solo por dos funciones.
 */
export function resolveEffectiveBranchId(
  homeBranchId: number | null | undefined,
  loan: CoverageActiveLoanRow | undefined
): number | null {
  if (loan) return loan.targetBranchId
  return homeBranchId ?? null
}

/**
 * Días del rango [startDay, endDay] contando ambos extremos. Devuelve `null`
 * si alguna fecha no existe en el calendario (por ejemplo 2026-02-31). Con
 * `startDay` posterior a `endDay` el resultado es cero o negativo.
 */
export function countRangeDaysInclusive(startDay: string, endDay: string): number | null {
  const start = DateTime.fromISO(startDay, { zone: 'utc' })
  const end = DateTime.fromISO(endDay, { zone: 'utc' })
  if (!start.isValid || !end.isValid) return null
  return Math.round(end.diff(start, 'days').days) + 1
}

/**
 * Préstamo que mueve al colaborador el día `day`: vigente ese día
 * (start_date <= día <= end_date) y sin cancelar a esa fecha (cancelled_at nulo
 * o posterior al día, el mismo criterio con el que `getLoansForRange` los trae).
 * Con varios vigentes gana el de start_date más reciente y, empatando, el de id
 * mayor, sin importar el orden de entrada.
 */
export function selectLoanForDay(
  loans: readonly CoverageRangeLoanRow[],
  day: string
): CoverageRangeLoanRow | undefined {
  let selected: CoverageRangeLoanRow | undefined
  for (const loan of loans) {
    if (loan.startDate > day || loan.endDate < day) continue
    if (loan.cancelledAt !== null && loan.cancelledAt <= day) continue
    const isMoreRecent =
      !selected ||
      loan.startDate > selected.startDate ||
      (loan.startDate === selected.startDate && loan.assignmentId > selected.assignmentId)
    if (isMoreRecent) selected = loan
  }
  return selected
}

/**
 * Sucursal del catálogo de ausencias a partir de la fila del repositorio. La
 * empresa contratante solo se expone si está viva y pertenece a una de las
 * unidades de negocio permitidas; en cualquier otro caso la sucursal va sin
 * empresa (`null`), como una sucursal propia.
 */
export function toAbsencesBranch(
  row: AbsencesBranchRow,
  allowedBusinessUnitIds: readonly number[]
): AbsencesBranch {
  const empresa = row.empresaContratante
  const isVisible =
    empresa !== null && !empresa.isDeleted && allowedBusinessUnitIds.includes(empresa.businessUnitId)
  return {
    branchOfficeId: row.branchOfficeId,
    name: row.name,
    empresaContratanteId: isVisible ? empresa.empresaContratanteId : null,
    empresaContratanteName: isVisible ? empresa.razonSocial : null,
  }
}

/**
 * Sucursales que pueden ser efectivas algún día del periodo: las bases activas
 * de los calendarios y los destinos de los préstamos. Es el conjunto a buscar
 * en el catálogo; la respuesta solo lista las que terminan referenciadas.
 */
export function collectCandidateBranchIds(
  bundles: readonly EmployeeCalendarBundle[],
  loans: readonly CoverageRangeLoanRow[]
): number[] {
  const ids = new Set<number>()
  for (const bundle of bundles) {
    const branchOfficeId = bundle.employee.branchOfficeId
    if (branchOfficeId !== null && branchOfficeId !== undefined) ids.add(branchOfficeId)
  }
  for (const loan of loans) ids.add(loan.targetBranchId)
  return [...ids].sort((a, b) => a - b)
}

/** Entrada de `buildAbsencesResponse`: todo ya cargado, sin BD. */
export interface BuildAbsencesInput {
  startDay: string
  endDay: string
  /**
   * Catálogo de las sucursales candidatas (`collectCandidateBranchIds`), vivas
   * y del tenant. Una sucursal efectiva que no está aquí se responde como `null`.
   */
  branches: AbsencesBranch[]
  /** Préstamos de los colaboradores que intersectan el periodo. */
  loans: CoverageRangeLoanRow[]
  /**
   * Calendarios del periodo; `employee.branchOfficeId` es la sucursal base
   * activa hoy. Un colaborador con varias bases activas llega en varias filas.
   */
  bundles: EmployeeCalendarBundle[]
  /**
   * Colaboradores que el usuario puede ver. Se recorta antes de contar: días,
   * empleados y sucursales solo incluyen visibles. Es obligatorio para que
   * omitirlo no exponga a toda la plantilla.
   */
  visibleEmployeeIds: ReadonlySet<number>
  /**
   * Si el usuario tiene `shift-coverage`. Sin él, las sucursales conservan id y
   * nombre pero van sin empresa contratante. Es obligatorio para que omitirlo no
   * exponga la razón social de los clientes REPSE.
   */
  canSeeContractingCompany: boolean
  thresholds: ToleranceThresholds
}

/**
 * Sucursal del catálogo según el permiso `shift-coverage` del usuario: con él,
 * tal cual; sin él, la misma forma con `empresaContratanteId` y
 * `empresaContratanteName` en `null`.
 */
export function applyContractingCompanyVisibility(
  branch: AbsencesBranch,
  canSeeContractingCompany: boolean
): AbsencesBranch {
  if (canSeeContractingCompany) return branch
  return { ...branch, empresaContratanteId: null, empresaContratanteName: null }
}

function compareBranches(a: AbsencesBranch, b: AbsencesBranch): number {
  return a.name.localeCompare(b.name, 'es') || a.branchOfficeId - b.branchOfficeId
}

function groupLoansByEmployee(
  loans: readonly CoverageRangeLoanRow[]
): Map<number, CoverageRangeLoanRow[]> {
  const byEmployee = new Map<number, CoverageRangeLoanRow[]>()
  for (const loan of loans) {
    const employeeLoans = byEmployee.get(loan.employeeId)
    if (employeeLoans) employeeLoans.push(loan)
    else byEmployee.set(loan.employeeId, [loan])
  }
  return byEmployee
}

/** Filas del calendario agrupadas por colaborador, en orden de primera aparición. */
function groupBundlesByEmployee(
  bundles: readonly EmployeeCalendarBundle[]
): Map<number, EmployeeCalendarBundle[]> {
  const byEmployee = new Map<number, EmployeeCalendarBundle[]>()
  for (const bundle of bundles) {
    const employeeBundles = byEmployee.get(bundle.employee.employeeId)
    if (employeeBundles) employeeBundles.push(bundle)
    else byEmployee.set(bundle.employee.employeeId, [bundle])
  }
  return byEmployee
}

/**
 * Fila que representa al colaborador: define su sucursal base para atribuir
 * los días sin préstamo.
 *
 * Con varias sucursales base activas (dato inconsistente: el modelo prevé una
 * sola) gana la de `branchOfficeId` menor, sin depender del orden de las filas
 * ni de la vista que consuma la respuesta. Sin ninguna base se toma la primera.
 */
function resolveHomeBundle(employeeBundles: readonly EmployeeCalendarBundle[]): EmployeeCalendarBundle {
  let home: { bundle: EmployeeCalendarBundle; branchOfficeId: number } | undefined
  for (const bundle of employeeBundles) {
    const branchOfficeId = bundle.employee.branchOfficeId
    if (branchOfficeId === null || branchOfficeId === undefined) continue
    if (!home || branchOfficeId < home.branchOfficeId) home = { bundle, branchOfficeId }
  }
  return home?.bundle ?? employeeBundles[0]
}

/** Alias cuando trae texto; si no, el nombre. */
function preferAlias(alias: string | null | undefined, name: string | null): string | null {
  return alias !== null && alias !== undefined && alias.trim().length > 0 ? alias : name
}

function toAbsencesEmployee(employee: EmployeeInfo): AbsencesEmployee {
  return {
    employeeId: employee.employeeId,
    firstName: employee.employeeFirstName ?? '',
    lastName: employee.employeeLastName,
    secondLastName: employee.employeeSecondLastName,
    photo: employee.employeePhoto,
    positionName: preferAlias(employee.positionAlias, employee.position?.positionName ?? null),
    departmentId: employee.departmentId,
    departmentName: preferAlias(employee.departmentAlias, employee.department?.departmentName ?? null),
  }
}

/**
 * Ausencias por día del periodo con la sucursal efectiva de cada falta. Es el
 * motor único de las vistas del drawer: el cliente agrupa las mismas entradas
 * por departamento, por sucursal propia o por empresa contratante.
 *
 * "Faltó el día D" cuando D es evaluable y `classifyDay` cuenta exactamente una
 * falta. La sucursal efectiva de D es el destino del préstamo que lo mueve ese
 * día (`selectLoanForDay`) o, sin préstamo, la sucursal base activa HOY (para
 * periodos pasados no se reconstruye la asignación histórica); `null` si no
 * tiene ninguna o si la sucursal no está en el catálogo.
 *
 * Un colaborador con varias sucursales base activas llega en varias filas del
 * calendario y cuenta una sola vez, con la base de `branchOfficeId` menor.
 */
export function buildAbsencesResponse(input: BuildAbsencesInput): AbsencesResponse {
  const { startDay, endDay, loans, bundles, visibleEmployeeIds, canSeeContractingCompany, thresholds } =
    input
  const catalog = new Map(
    input.branches.map((branch) => [
      branch.branchOfficeId,
      applyContractingCompanyVisibility(branch, canSeeContractingCompany),
    ])
  )
  const loansByEmployee = groupLoansByEmployee(loans)

  /** Día → colaborador que faltó → sucursal efectiva ese día. */
  const absencesByDay = new Map<string, Map<number, number | null>>()
  /** Colaboradores con al menos una falta en el periodo. */
  const absentees = new Map<number, EmployeeInfo>()

  for (const [employeeId, employeeBundles] of groupBundlesByEmployee(bundles)) {
    // Recorte por alcance antes de contar.
    if (!visibleEmployeeIds.has(employeeId)) continue

    const bundle = resolveHomeBundle(employeeBundles)
    const homeBranchId = bundle.employee.branchOfficeId ?? null
    const employeeLoans = loansByEmployee.get(employeeId) ?? []

    for (const assistDay of bundle.calendar) {
      if (assistDay.day < startDay || assistDay.day > endDay) continue
      if (!isEvaluableDay(assistDay)) continue
      if (classifyDay(assistDay, thresholds).clean.faults !== 1) continue

      const loan = selectLoanForDay(employeeLoans, assistDay.day)
      const effectiveBranchId = resolveEffectiveBranchId(homeBranchId, loan)
      const branchOfficeId =
        effectiveBranchId !== null && catalog.has(effectiveBranchId) ? effectiveBranchId : null

      let byEmployee = absencesByDay.get(assistDay.day)
      if (!byEmployee) {
        byEmployee = new Map()
        absencesByDay.set(assistDay.day, byEmployee)
      }
      byEmployee.set(employeeId, branchOfficeId)
      absentees.set(employeeId, bundle.employee)
    }
  }

  const names = new Map<number, string>()
  for (const [employeeId, employee] of absentees) {
    names.set(employeeId, buildEmployeeDisplayName(employee))
  }
  const compareByName = (a: number, b: number): number =>
    (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'es') || a - b

  const referencedBranchIds = new Set<number>()
  const days: AbsencesDay[] = enumerateDays(startDay, endDay).map((day) => {
    const byEmployee = absencesByDay.get(day) ?? new Map<number, number | null>()
    const entries = [...byEmployee.entries()]
      .sort(([a], [b]) => compareByName(a, b))
      .map(([employeeId, branchOfficeId]) => {
        if (branchOfficeId !== null) referencedBranchIds.add(branchOfficeId)
        return { employeeId, branchOfficeId }
      })
    return { day, entries }
  })

  const branches = [...catalog.values()]
    .filter((branch) => referencedBranchIds.has(branch.branchOfficeId))
    .sort(compareBranches)

  const employees = [...absentees.entries()]
    .sort(([a], [b]) => compareByName(a, b))
    .map(([, employee]) => toAbsencesEmployee(employee))

  return { period: { startDay, endDay }, branches, employees, days }
}

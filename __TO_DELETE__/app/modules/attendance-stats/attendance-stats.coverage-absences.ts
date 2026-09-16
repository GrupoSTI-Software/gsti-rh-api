import { DateTime } from 'luxon'
import { buildEmployeeDisplayName, resolveEffectiveBranchId } from './attendance-stats.coverage.js'
import {
  aggregateCalendar,
  classifyDay,
  enumerateDays,
  isEvaluableDay,
  toStatistics,
} from './attendance-stats.rules.js'
import type {
  CoverageAbsencesDay,
  CoverageAbsencesResponse,
  CoverageRangeLoanRow,
  CoverageSiteRef,
  EmployeeCalendarBundle,
  EmployeeRow,
  ToleranceThresholds,
} from './dto/attendance-stats.dto.js'

/**
 * Tope de días (inclusive) del periodo de coverage/absences. Cubre dos meses
 * calendario; el calendario SQL crece con colaboradores por días.
 */
export const COVERAGE_ABSENCES_MAX_RANGE_DAYS = 62

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
 * o posterior al día, el mismo criterio que `getActiveLoansForDay`). Con varios
 * vigentes gana el de start_date más reciente y, empatando, el de id mayor, sin
 * importar el orden de entrada. Es el mismo desempate que la cobertura del día
 * obtiene del orden de `getActiveLoansForDay` al quedarse con el primero.
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

/** Entrada de `buildCoverageAbsencesResponse`: todo ya cargado, sin BD. */
export interface BuildCoverageAbsencesInput {
  startDay: string
  endDay: string
  /** Sitios de la empresa contratante tras el filtro de sitios. */
  sites: CoverageSiteRef[]
  /** Préstamos de los colaboradores que intersectan el periodo. */
  loans: CoverageRangeLoanRow[]
  /**
   * Calendarios del periodo; `employee.branchOfficeId` es la sucursal base
   * activa hoy. Un colaborador con varias bases activas llega en varias filas.
   */
  bundles: EmployeeCalendarBundle[]
  /**
   * Colaboradores que el usuario puede ver. Se recorta antes de contar: los
   * conteos y las listas solo incluyen visibles. Es obligatorio para que
   * omitirlo no exponga a toda la plantilla.
   */
  visibleEmployeeIds: ReadonlySet<number>
  thresholds: ToleranceThresholds
}

function compareSites(a: CoverageSiteRef, b: CoverageSiteRef): number {
  return (
    a.branchOfficeName.localeCompare(b.branchOfficeName, 'es') || a.branchOfficeId - b.branchOfficeId
  )
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
 * los días sin préstamo y el `employee` que se lista en `employees`.
 *
 * Con varias sucursales base activas (dato inconsistente: el modelo prevé una
 * sola) gana la base que está entre `siteIds` y, si hay varias, la de
 * `branchOfficeId` menor, sin depender del orden en que llegan las filas. Si
 * ninguna base está entre los sitios se toma la primera fila: sin préstamo
 * esas faltas no caen en ningún sitio, sea cual sea la base.
 */
function resolveHomeBundle(
  employeeBundles: readonly EmployeeCalendarBundle[],
  siteIds: ReadonlySet<number>
): EmployeeCalendarBundle {
  let home: { bundle: EmployeeCalendarBundle; branchOfficeId: number } | undefined
  for (const bundle of employeeBundles) {
    const branchOfficeId = bundle.employee.branchOfficeId
    if (branchOfficeId === null || branchOfficeId === undefined || !siteIds.has(branchOfficeId)) {
      continue
    }
    if (!home || branchOfficeId < home.branchOfficeId) home = { bundle, branchOfficeId }
  }
  return home?.bundle ?? employeeBundles[0]
}

/**
 * Faltas por sitio de servicio y por día de una empresa contratante.
 *
 * "Faltó el día D en el sitio S" cuando D es evaluable, `classifyDay` cuenta
 * exactamente una falta y la sucursal efectiva de D es S. La sucursal efectiva
 * es el destino del préstamo que lo mueve ese día (`selectLoanForDay`) o, sin
 * préstamo, la sucursal base activa HOY: para periodos pasados no se reconstruye
 * la asignación histórica.
 *
 * Un colaborador con varias sucursales base activas llega en varias filas del
 * calendario y cuenta una sola vez: sin préstamo se atribuye a la base que está
 * entre los sitios de la respuesta (los de la empresa tras el filtro) y, si hay
 * varias, a la de `branchOfficeId` menor (`resolveHomeBundle`).
 */
export function buildCoverageAbsencesResponse(
  input: BuildCoverageAbsencesInput
): CoverageAbsencesResponse {
  const { startDay, endDay, loans, bundles, visibleEmployeeIds, thresholds } = input
  const sites = [...input.sites].sort(compareSites)
  const siteIds = new Set(sites.map((site) => site.branchOfficeId))
  const loansByEmployee = groupLoansByEmployee(loans)

  /** Día → sitio → colaboradores que faltaron. */
  const absencesByDay = new Map<string, Map<number, Set<number>>>()
  /** Colaboradores con al menos una falta en los sitios, en orden de aparición. */
  const absentees = new Map<number, EmployeeCalendarBundle>()

  for (const [employeeId, employeeBundles] of groupBundlesByEmployee(bundles)) {
    // Recorte por alcance antes de contar.
    if (!visibleEmployeeIds.has(employeeId)) continue

    const bundle = resolveHomeBundle(employeeBundles, siteIds)
    const homeBranchId = bundle.employee.branchOfficeId ?? null
    const employeeLoans = loansByEmployee.get(employeeId) ?? []

    for (const assistDay of bundle.calendar) {
      if (assistDay.day < startDay || assistDay.day > endDay) continue
      if (!isEvaluableDay(assistDay)) continue
      if (classifyDay(assistDay, thresholds).clean.faults !== 1) continue

      const loan = selectLoanForDay(employeeLoans, assistDay.day)
      const siteId = resolveEffectiveBranchId(homeBranchId, loan)
      if (siteId === null || !siteIds.has(siteId)) continue

      let bySite = absencesByDay.get(assistDay.day)
      if (!bySite) {
        bySite = new Map()
        absencesByDay.set(assistDay.day, bySite)
      }
      let employeeIds = bySite.get(siteId)
      if (!employeeIds) {
        employeeIds = new Set()
        bySite.set(siteId, employeeIds)
      }
      employeeIds.add(employeeId)
      absentees.set(employeeId, bundle)
    }
  }

  const names = new Map<number, string>()
  for (const [employeeId, bundle] of absentees) {
    names.set(employeeId, buildEmployeeDisplayName(bundle.employee))
  }
  const compareByName = (a: number, b: number): number =>
    (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'es') || a - b

  const days: CoverageAbsencesDay[] = enumerateDays(startDay, endDay).map((day) => {
    const bySite = absencesByDay.get(day)
    const daySites = sites.flatMap((site) => {
      const employeeIds = bySite?.get(site.branchOfficeId)
      return employeeIds
        ? [{ branchOfficeId: site.branchOfficeId, employeeIds: [...employeeIds].sort(compareByName) }]
        : []
    })
    return {
      day,
      faults: daySites.reduce((total, site) => total + site.employeeIds.length, 0),
      sites: daySites,
    }
  })

  const employees: EmployeeRow[] = [...absentees.entries()]
    .sort(([a], [b]) => compareByName(a, b))
    .map(([, bundle]) => {
      const { clean, informational } = aggregateCalendar(bundle.calendar, thresholds)
      return { employee: bundle.employee, statistics: toStatistics(clean, informational) }
    })

  return {
    period: { startDay, endDay },
    sites: sites.map((site) => ({ branchOfficeId: site.branchOfficeId, name: site.branchOfficeName })),
    days,
    employees,
  }
}

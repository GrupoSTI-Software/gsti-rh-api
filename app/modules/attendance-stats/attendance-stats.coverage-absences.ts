import { DateTime } from 'luxon'
import { buildEmployeeDisplayName, resolveEffectiveBranchId } from './attendance-stats.coverage.js'
import {
  aggregateCalendar,
  classifyDay,
  enumerateDays,
  isEvaluableDay,
  toStatistics,
} from './attendance-stats.service.js'
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
 * importar el orden de entrada.
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
  /** Calendarios del periodo; `employee.branchOfficeId` es la sucursal base activa hoy. */
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

/**
 * Faltas por sitio de servicio y por día de una empresa contratante.
 *
 * "Faltó el día D en el sitio S" cuando D es evaluable, `classifyDay` cuenta
 * exactamente una falta y la sucursal efectiva de D es S. La sucursal efectiva
 * es el destino del préstamo que lo mueve ese día (`selectLoanForDay`) o, sin
 * préstamo, la sucursal base activa HOY: para periodos pasados no se reconstruye
 * la asignación histórica.
 *
 * Un colaborador con dos sucursales base activas llega duplicado del
 * calendario; cuenta una sola vez con la primera fila.
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
  const processed = new Set<number>()

  for (const bundle of bundles) {
    const { employeeId } = bundle.employee
    // Recorte por alcance antes de contar.
    if (!visibleEmployeeIds.has(employeeId) || processed.has(employeeId)) continue
    processed.add(employeeId)

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

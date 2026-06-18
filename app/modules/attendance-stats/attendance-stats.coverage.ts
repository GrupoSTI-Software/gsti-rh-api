import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type {
  CoverageActiveLoanRow,
  CoverageCandidate,
  CoverageLoanDecision,
  CoverageResponse,
  CoverageShift,
  CoverageShiftQuotaRow,
  CoverageShiftStatus,
  CoverageSiteRef,
  EmployeeCalendarBundle,
  EmployeeInfo,
} from './dto/attendance-stats.dto.js'

type SiteShiftKey = string

function siteShiftKey(branchOfficeId: number, shiftId: number): SiteShiftKey {
  return `${branchOfficeId}:${shiftId}`
}

function coverageIsEvaluableDay(day: AssistDayInterface): boolean {
  if (day.assist.isFutureDay) return false
  if (day.assist.isRestDay) return false
  if (day.assist.isVacationDate) return false
  if (day.assist.isHoliday) return false
  if (day.assist.isWorkDisabilityDate) return false
  return !day.assist.exceptions.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e) => (e.exceptionType as any)?.exceptionTypeIsGeneral === 0
  )
}

function coverageIsPresent(day: AssistDayInterface): boolean {
  if (!coverageIsEvaluableDay(day)) return false
  const status = day.assist.checkInStatus
  return status === 'ontime' || status === 'tolerance' || status === 'delay'
}

function getDayShiftId(day: AssistDayInterface): number | null {
  const shiftId = day.assist.dateShift?.shiftId
  return shiftId !== null && shiftId !== undefined ? Number(shiftId) : null
}

function buildEmployeeDisplayName(employee: EmployeeInfo): string {
  return [employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName]
    .filter((part) => part && part.trim().length > 0)
    .join(' ')
    .trim()
}

function resolveEffectiveBranchId(
  homeBranchId: number | null | undefined,
  loan: CoverageActiveLoanRow | undefined
): number | null {
  if (loan) return loan.targetBranchId
  return homeBranchId ?? null
}

function computeSemaphore(
  present: number,
  required: number,
  min: number,
  hasQuota: boolean
): CoverageShiftStatus {
  if (!hasQuota) return 'no_quota'
  if (present >= required) return 'green'
  if (present >= min) return 'amber'
  return 'red'
}

function compareCandidates(a: CoverageCandidate, b: CoverageCandidate): number {
  const sourceOrder = a.source === 'rest_same_site' ? 0 : 1
  const sourceOrderB = b.source === 'rest_same_site' ? 0 : 1
  if (sourceOrder !== sourceOrderB) return sourceOrder - sourceOrderB
  return a.name.localeCompare(b.name, 'es')
}

function resolveOriginBranchOfficeName(
  branchOfficeId: number | null,
  branchOfficeNamesById: Map<number, string>
): string | null {
  if (branchOfficeId === null) return null
  const name = branchOfficeNamesById.get(branchOfficeId)
  if (name === undefined || name.trim().length === 0) return null
  return name
}

export interface BuildCoverageInput {
  day: string
  sites: CoverageSiteRef[]
  quotas: CoverageShiftQuotaRow[]
  loans: CoverageActiveLoanRow[]
  bundles: EmployeeCalendarBundle[]
  branchOfficeNamesById: Map<number, string>
}

type EmployeeDayContext = {
  employee: EmployeeInfo
  homeBranchId: number | null
  effectiveBranchId: number | null
  activeLoan: CoverageActiveLoanRow | undefined
  shiftId: number | null
  isEvaluable: boolean
  isPresent: boolean
  isRestDay: boolean
}

/**
 * Agrega métricas de cobertura y candidatos por sitio → turno para un día.
 */
export function buildCoverageResponse(input: BuildCoverageInput): CoverageResponse {
  const { day, sites, quotas, loans, bundles, branchOfficeNamesById } = input

  const companySiteIds = new Set(sites.map((s) => s.branchOfficeId))
  const loansByEmployee = new Map<number, CoverageActiveLoanRow>()
  for (const loan of loans) {
    loansByEmployee.set(loan.employeeId, loan)
  }

  const quotaByKey = new Map<SiteShiftKey, CoverageShiftQuotaRow>()
  const shiftLabels = new Map<number, string>()
  for (const quota of quotas) {
    quotaByKey.set(siteShiftKey(quota.branchOfficeId, quota.shiftId), quota)
    if (!shiftLabels.has(quota.shiftId)) {
      shiftLabels.set(quota.shiftId, quota.shiftName)
    }
  }

  /** Conteos globales (todos los sitios) para métricas y simulación de préstamo. */
  const assignedCounts = new Map<SiteShiftKey, number>()
  const presentCounts = new Map<SiteShiftKey, number>()
  const employeeContexts: EmployeeDayContext[] = []

  for (const bundle of bundles) {
    const daySlice = bundle.calendar.find((d) => d.day === day)
    if (!daySlice) continue

    const homeBranchId = bundle.employee.branchOfficeId ?? null
    const activeLoan = loansByEmployee.get(bundle.employee.employeeId)
    const effectiveBranchId = resolveEffectiveBranchId(homeBranchId, activeLoan)
    const shiftId = getDayShiftId(daySlice)
    const isEvaluable = coverageIsEvaluableDay(daySlice)
    const isPresent = coverageIsPresent(daySlice)

    employeeContexts.push({
      employee: bundle.employee,
      homeBranchId,
      effectiveBranchId,
      activeLoan,
      shiftId,
      isEvaluable,
      isPresent,
      isRestDay: daySlice.assist.isRestDay,
    })

    if (effectiveBranchId === null || shiftId === null || !isEvaluable) continue

    const key = siteShiftKey(effectiveBranchId, shiftId)
    assignedCounts.set(key, (assignedCounts.get(key) ?? 0) + 1)
    if (isPresent) {
      presentCounts.set(key, (presentCounts.get(key) ?? 0) + 1)
    }
  }

  const shiftsWithActivityOnCompanySites = new Map<number, Set<number>>()
  for (const [key] of assignedCounts) {
    const [branchStr, shiftStr] = key.split(':')
    const branchId = Number(branchStr)
    const shiftId = Number(shiftStr)
    if (!companySiteIds.has(branchId)) continue
    if (!shiftsWithActivityOnCompanySites.has(branchId)) {
      shiftsWithActivityOnCompanySites.set(branchId, new Set())
    }
    shiftsWithActivityOnCompanySites.get(branchId)!.add(shiftId)
  }

  const responseSites = sites.map((site) => {
    const shiftIds = new Set<number>()

    for (const quota of quotas) {
      if (quota.branchOfficeId === site.branchOfficeId) {
        shiftIds.add(quota.shiftId)
      }
    }
    const activityShifts = shiftsWithActivityOnCompanySites.get(site.branchOfficeId)
    if (activityShifts) {
      for (const shiftId of activityShifts) {
        shiftIds.add(shiftId)
      }
    }

    const shifts: CoverageShift[] = Array.from(shiftIds)
      .sort((a, b) => {
        const labelA = shiftLabels.get(a) ?? String(a)
        const labelB = shiftLabels.get(b) ?? String(b)
        return labelA.localeCompare(labelB, 'es')
      })
      .map((shiftId) => {
        const key = siteShiftKey(site.branchOfficeId, shiftId)
        const quota = quotaByKey.get(key)
        const hasQuota = quota !== undefined
        const required = quota?.required ?? 0
        const min = quota?.minimum ?? 0
        const assigned = assignedCounts.get(key) ?? 0
        const present = presentCounts.get(key) ?? 0
        const missing = hasQuota ? Math.max(0, required - present) : 0
        const status = computeSemaphore(present, required, min, hasQuota)

        const candidates =
          status === 'amber' || status === 'red'
            ? buildCandidates({
                targetSiteId: site.branchOfficeId,
                targetShiftId: shiftId,
                employeeContexts,
                presentCounts,
                quotaByKey,
                branchOfficeNamesById,
              })
            : []

        return {
          shiftId,
          label: shiftLabels.get(shiftId) ?? quota?.shiftName ?? String(shiftId),
          required,
          min,
          assigned,
          present,
          missing,
          status,
          candidates,
        }
      })

    return {
      branchOfficeId: site.branchOfficeId,
      name: site.branchOfficeName,
      shifts,
    }
  })

  return { day, sites: responseSites }
}

function buildCandidates(params: {
  targetSiteId: number
  targetShiftId: number
  employeeContexts: EmployeeDayContext[]
  presentCounts: Map<SiteShiftKey, number>
  quotaByKey: Map<SiteShiftKey, CoverageShiftQuotaRow>
  branchOfficeNamesById: Map<number, string>
}): CoverageCandidate[] {
  const {
    targetSiteId,
    targetShiftId,
    employeeContexts,
    presentCounts,
    quotaByKey,
    branchOfficeNamesById,
  } = params

  const candidates: CoverageCandidate[] = []
  const added = new Set<number>()

  for (const ctx of employeeContexts) {
    if (added.has(ctx.employee.employeeId)) continue

    const name = buildEmployeeDisplayName(ctx.employee)
    if (!name) continue

    if (
      ctx.effectiveBranchId === targetSiteId &&
      ctx.isRestDay &&
      !ctx.isPresent
    ) {
      candidates.push({
        employeeId: ctx.employee.employeeId,
        name,
        source: 'rest_same_site',
        originLeftBelowMin: false,
        originBranchOfficeId: ctx.effectiveBranchId,
        originBranchOfficeName: resolveOriginBranchOfficeName(
          ctx.effectiveBranchId,
          branchOfficeNamesById
        ),
        loanDecision: resolveLoanDecision({
          source: 'rest_same_site',
          targetSiteId,
          homeBranchId: ctx.homeBranchId,
          activeLoan: ctx.activeLoan,
        }),
      })
      added.add(ctx.employee.employeeId)
      continue
    }

    if (
      ctx.effectiveBranchId !== null &&
      ctx.effectiveBranchId !== targetSiteId &&
      ctx.shiftId === targetShiftId &&
      ctx.isEvaluable &&
      ctx.isPresent
    ) {
      const originKey = siteShiftKey(ctx.effectiveBranchId, targetShiftId)
      const originPresent = presentCounts.get(originKey) ?? 0
      const originQuota = quotaByKey.get(originKey)
      const originMin = originQuota?.minimum ?? 0
      const originPresentAfter = originPresent - 1
      const originLeftBelowMin =
        originQuota !== undefined ? originPresentAfter < originMin : false

      candidates.push({
        employeeId: ctx.employee.employeeId,
        name,
        source: 'loan_other_site',
        originLeftBelowMin,
        originBranchOfficeId: ctx.effectiveBranchId,
        originBranchOfficeName: resolveOriginBranchOfficeName(
          ctx.effectiveBranchId,
          branchOfficeNamesById
        ),
        loanDecision: resolveLoanDecision({
          source: 'loan_other_site',
          targetSiteId,
          homeBranchId: ctx.homeBranchId,
          activeLoan: ctx.activeLoan,
        }),
      })
      added.add(ctx.employee.employeeId)
    }
  }

  return candidates.sort(compareCandidates)
}

function resolveLoanDecision(params: {
  source: CoverageCandidate['source']
  targetSiteId: number
  homeBranchId: number | null
  activeLoan: CoverageActiveLoanRow | undefined
}): CoverageLoanDecision {
  const { source, targetSiteId, homeBranchId, activeLoan } = params

  if (source === 'rest_same_site') {
    return {
      state: 'not_applicable',
      activeAssignmentId: null,
    }
  }

  if (
    activeLoan &&
    homeBranchId !== null &&
    targetSiteId === homeBranchId &&
    activeLoan.targetBranchId !== homeBranchId
  ) {
    return {
      state: 'must_cancel_active',
      activeAssignmentId: activeLoan.assignmentId,
    }
  }

  return {
    state: 'can_create',
    activeAssignmentId: null,
  }
}

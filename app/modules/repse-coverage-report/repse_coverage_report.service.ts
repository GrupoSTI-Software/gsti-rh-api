import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import AttendanceStatsRepositoryMysql from '#modules/attendance-stats/attendance-stats.repository.mysql'
import type { EmployeeCalendarBundle } from '#modules/attendance-stats/dto/attendance-stats.dto'
import { getAllowedBusinessUnitIds } from '../../helpers/repse_tenant_scope.js'
import type {
  RepseCoverageEmployeeRow,
  RepseCoverageExportRow,
  RepseCoverageMovementRow,
  RepseCoverageReportExportFilters,
  RepseCoverageReportFilters,
  RepseCoverageReportResult,
} from './dto/repse_coverage_report.dto.js'

type DeclaredPercentRow = {
  employeeId: number
  companyId: number
  porcentajeDeclarado: number
}

type BaseAssignmentRow = {
  employeeId: number
  branchOfficeId: number
  startsAt: string
  deactivatedAt: string | null
}

type CoverageLoanRow = {
  assignmentId: number
  employeeId: number
  startDate: string
  endDate: string
  cancelledAt: string | null
  reason: string | null
  sourceBranchId: number
  targetBranchId: number
}

type BranchMeta = {
  branchOfficeId: number
  branchOfficeName: string
  companyId: number | null
  companyName: string | null
}

type CompanyAccumulator = {
  companyId: number
  companyName: string
  diasBase: number
  diasPrestados: number
}

type EmployeeWorkAccumulator = {
  employeeId: number
  employeeName: string
  employeeCode: string | null
  diasLaborados: number
  companies: Map<number, CompanyAccumulator>
  movimientos: RepseCoverageMovementRow[]
}

/**
 * Servicio de dominio del reporte REPSE de tiempo real por empresa contratante.
 */
export default class RepseCoverageReportService {
  constructor(private readonly i18n: I18n) {}

  async getReport(filters: RepseCoverageReportFilters): Promise<RepseCoverageReportResult> {
    const rows = await this.buildEmployeeRows(filters)
    const sorted = [...rows].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'es'))

    const total = sorted.length
    const perPage = filters.perPage
    const currentPage = filters.page
    const lastPage = total === 0 ? 1 : Math.ceil(total / perPage)
    const offset = (currentPage - 1) * perPage
    const paginated = sorted.slice(offset, offset + perPage)

    return {
      meta: {
        total,
        perPage,
        currentPage,
        lastPage,
      },
      data: paginated,
    }
  }

  async getExportRows(filters: RepseCoverageReportExportFilters): Promise<RepseCoverageExportRow[]> {
    const employeeRows = await this.buildEmployeeRows({
      ...filters,
      page: 1,
      perPage: 500,
    })

    const rows: RepseCoverageExportRow[] = []
    for (const employee of employeeRows) {
      for (const company of employee.companies) {
        rows.push({
          employeeId: employee.employeeId,
          employeeName: employee.employeeName,
          employeeCode: employee.employeeCode,
          companyId: company.companyId,
          companyName: company.companyName,
          diasLaborados: employee.diasLaborados,
          diasBase: company.diasBase,
          diasPrestados: company.diasPrestados,
          diasServidos: company.diasServidos,
          porcentajeObservado: company.porcentajeObservado,
          porcentajeDeclarado: company.porcentajeDeclarado,
          diferencia: company.diferencia,
        })
      }
    }

    return rows.sort((a, b) => {
      const employeeOrder = a.employeeName.localeCompare(b.employeeName, 'es')
      if (employeeOrder !== 0) return employeeOrder
      return a.companyName.localeCompare(b.companyName, 'es')
    })
  }

  private async buildEmployeeRows(filters: RepseCoverageReportFilters): Promise<RepseCoverageEmployeeRow[]> {
    const allowedBusinessUnitIds = await getAllowedBusinessUnitIds()
    if (allowedBusinessUnitIds.length === 0) return []

    const attendanceRepo = new AttendanceStatsRepositoryMysql(this.i18n)
    const bundles = await attendanceRepo.getEmployeeCalendars(
      {
        startDay: filters.from,
        endDay: filters.to,
        employeeIds: filters.employeeId ? [filters.employeeId] : undefined,
      },
      allowedBusinessUnitIds
    )
    if (bundles.length === 0) return []

    const employeeIds = bundles.map((bundle) => bundle.employee.employeeId)

    const [baseAssignments, loans, branchMetaById, declaredRows] = await Promise.all([
      this.loadBaseAssignments(employeeIds, filters.from, filters.to),
      this.loadCoverageLoans(employeeIds, filters.from, filters.to),
      this.loadBranchMetadata(),
      this.loadDeclaredPercentages(employeeIds, filters.from, filters.to),
    ])

    const baseByEmployee = this.groupBaseAssignmentsByEmployee(baseAssignments)
    const loansByEmployee = this.groupLoansByEmployee(loans)
    const declaredByEmployeeCompany = this.groupDeclaredPercentages(declaredRows)

    const result: RepseCoverageEmployeeRow[] = []

    for (const bundle of bundles) {
      const employeeId = bundle.employee.employeeId
      const accumulator: EmployeeWorkAccumulator = {
        employeeId,
        employeeName: this.buildEmployeeName(bundle),
        employeeCode: bundle.employee.employeeCode ?? null,
        diasLaborados: 0,
        companies: new Map(),
        movimientos: [],
      }

      const employeeBaseAssignments = baseByEmployee.get(employeeId) ?? []
      const employeeLoans = loansByEmployee.get(employeeId) ?? []
      const employeeDeclared = declaredByEmployeeCompany.get(employeeId) ?? new Map()

      for (const daySlice of bundle.calendar) {
        if (!this.isWorkedDay(daySlice)) continue

        accumulator.diasLaborados += 1
        const day = daySlice.day

        const activeLoan = this.findActiveLoanForDay(day, employeeLoans)
        if (activeLoan) {
          const targetMeta = branchMetaById.get(activeLoan.targetBranchId)
          if (targetMeta?.companyId) {
            this.bumpCompanyCounter(
              accumulator,
              targetMeta.companyId,
              targetMeta.companyName ?? this.i18n.t('resources'),
              'diasPrestados'
            )
          }
          continue
        }

        const baseAssignment = this.findBaseAssignmentForDay(day, employeeBaseAssignments)
        if (!baseAssignment) continue

        const baseMeta = branchMetaById.get(baseAssignment.branchOfficeId)
        if (!baseMeta?.companyId) continue

        this.bumpCompanyCounter(
          accumulator,
          baseMeta.companyId,
          baseMeta.companyName ?? this.i18n.t('resources'),
          'diasBase'
        )
      }

      accumulator.movimientos = this.buildMovements(employeeLoans, branchMetaById)

      for (const [companyId] of employeeDeclared) {
        const companyAcc = accumulator.companies.get(companyId)
        if (companyAcc) continue
        const companyName = this.resolveCompanyNameFromBranches(companyId, branchMetaById)
        accumulator.companies.set(companyId, {
          companyId,
          companyName: companyName ?? this.i18n.t('resources'),
          diasBase: 0,
          diasPrestados: 0,
        })
      }

      const companies = [...accumulator.companies.values()]
        .map((company) => {
          const diasServidos = company.diasBase + company.diasPrestados
          const porcentajeObservado =
            accumulator.diasLaborados > 0
              ? roundTo2((diasServidos / accumulator.diasLaborados) * 100)
              : 0
          const porcentajeDeclarado = employeeDeclared.get(company.companyId) ?? null
          const diferencia =
            porcentajeDeclarado === null
              ? null
              : roundTo2(porcentajeObservado - porcentajeDeclarado)

          return {
            ...company,
            diasServidos,
            porcentajeObservado,
            porcentajeDeclarado,
            diferencia,
          }
        })
        .filter((company) => {
          if (filters.contractingCompanyId === undefined) return true
          return company.companyId === filters.contractingCompanyId
        })
        .sort((a, b) => a.companyName.localeCompare(b.companyName, 'es'))

      if (companies.length === 0) continue

      result.push({
        employeeId: accumulator.employeeId,
        employeeName: accumulator.employeeName,
        employeeCode: accumulator.employeeCode,
        diasLaborados: accumulator.diasLaborados,
        companies,
        movimientos: accumulator.movimientos,
      })
    }

    return result
  }

  private async loadBaseAssignments(
    employeeIds: number[],
    from: string,
    to: string
  ): Promise<BaseAssignmentRow[]> {
    if (employeeIds.length === 0) return []

    const rows = await db
      .from('employee_branch_offices AS ebo')
      .whereIn('ebo.employee_id', employeeIds)
      .where((query) => {
        query.whereNull('ebo.employee_branch_office_deactivated_at').orWhereRaw(
          'DATE(ebo.employee_branch_office_deactivated_at) >= ?',
          [from]
        )
      })
      .whereRaw('DATE(ebo.employee_branch_office_created_at) <= ?', [to])
      .select(
        'ebo.employee_id AS employee_id',
        'ebo.branch_office_id AS branch_office_id',
        db.raw('DATE(ebo.employee_branch_office_created_at) AS starts_at'),
        db.raw('DATE(ebo.employee_branch_office_deactivated_at) AS deactivated_at')
      )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows as any[]).map((row) => ({
      employeeId: Number(row.employee_id),
      branchOfficeId: Number(row.branch_office_id),
      startsAt: normalizeDbDate(row.starts_at),
      deactivatedAt: row.deactivated_at ? normalizeDbDate(row.deactivated_at) : null,
    }))
  }

  private async loadCoverageLoans(
    employeeIds: number[],
    from: string,
    to: string
  ): Promise<CoverageLoanRow[]> {
    if (employeeIds.length === 0) return []

    const rows = await db
      .from('employee_temporary_assignments AS eta')
      .whereIn('eta.employee_id', employeeIds)
      .whereNull('eta.employee_temporary_assignment_deleted_at')
      .where('eta.reason', 'cobertura')
      .where('eta.start_date', '<=', to)
      .where('eta.end_date', '>=', from)
      .select(
        'eta.employee_temporary_assignment_id AS assignment_id',
        'eta.employee_id AS employee_id',
        'eta.start_date AS start_date',
        'eta.end_date AS end_date',
        'eta.cancelled_at AS cancelled_at',
        'eta.reason AS reason',
        'eta.source_branch_id AS source_branch_id',
        'eta.target_branch_id AS target_branch_id'
      )
      .orderBy('eta.employee_id', 'asc')
      .orderBy('eta.start_date', 'asc')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows as any[]).map((row) => ({
      assignmentId: Number(row.assignment_id),
      employeeId: Number(row.employee_id),
      startDate: normalizeDbDate(row.start_date),
      endDate: normalizeDbDate(row.end_date),
      cancelledAt: row.cancelled_at ? normalizeDbDate(row.cancelled_at) : null,
      reason: row.reason ? String(row.reason) : null,
      sourceBranchId: Number(row.source_branch_id),
      targetBranchId: Number(row.target_branch_id),
    }))
  }

  private async loadBranchMetadata(): Promise<Map<number, BranchMeta>> {
    const rows = await db
      .from('branch_offices AS bo')
      .leftJoin('empresas_contratantes AS ec', (join) => {
        join
          .on('ec.empresa_contratante_id', 'bo.empresa_contratante_id')
          .andOnNull('ec.empresa_contratante_deleted_at')
      })
      .whereNull('bo.branch_office_deleted_at')
      .select(
        'bo.branch_office_id AS branch_office_id',
        'bo.branch_office_name AS branch_office_name',
        'ec.empresa_contratante_id AS company_id',
        'ec.empresa_contratante_razon_social AS company_name'
      )

    const map = new Map<number, BranchMeta>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of rows as any[]) {
      map.set(Number(row.branch_office_id), {
        branchOfficeId: Number(row.branch_office_id),
        branchOfficeName: String(row.branch_office_name ?? ''),
        companyId:
          row.company_id !== null && row.company_id !== undefined ? Number(row.company_id) : null,
        companyName: row.company_name ? String(row.company_name) : null,
      })
    }
    return map
  }

  private async loadDeclaredPercentages(
    employeeIds: number[],
    from: string,
    to: string
  ): Promise<DeclaredPercentRow[]> {
    if (employeeIds.length === 0) return []

    const rows = await db
      .from('asignaciones_contrato_especializado AS ace')
      .innerJoin(
        'contratos_servicios_especializados AS cse',
        'cse.contrato_servicio_especializado_id',
        'ace.contrato_servicio_especializado_id'
      )
      .whereNull('ace.asignacion_contrato_especializado_deleted_at')
      .whereNull('cse.contrato_servicio_especializado_deleted_at')
      .whereIn('ace.employee_id', employeeIds)
      .where('ace.asignacion_contrato_especializado_fecha_inicio', '<=', to)
      .where((query) => {
        query
          .whereNull('ace.asignacion_contrato_especializado_fecha_fin')
          .orWhere('ace.asignacion_contrato_especializado_fecha_fin', '>=', from)
      })
      .groupBy('ace.employee_id', 'cse.empresa_contratante_id')
      .select(
        'ace.employee_id AS employee_id',
        'cse.empresa_contratante_id AS company_id',
        db.raw(
          'ROUND(SUM(ace.asignacion_contrato_especializado_porcentaje_tiempo), 2) AS porcentaje_declarado'
        )
      )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows as any[])
      .filter((row) => row.company_id !== null && row.company_id !== undefined)
      .map((row) => ({
        employeeId: Number(row.employee_id),
        companyId: Number(row.company_id),
        porcentajeDeclarado: Number(row.porcentaje_declarado ?? 0),
      }))
  }

  private groupBaseAssignmentsByEmployee(rows: BaseAssignmentRow[]): Map<number, BaseAssignmentRow[]> {
    const grouped = new Map<number, BaseAssignmentRow[]>()
    for (const row of rows) {
      if (!grouped.has(row.employeeId)) grouped.set(row.employeeId, [])
      grouped.get(row.employeeId)!.push(row)
    }
    for (const assignments of grouped.values()) {
      assignments.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    }
    return grouped
  }

  private groupLoansByEmployee(rows: CoverageLoanRow[]): Map<number, CoverageLoanRow[]> {
    const grouped = new Map<number, CoverageLoanRow[]>()
    for (const row of rows) {
      if (!grouped.has(row.employeeId)) grouped.set(row.employeeId, [])
      grouped.get(row.employeeId)!.push(row)
    }
    return grouped
  }

  private groupDeclaredPercentages(rows: DeclaredPercentRow[]): Map<number, Map<number, number>> {
    const grouped = new Map<number, Map<number, number>>()
    for (const row of rows) {
      if (!grouped.has(row.employeeId)) grouped.set(row.employeeId, new Map())
      grouped.get(row.employeeId)!.set(row.companyId, roundTo2(row.porcentajeDeclarado))
    }
    return grouped
  }

  private findBaseAssignmentForDay(
    day: string,
    assignments: BaseAssignmentRow[]
  ): BaseAssignmentRow | null {
    for (const assignment of assignments) {
      if (assignment.startsAt > day) continue
      if (assignment.deactivatedAt !== null && day >= assignment.deactivatedAt) continue
      return assignment
    }
    return null
  }

  private findActiveLoanForDay(day: string, loans: CoverageLoanRow[]): CoverageLoanRow | null {
    for (const loan of loans) {
      if (loan.startDate > day) continue
      if (loan.endDate < day) continue
      if (loan.cancelledAt !== null && loan.cancelledAt <= day) continue
      return loan
    }
    return null
  }

  private bumpCompanyCounter(
    accumulator: EmployeeWorkAccumulator,
    companyId: number,
    companyName: string,
    field: 'diasBase' | 'diasPrestados'
  ) {
    const current = accumulator.companies.get(companyId)
    if (!current) {
      accumulator.companies.set(companyId, {
        companyId,
        companyName,
        diasBase: field === 'diasBase' ? 1 : 0,
        diasPrestados: field === 'diasPrestados' ? 1 : 0,
      })
      return
    }

    current[field] += 1
  }

  private buildMovements(
    employeeLoans: CoverageLoanRow[],
    branchMetaById: Map<number, BranchMeta>
  ): RepseCoverageMovementRow[] {
    return employeeLoans.map((loan) => {
      const sourceBranch = branchMetaById.get(loan.sourceBranchId)
      const targetBranch = branchMetaById.get(loan.targetBranchId)

      return {
        assignmentId: loan.assignmentId,
        startDate: loan.startDate,
        endDate: loan.endDate,
        effectiveEndDate: this.resolveEffectiveEndDate(loan.startDate, loan.endDate, loan.cancelledAt),
        sourceBranchId: loan.sourceBranchId,
        sourceBranchName: sourceBranch?.branchOfficeName ?? '',
        sourceCompanyId: sourceBranch?.companyId ?? null,
        sourceCompanyName: sourceBranch?.companyName ?? null,
        targetBranchId: loan.targetBranchId,
        targetBranchName: targetBranch?.branchOfficeName ?? '',
        targetCompanyId: targetBranch?.companyId ?? null,
        targetCompanyName: targetBranch?.companyName ?? null,
        reason: loan.reason,
      }
    })
  }

  private resolveEffectiveEndDate(startDate: string, endDate: string, cancelledAt: string | null): string {
    if (!cancelledAt) return endDate

    const cancelDate = DateTime.fromISO(cancelledAt)
    const start = DateTime.fromISO(startDate)
    if (!cancelDate.isValid || !start.isValid) return endDate

    const candidate = cancelDate.minus({ days: 1 })
    if (candidate < start) {
      return start.minus({ days: 1 }).toFormat('yyyy-MM-dd')
    }

    const candidateIso = candidate.toFormat('yyyy-MM-dd')
    return candidateIso < endDate ? candidateIso : endDate
  }

  private resolveCompanyNameFromBranches(
    companyId: number,
    branchMetaById: Map<number, BranchMeta>
  ): string | null {
    for (const branch of branchMetaById.values()) {
      if (branch.companyId === companyId) return branch.companyName
    }
    return null
  }

  private buildEmployeeName(bundle: EmployeeCalendarBundle): string {
    return [
      bundle.employee.employeeFirstName,
      bundle.employee.employeeLastName,
      bundle.employee.employeeSecondLastName,
    ]
      .filter((part) => part && part.trim().length > 0)
      .join(' ')
      .trim()
  }

  private isWorkedDay(day: EmployeeCalendarBundle['calendar'][number]): boolean {
    if (day.assist.isFutureDay) return false
    if (day.assist.isRestDay) return false
    if (day.assist.isVacationDate) return false
    if (day.assist.isHoliday) return false
    if (day.assist.isWorkDisabilityDate) return false
    if (
      day.assist.exceptions.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item) => (item.exceptionType as any)?.exceptionTypeIsGeneral === 0
      )
    ) {
      return false
    }

    const status = day.assist.checkInStatus
    return status === 'ontime' || status === 'tolerance' || status === 'delay'
  }
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeDbDate(value: string | Date): string {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: 'UTC' }).toFormat('yyyy-MM-dd')
  }

  const asString = String(value)
  const iso = DateTime.fromISO(asString, { zone: 'UTC' })
  if (iso.isValid) return iso.toFormat('yyyy-MM-dd')

  const sql = DateTime.fromSQL(asString, { zone: 'UTC' })
  if (sql.isValid) return sql.toFormat('yyyy-MM-dd')

  return asString.slice(0, 10)
}

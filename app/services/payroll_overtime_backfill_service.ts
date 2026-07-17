import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import Employee from '#models/employee'
import type {
  PayrollOvertimeBackfillOptions,
  PayrollOvertimeBackfillSummary,
  PayrollOvertimeRevertOptions,
  PayrollOvertimeRevertSummary,
} from '../interfaces/payroll_overtime_backfill_interface.js'
import PayrollOvertimeAllocationService from './payroll_overtime_allocation_service.js'
import PayrollOvertimeMeasurementService from './payroll_overtime_measurement_service.js'
import PayrollOvertimeUnauthorizedService from './payroll_overtime_unauthorized_service.js'
import PayrollOvertimeWeeklyDetailService, {
  collectIsoWeeksInDateRange,
} from './payroll_overtime_weekly_detail_service.js'
import SyncAssistsService from './sync_assists_service.js'
import { isPayrollOvertimeIncludeUnauthorizedEnabled } from '#constants/payroll_overtime.constants'

const PAGE_SIZE = 100
const LOG_PREFIX = '[payroll-overtime-backfill]'

/**
 * Orquestador del backfill histórico de horas extra por semana ISO (USRH1783703922572).
 *
 * Recorre empresas de nómina y empleados en lotes de {@link PAGE_SIZE}, materializa
 * el calendario con `SyncAssistsService.index` (misma ruta que el reporte de
 * incidencias de nómina) y reutiliza medición, reparto y persistencia idempotente
 * de USRH1783703922266 — sin reimplementar el cálculo.
 *
 * Garantías:
 * - **Idempotente:** `updateOrCreate` + `withTrashed()` por (empleado, año ISO, semana ISO).
 * - **Reversible:** `runRevert()` hace soft delete por rango/empresa de nómina.
 * - **Auditable:** devuelve contadores; el comando Ace imprime resumen + línea JSON.
 * - **Acotable:** rango obligatorio y filtro opcional por `payrollBusinessUnitId`.
 */
export default class PayrollOvertimeBackfillService {
  private readonly syncAssistsService: SyncAssistsService
  private readonly measurementService: PayrollOvertimeMeasurementService
  private readonly allocationService: PayrollOvertimeAllocationService
  private readonly weeklyDetailService: PayrollOvertimeWeeklyDetailService
  private readonly unauthorizedService: PayrollOvertimeUnauthorizedService

  constructor(deps?: {
    syncAssistsService?: SyncAssistsService
    measurementService?: PayrollOvertimeMeasurementService
    allocationService?: PayrollOvertimeAllocationService
    weeklyDetailService?: PayrollOvertimeWeeklyDetailService
    unauthorizedService?: PayrollOvertimeUnauthorizedService
  }) {
    this.syncAssistsService = deps?.syncAssistsService ?? new SyncAssistsService()
    this.measurementService = deps?.measurementService ?? new PayrollOvertimeMeasurementService()
    this.allocationService = deps?.allocationService ?? new PayrollOvertimeAllocationService()
    this.weeklyDetailService = deps?.weeklyDetailService ?? new PayrollOvertimeWeeklyDetailService()
    this.unauthorizedService = deps?.unauthorizedService ?? new PayrollOvertimeUnauthorizedService()
  }

  /**
   * Pobla `overtime_weekly_details` para el histórico del rango indicado.
   *
   * Flujo: empresa de nómina → empleados paginados → calendario → medición →
   * reparto doble/triple → persistencia (omitida si `dryRun`).
   *
   * @returns Contadores de la corrida con marca de tiempo en `finishedAt`.
   */
  async runBackfill(options: PayrollOvertimeBackfillOptions): Promise<PayrollOvertimeBackfillSummary> {
    this.assertValidDateRange(options.from, options.to)

    const summary: PayrollOvertimeBackfillSummary = {
      payrollBusinessUnits: 0,
      employeesProcessed: 0,
      employeesSkippedNoPayroll: await this.countEmployeesWithoutPayrollBusinessUnit(),
      employeesSkippedUnresolved: 0,
      weeksPersisted: 0,
      totalDoubleMinutes: 0,
      totalTripleMinutes: 0,
      totalDoubleHours: 0,
      totalTripleHours: 0,
      errors: 0,
      finishedAt: '',
    }

    const payrollBusinessUnitIds = await this.resolvePayrollBusinessUnitIds(
      options.payrollBusinessUnitId
    )
    summary.payrollBusinessUnits = payrollBusinessUnitIds.length

    logger.info(
      `${LOG_PREFIX} Inicio backfill — empresas=${payrollBusinessUnitIds.length} ` +
        `rango=${options.from}..${options.to} dryRun=${!!options.dryRun}`
    )

    for (const payrollBusinessUnitId of payrollBusinessUnitIds) {
      const buBefore = this.snapshotBackfillCounters(summary)
      await this.processPayrollBusinessUnit(payrollBusinessUnitId, options, summary)
      this.logPayrollBusinessUnitBackfillProgress(
        payrollBusinessUnitId,
        buBefore,
        summary,
        options.dryRun
      )
    }

    summary.totalDoubleHours = this.allocationService.minutesToDisplayHours(
      summary.totalDoubleMinutes
    )
    summary.totalTripleHours = this.allocationService.minutesToDisplayHours(
      summary.totalTripleMinutes
    )
    summary.finishedAt = DateTime.utc().toISO() ?? new Date().toISOString()

    return summary
  }

  /**
   * Revierte el detalle migrado del rango mediante soft delete.
   *
   * Solo afecta semanas ISO que intersectan `--from`/`--to` y, opcionalmente,
   * la empresa de nómina indicada. Un re-backfill posterior restaura sin duplicar.
   */
  async runRevert(options: PayrollOvertimeRevertOptions): Promise<PayrollOvertimeRevertSummary> {
    this.assertValidDateRange(options.from, options.to)

    const summary: PayrollOvertimeRevertSummary = {
      payrollBusinessUnits: 0,
      recordsReverted: 0,
      isoWeeksInRange: 0,
      errors: 0,
      finishedAt: '',
    }

    const payrollBusinessUnitIds = options.payrollBusinessUnitId
      ? [options.payrollBusinessUnitId]
      : await this.weeklyDetailService.resolvePayrollBusinessUnitIdsInRange(
          options.from,
          options.to
        )

    summary.payrollBusinessUnits = payrollBusinessUnitIds.length
    summary.isoWeeksInRange = collectIsoWeeksInDateRange(options.from, options.to).length

    logger.info(
      `${LOG_PREFIX} Inicio revert — empresas=${payrollBusinessUnitIds.length} ` +
        `semanas_iso=${summary.isoWeeksInRange} rango=${options.from}..${options.to} ` +
        `dryRun=${!!options.dryRun}`
    )

    for (const payrollBusinessUnitId of payrollBusinessUnitIds) {
      try {
        const reverted = await this.weeklyDetailService.revertWeeklyDetailsByRange({
          from: options.from,
          to: options.to,
          payrollBusinessUnitId,
          dryRun: options.dryRun,
        })
        summary.recordsReverted += reverted
        logger.info(
          `${LOG_PREFIX} Empresa nómina ${payrollBusinessUnitId}: ` +
            `registros_${options.dryRun ? 'a_revertir' : 'revertidos'}=${reverted}`
        )
      } catch {
        summary.errors++
        logger.error(`${LOG_PREFIX} Empresa nómina ${payrollBusinessUnitId}: error en revert`)
      }
    }

    summary.finishedAt = DateTime.utc().toISO() ?? new Date().toISOString()

    return summary
  }

  private async processPayrollBusinessUnit(
    payrollBusinessUnitId: number,
    options: PayrollOvertimeBackfillOptions,
    summary: PayrollOvertimeBackfillSummary
  ): Promise<void> {
    let page = 1
    let hasMore = true

    while (hasMore) {
      const employees = await Employee.query()
        .where('payrollBusinessUnitId', payrollBusinessUnitId)
        .where('employeeAssistDiscriminator', 0)
        .orderBy('employeeId', 'asc')
        .paginate(page, PAGE_SIZE)

      if (employees.length === 0) {
        hasMore = false
        break
      }

      for (const employee of employees.all()) {
        await this.processEmployee(employee, options, summary)
      }

      page++
      hasMore = employees.hasMorePages
    }
  }

  private async processEmployee(
    employee: Employee,
    options: PayrollOvertimeBackfillOptions,
    summary: PayrollOvertimeBackfillSummary
  ): Promise<void> {
    if (!employee.payrollBusinessUnitId) {
      return
    }

    try {
      const result = await this.syncAssistsService.index(
        {
          date: options.from,
          dateEnd: options.to,
          employeeID: employee.employeeId,
          withOutExternal: true,
        },
        { page: 1, limit: 999999999999999 }
      )

      const data: any = result.data
      if (!data?.employeeCalendar) {
        summary.employeesProcessed++
        return
      }

      const measurement = await this.measurementService.measureEmployeeOvertime(
        employee,
        data.employeeCalendar
      )

      if (measurement.workingTimeRuleUnresolved) {
        summary.employeesSkippedUnresolved++
        summary.employeesProcessed++
        return
      }

      const allocation = this.allocationService.allocateFromMeasurement(employee, measurement)

      let extendedAllocation = null
      let extendedMeasurement = null
      if (isPayrollOvertimeIncludeUnauthorizedEnabled()) {
        extendedMeasurement = this.unauthorizedService.buildExtendedMeasurement(
          measurement,
          data.employeeCalendar
        )
        extendedAllocation = this.allocationService.allocateFromMeasurement(
          employee,
          extendedMeasurement
        )
      }

      summary.totalDoubleMinutes += allocation.totalDoubleMinutes
      summary.totalTripleMinutes += allocation.totalTripleMinutes
      summary.weeksPersisted += allocation.weeks.length

      if (!options.dryRun) {
        await this.weeklyDetailService.persistEmployeeAllocation(allocation, extendedAllocation)
      }

      summary.employeesProcessed++
    } catch {
      summary.errors++
    }
  }

  private async resolvePayrollBusinessUnitIds(
    payrollBusinessUnitId?: number
  ): Promise<number[]> {
    if (payrollBusinessUnitId) {
      return [payrollBusinessUnitId]
    }

    const rows = await Employee.query()
      .select('payrollBusinessUnitId')
      .whereNotNull('payrollBusinessUnitId')
      .groupBy('payrollBusinessUnitId')
      .orderBy('payrollBusinessUnitId', 'asc')

    return rows.map((row) => row.payrollBusinessUnitId)
  }

  private async countEmployeesWithoutPayrollBusinessUnit(): Promise<number> {
    const count = await Employee.query()
      .whereNull('payrollBusinessUnitId')
      .where('employeeAssistDiscriminator', 0)
      .count('* as total')

    return Number(count[0]?.$extras.total || 0)
  }

  private assertValidDateRange(from: string, to: string): void {
    const fromDate = DateTime.fromISO(from)
    const toDate = DateTime.fromISO(to)

    if (!fromDate.isValid || !toDate.isValid) {
      throw new Error('El rango de fechas no es válido. Use formato ISO (YYYY-MM-DD).')
    }

    if (fromDate > toDate) {
      throw new Error('La fecha inicial no puede ser posterior a la fecha final.')
    }
  }

  /** Captura contadores antes de procesar una empresa de nómina (log de avance). */
  private snapshotBackfillCounters(summary: PayrollOvertimeBackfillSummary) {
    return {
      employeesProcessed: summary.employeesProcessed,
      employeesSkippedUnresolved: summary.employeesSkippedUnresolved,
      weeksPersisted: summary.weeksPersisted,
      totalDoubleMinutes: summary.totalDoubleMinutes,
      totalTripleMinutes: summary.totalTripleMinutes,
      errors: summary.errors,
    }
  }

  /** Escribe en log el avance por empresa de nómina al cerrar cada lote. */
  private logPayrollBusinessUnitBackfillProgress(
    payrollBusinessUnitId: number,
    before: ReturnType<PayrollOvertimeBackfillService['snapshotBackfillCounters']>,
    summary: PayrollOvertimeBackfillSummary,
    dryRun?: boolean
  ): void {
    const employees = summary.employeesProcessed - before.employeesProcessed
    const weeks = summary.weeksPersisted - before.weeksPersisted
    const doubleMin = summary.totalDoubleMinutes - before.totalDoubleMinutes
    const tripleMin = summary.totalTripleMinutes - before.totalTripleMinutes
    const unresolved =
      summary.employeesSkippedUnresolved - before.employeesSkippedUnresolved
    const errors = summary.errors - before.errors
    const weeksLabel = dryRun ? 'semanas_a_persistir' : 'semanas_persistidas'

    logger.info(
      `${LOG_PREFIX} Empresa nómina ${payrollBusinessUnitId}: empleados=${employees} ` +
        `${weeksLabel}=${weeks} doble_min=${doubleMin} triple_min=${tripleMin} ` +
        `jornada_no_resuelta=${unresolved} errores=${errors}`
    )
  }
}

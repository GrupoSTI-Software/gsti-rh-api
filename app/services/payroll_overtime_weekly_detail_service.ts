import { DateTime } from 'luxon'
import OvertimeWeeklyDetail from '#models/overtime_weekly_detail'
import WorkingTimeRule from '#models/working_time_rule'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import type { IsoWeekKey } from '../interfaces/payroll_overtime_backfill_interface.js'
import type {
  PayrollOvertimeEmployeeAllocation,
  PayrollOvertimeWeekAllocation,
} from '../interfaces/payroll_overtime_allocation_interface.js'

const REVERT_PAGE_SIZE = 100

export interface PayrollOvertimeWeeklyDetailRevertOptions {
  from: string
  to: string
  payrollBusinessUnitId?: number
  dryRun?: boolean
}

/**
 * Recolecta las semanas ISO (lunes–domingo) que intersectan un rango de fechas.
 */
export function collectIsoWeeksInDateRange(from: string, to: string): IsoWeekKey[] {
  const weeks = new Map<string, IsoWeekKey>()
  let cursor = DateTime.fromISO(from, { zone: 'UTC' }).startOf('day')
  const end = DateTime.fromISO(to, { zone: 'UTC' }).startOf('day')

  if (!cursor.isValid || !end.isValid || cursor > end) {
    return []
  }

  while (cursor <= end) {
    const key = `${cursor.weekYear}:${cursor.weekNumber}`
    if (!weeks.has(key)) {
      weeks.set(key, {
        isoYear: cursor.weekYear,
        isoWeek: cursor.weekNumber,
      })
    }
    cursor = cursor.plus({ days: 1 })
  }

  return Array.from(weeks.values())
}

/**
 * Persistencia idempotente del desglose semanal de horas extra.
 * Usa `updateOrCreate` con `withTrashed()` para restaurar filas soft-deleted
 * sin duplicar la clave (empleado, año ISO, semana ISO).
 */
export default class PayrollOvertimeWeeklyDetailService {
  /**
   * Guarda o actualiza el desglose de todas las semanas ISO de un empleado.
   * Omite empleados sin empresa operativa o con jornada no resuelta.
   */
  async persistEmployeeAllocation(
    allocation: PayrollOvertimeEmployeeAllocation,
    extendedAllocation?: PayrollOvertimeEmployeeAllocation | null
  ): Promise<OvertimeWeeklyDetail[]> {
    const payrollBusinessUnitId =
      allocation.payrollBusinessUnitId ?? extendedAllocation?.payrollBusinessUnitId ?? null

    if (allocation.workingTimeRuleUnresolved || !payrollBusinessUnitId) {
      return []
    }

    const persisted: OvertimeWeeklyDetail[] = []

    for (const { week, extendedWeek } of this.mergeWeekAllocations(
      allocation,
      extendedAllocation
    )) {
      const record = await this.persistWeekAllocation(week, extendedWeek)
      if (record) {
        persisted.push(record)
      }
    }

    return persisted
  }

  /**
   * Inserta o actualiza una fila de detalle por semana ISO.
   * Restaura la fila si estaba soft-deleted (ciclo revert → re-backfill).
   */
  async persistWeekAllocation(
    week: PayrollOvertimeWeekAllocation,
    extendedWeek?: PayrollOvertimeWeekAllocation | null
  ): Promise<OvertimeWeeklyDetail | null> {
    const businessUnitId = week.businessUnitId ?? week.payrollBusinessUnitId
    if (!businessUnitId) {
      return null
    }

    const workingTimeRuleId = await this.resolveWorkingTimeRuleId(
      week.payrollBusinessUnitId,
      week.isoWeekYear,
      week.isoWeek
    )

    const searchKeys = {
      employeeId: week.employeeId,
      overtimeWeeklyDetailIsoYear: week.isoWeekYear,
      overtimeWeeklyDetailIsoWeek: week.isoWeek,
    }

    const payload = {
      businessUnitId,
      payrollBusinessUnitId: week.payrollBusinessUnitId,
      overtimeWeeklyDetailDoubleMinutes: week.doubleMinutes,
      overtimeWeeklyDetailTripleMinutes: week.tripleMinutes,
      overtimeWeeklyDetailExtendedDoubleMinutes: extendedWeek?.doubleMinutes ?? 0,
      overtimeWeeklyDetailExtendedTripleMinutes: extendedWeek?.tripleMinutes ?? 0,
      overtimeWeeklyDetailWeeklyCapHours: week.weeklyCapHours,
      workingTimeRuleId,
    }

    const existing = await OvertimeWeeklyDetail.query()
      .withTrashed()
      .where('employeeId', week.employeeId)
      .where('overtimeWeeklyDetailIsoYear', week.isoWeekYear)
      .where('overtimeWeeklyDetailIsoWeek', week.isoWeek)
      .first()

    if (existing) {
      if (existing.deletedAt) {
        await existing.restore()
      }
      existing.merge(payload)
      await existing.save()
      return existing
    }

    return OvertimeWeeklyDetail.create({
      ...searchKeys,
      ...payload,
    })
  }

  /**
   * Soft-delete del detalle semanal migrado en un rango de fechas.
   * Solo afecta semanas ISO que intersectan `--from`/`--to` y, opcionalmente,
   * la empresa de nómina indicada.
   */
  async revertWeeklyDetailsByRange(
    options: PayrollOvertimeWeeklyDetailRevertOptions
  ): Promise<number> {
    const isoWeeks = collectIsoWeeksInDateRange(options.from, options.to)
    if (isoWeeks.length === 0) {
      return 0
    }

    let page = 1
    let hasMore = true
    let reverted = 0

    while (hasMore) {
      let query = OvertimeWeeklyDetail.query().where((subQuery) => {
        for (const week of isoWeeks) {
          subQuery.orWhere((weekQuery) => {
            weekQuery
              .where('overtimeWeeklyDetailIsoYear', week.isoYear)
              .where('overtimeWeeklyDetailIsoWeek', week.isoWeek)
          })
        }
      })

      if (options.payrollBusinessUnitId) {
        query = query.where('payrollBusinessUnitId', options.payrollBusinessUnitId)
      }

      const records = await query
        .orderBy('overtimeWeeklyDetailId', 'asc')
        .paginate(page, REVERT_PAGE_SIZE)

      if (records.length === 0) {
        hasMore = false
        break
      }

      for (const record of records.all()) {
        if (!options.dryRun) {
          await record.delete()
        }
        reverted++
      }

      page++
      hasMore = records.hasMorePages
    }

    return reverted
  }

  /**
   * Empresas de nómina con detalle semanal en las semanas ISO del rango.
   * Usado por el orquestador de revert cuando no se acota `--payroll-business-unit-id`.
   */
  async resolvePayrollBusinessUnitIdsInRange(from: string, to: string): Promise<number[]> {
    const isoWeeks = collectIsoWeeksInDateRange(from, to)
    if (isoWeeks.length === 0) {
      return []
    }

    const rows = await OvertimeWeeklyDetail.query()
      .select('payrollBusinessUnitId')
      .where((subQuery) => {
        for (const week of isoWeeks) {
          subQuery.orWhere((weekQuery) => {
            weekQuery
              .where('overtimeWeeklyDetailIsoYear', week.isoYear)
              .where('overtimeWeeklyDetailIsoWeek', week.isoWeek)
          })
        }
      })
      .groupBy('payrollBusinessUnitId')
      .orderBy('payrollBusinessUnitId', 'asc')

    return rows.map((row) => row.payrollBusinessUnitId)
  }

  /**
   * Resuelve el id de la regla de jornada vigente para la empresa de nómina
   * en el lunes de la semana ISO (referencia determinista del tope semanal).
   */
  private async resolveWorkingTimeRuleId(
    payrollBusinessUnitId: number,
    isoWeekYear: number,
    isoWeek: number
  ): Promise<number | null> {
    const monday = DateTime.fromObject(
      { weekYear: isoWeekYear, weekNumber: isoWeek, weekday: 1 },
      { zone: 'UTC' }
    )

    if (!monday.isValid) {
      return null
    }

    const date = monday.toISODate()
    if (!date) {
      return null
    }

    const override = await WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .where('business_unit_id', payrollBusinessUnitId)
      .where('working_time_rule_valid_from', '<=', date)
      .where((sub) => {
        sub
          .whereNull('working_time_rule_valid_to')
          .orWhere('working_time_rule_valid_to', '>=', date)
      })
      .orderBy('working_time_rule_valid_from', 'desc')
      .first()

    if (override) {
      return override.workingTimeRuleId
    }

    const federal = await WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .whereNull('business_unit_id')
      .where('working_time_rule_country_code', DEFAULT_COUNTRY_CODE)
      .where('working_time_rule_valid_from', '<=', date)
      .where((sub) => {
        sub
          .whereNull('working_time_rule_valid_to')
          .orWhere('working_time_rule_valid_to', '>=', date)
      })
      .orderBy('working_time_rule_valid_from', 'desc')
      .first()

    return federal ? federal.workingTimeRuleId : null
  }

  private buildIsoWeekKey(isoWeekYear: number, isoWeek: number): string {
    return `${isoWeekYear}:${isoWeek}`
  }

  /**
   * Une semanas de la asignación autorizada y la extendida.
   * Si solo hay HE no autorizadas, crea filas con doble/triple en 0 y extended poblado.
   */
  private mergeWeekAllocations(
    allocation: PayrollOvertimeEmployeeAllocation,
    extendedAllocation?: PayrollOvertimeEmployeeAllocation | null
  ): Array<{
    week: PayrollOvertimeWeekAllocation
    extendedWeek: PayrollOvertimeWeekAllocation | null
  }> {
    const allocationByKey = new Map<string, PayrollOvertimeWeekAllocation>()
    for (const week of allocation.weeks) {
      allocationByKey.set(this.buildIsoWeekKey(week.isoWeekYear, week.isoWeek), week)
    }

    const extendedByKey = this.buildExtendedWeekMap(extendedAllocation)
    const allKeys = new Set([...allocationByKey.keys(), ...extendedByKey.keys()])
    const merged: Array<{
      week: PayrollOvertimeWeekAllocation
      extendedWeek: PayrollOvertimeWeekAllocation | null
    }> = []

    for (const key of allKeys) {
      const allocationWeek = allocationByKey.get(key)
      const extendedWeek = extendedByKey.get(key) ?? null

      if (allocationWeek) {
        merged.push({ week: allocationWeek, extendedWeek })
        continue
      }

      if (extendedWeek) {
        merged.push({
          week: this.buildAuthorizedShellWeek(extendedWeek),
          extendedWeek,
        })
      }
    }

    merged.sort((left, right) => {
      if (left.week.isoWeekYear !== right.week.isoWeekYear) {
        return left.week.isoWeekYear - right.week.isoWeekYear
      }
      return left.week.isoWeek - right.week.isoWeek
    })

    return merged
  }

  private buildAuthorizedShellWeek(
    extendedWeek: PayrollOvertimeWeekAllocation
  ): PayrollOvertimeWeekAllocation {
    return {
      ...extendedWeek,
      totalExtraordinaryMinutes: 0,
      doubleMinutes: 0,
      tripleMinutes: 0,
    }
  }

  private buildExtendedWeekMap(
    extendedAllocation?: PayrollOvertimeEmployeeAllocation | null
  ): Map<string, PayrollOvertimeWeekAllocation> {
    const map = new Map<string, PayrollOvertimeWeekAllocation>()
    if (!extendedAllocation) {
      return map
    }

    for (const week of extendedAllocation.weeks) {
      map.set(this.buildIsoWeekKey(week.isoWeekYear, week.isoWeek), week)
    }

    return map
  }
}

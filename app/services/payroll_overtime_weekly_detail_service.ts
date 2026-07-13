import { DateTime } from 'luxon'
import OvertimeWeeklyDetail from '#models/overtime_weekly_detail'
import WorkingTimeRule from '#models/working_time_rule'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import type {
  PayrollOvertimeEmployeeAllocation,
  PayrollOvertimeWeekAllocation,
} from '../interfaces/payroll_overtime_allocation_interface.js'

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
    allocation: PayrollOvertimeEmployeeAllocation
  ): Promise<OvertimeWeeklyDetail[]> {
    if (allocation.workingTimeRuleUnresolved || !allocation.payrollBusinessUnitId) {
      return []
    }

    const persisted: OvertimeWeeklyDetail[] = []

    for (const week of allocation.weeks) {
      const record = await this.persistWeekAllocation(week)
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
    week: PayrollOvertimeWeekAllocation
  ): Promise<OvertimeWeeklyDetail | null> {
    if (!week.businessUnitId) {
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
      businessUnitId: week.businessUnitId,
      payrollBusinessUnitId: week.payrollBusinessUnitId,
      overtimeWeeklyDetailDoubleMinutes: week.doubleMinutes,
      overtimeWeeklyDetailTripleMinutes: week.tripleMinutes,
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
}

import Employee from '#models/employee'
import WorkingTimeRule from '#models/working_time_rule'
import WorkJournalEntry from '#models/work_journal_entry'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import type { WorkJournalRepository } from './work_journal.repository.js'

/** Implementación Lucid/MySQL del repositorio de registro electrónico de jornada. */
export default class WorkJournalRepositoryMysql implements WorkJournalRepository {
  async listEmployees(businessUnitId: number, employeeIds?: number[]): Promise<Employee[]> {
    return Employee.query()
      .where('business_unit_id', businessUnitId)
      .if(employeeIds && employeeIds.length > 0, (query) => {
        query.whereIn('employee_id', employeeIds as number[])
      })
      .orderBy('employee_id', 'asc')
  }

  async listEntriesInRange(
    businessUnitId: number,
    employeeId: number,
    from: string,
    to: string
  ): Promise<WorkJournalEntry[]> {
    return WorkJournalEntry.query()
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .where('work_journal_entry_date', '>=', from)
      .where('work_journal_entry_date', '<=', to)
  }

  async listBusinessUnitEntriesInRange(
    businessUnitId: number,
    from: string,
    to: string,
    employeeIds?: number[]
  ): Promise<WorkJournalEntry[]> {
    return WorkJournalEntry.query()
      .where('business_unit_id', businessUnitId)
      .where('work_journal_entry_date', '>=', from)
      .where('work_journal_entry_date', '<=', to)
      .if(employeeIds && employeeIds.length > 0, (query) => {
        query.whereIn('employee_id', employeeIds as number[])
      })
      .orderBy('employee_id', 'asc')
      .orderBy('work_journal_entry_date', 'asc')
  }

  async paginateBusinessUnitEntries(
    businessUnitId: number,
    from: string,
    to: string,
    options: { employeeId?: number; status?: 'open' | 'closed'; page: number; limit: number }
  ) {
    return WorkJournalEntry.query()
      .where('business_unit_id', businessUnitId)
      .where('work_journal_entry_date', '>=', from)
      .where('work_journal_entry_date', '<=', to)
      .if(options.employeeId, (query) => {
        query.where('employee_id', options.employeeId as number)
      })
      .if(options.status, (query) => {
        query.where('work_journal_entry_status', options.status as string)
      })
      .orderBy('employee_id', 'asc')
      .orderBy('work_journal_entry_date', 'asc')
      .paginate(options.page, options.limit)
  }

  async resolveEffectiveRuleId(businessUnitId: number, date: string): Promise<number | null> {
    const override = await WorkingTimeRule.query()
      .whereNull('working_time_rule_deleted_at')
      .where('business_unit_id', businessUnitId)
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

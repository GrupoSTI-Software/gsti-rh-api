import { DateTime } from 'luxon'
import Employee from '#models/employee'
import EffectiveService from '#modules/working-time-rules/effective/effective.service'
import type { EffectiveRuleResult } from '#modules/working-time-rules/effective/dto/effective.dto'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import type {
  PayrollOvertimeDayMeasurement,
  PayrollOvertimeEmployeeMeasurement,
} from '../interfaces/payroll_overtime_measurement_interface.js'
import PayrollOvertimeUnauthorizedService from './payroll_overtime_unauthorized_service.js'

/**
 * Motor de medición de horas extra para el reporte de incidencias de nómina.
 * Consume `getRulesForDate`, mide en minutos y exporta estructura para ESB-08-12-03-02.
 */
export default class PayrollOvertimeMeasurementService {
  private readonly effectiveService: EffectiveService
  private readonly ruleCache = new Map<string, EffectiveRuleResult>()
  private readonly unauthorizedService: PayrollOvertimeUnauthorizedService

  constructor(
    effectiveService: EffectiveService = new EffectiveService(),
    unauthorizedService: PayrollOvertimeUnauthorizedService = new PayrollOvertimeUnauthorizedService()
  ) {
    this.effectiveService = effectiveService
    this.unauthorizedService = unauthorizedService
  }

  async measureEmployeeOvertime(
    employee: Employee,
    employeeCalendar: AssistDayInterface[]
  ): Promise<PayrollOvertimeEmployeeMeasurement> {
    const payrollBusinessUnitId = employee.payrollBusinessUnitId ?? null

    if (!payrollBusinessUnitId) {
      return {
        employeeId: employee.employeeId,
        payrollBusinessUnitId: null,
        totalExtraordinaryMinutes: 0,
        workingTimeRuleUnresolved: true,
        days: [],
      }
    }

    const days: PayrollOvertimeDayMeasurement[] = []
    let totalExtraordinaryMinutes = 0
    let workingTimeRuleUnresolved = false

    for (const calendar of employeeCalendar) {
      if (calendar.assist.isFutureDay) {
        continue
      }

      const dayMinutes = this.unauthorizedService.measureAuthorizedExceptionMinutes(
        calendar.assist.exceptions
      )
      const ruleResult = await this.resolveRulesForDate(payrollBusinessUnitId, calendar.day)
      const dayUnresolved = dayMinutes > 0 && ruleResult.effective === null

      if (dayUnresolved) {
        workingTimeRuleUnresolved = true
      }

      totalExtraordinaryMinutes += dayMinutes

      const dateTime = DateTime.fromISO(calendar.day)
      days.push({
        employeeId: employee.employeeId,
        date: calendar.day,
        isoWeekYear: dateTime.weekYear,
        isoWeek: dateTime.weekNumber,
        extraordinaryMinutes: dayMinutes,
        maxWeeklyOvertimeHours: ruleResult.effective?.maxWeeklyOvertimeHours ?? null,
        maxDailyOvertimeHours: ruleResult.effective?.maxDailyOvertimeHours ?? null,
        effectiveYear: ruleResult.effective?.effectiveYear ?? null,
        ruleSource: ruleResult.source,
        workingTimeRuleResolved: ruleResult.effective !== null,
      })
    }

    if (workingTimeRuleUnresolved) {
      totalExtraordinaryMinutes = 0
    }

    return {
      employeeId: employee.employeeId,
      payrollBusinessUnitId,
      totalExtraordinaryMinutes,
      workingTimeRuleUnresolved,
      days,
    }
  }

  minutesToDisplayHours(minutes: number): number {
    if (minutes <= 0) {
      return 0
    }
    return Number((minutes / 60).toFixed(2))
  }

  private async resolveRulesForDate(
    payrollBusinessUnitId: number,
    date: string
  ): Promise<EffectiveRuleResult> {
    const cacheKey = `${payrollBusinessUnitId}:${date}`
    const cached = this.ruleCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const result = await this.effectiveService.getRulesForDate(payrollBusinessUnitId, date)
    this.ruleCache.set(cacheKey, result)
    return result
  }
}

import { DateTime } from 'luxon'
import Employee from '#models/employee'
import EffectiveService from '#modules/working-time-rules/effective/effective.service'
import type { EffectiveRuleResult } from '#modules/working-time-rules/effective/dto/effective.dto'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import { ShiftExceptionInterface } from '../interfaces/shift_exception_interface.js'
import type {
  PayrollOvertimeDayMeasurement,
  PayrollOvertimeEmployeeMeasurement,
} from '../interfaces/payroll_overtime_measurement_interface.js'

const OVERTIME_EXCEPTION_SLUG = 'working-during-non-working-hours'

/**
 * Motor de medición de horas extra para el reporte de incidencias de nómina.
 * Consume `getRulesForDate`, mide en minutos y exporta estructura para ESB-08-12-03-02.
 */
export default class PayrollOvertimeMeasurementService {
  private readonly effectiveService: EffectiveService
  private readonly ruleCache = new Map<string, EffectiveRuleResult>()

  constructor(effectiveService: EffectiveService = new EffectiveService()) {
    this.effectiveService = effectiveService
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

      const dayMinutes = this.sumExceptionOvertimeMinutes(calendar.assist.exceptions)
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

  private sumExceptionOvertimeMinutes(exceptions: ShiftExceptionInterface[]): number {
    let totalMinutes = 0

    for (const exception of exceptions) {
      if (
        exception.exceptionType?.exceptionTypeSlug !== OVERTIME_EXCEPTION_SLUG ||
        exception.shiftExceptionEnjoymentOfSalary !== 1
      ) {
        continue
      }

      totalMinutes += this.measureExceptionMinutes(exception)
    }

    return totalMinutes
  }

  /**
   * Mide la duración de la excepción en minutos (simetría entrada/salida).
   * No recorta por tolerancia: usa los horarios declarados en la excepción.
   */
  private measureExceptionMinutes(exception: ShiftExceptionInterface): number {
    if (!exception.shiftExceptionCheckInTime || !exception.shiftExceptionCheckOutTime) {
      return 0
    }

    const checkIn = DateTime.fromFormat(exception.shiftExceptionCheckInTime, 'HH:mm:ss')
    const checkOut = DateTime.fromFormat(exception.shiftExceptionCheckOutTime, 'HH:mm:ss')

    if (!checkIn.isValid || !checkOut.isValid) {
      return 0
    }

    let minutes = checkOut.diff(checkIn, 'minutes').minutes
    if (minutes < 0) {
      minutes += 24 * 60
    }

    return Math.max(0, Math.round(minutes))
  }
}

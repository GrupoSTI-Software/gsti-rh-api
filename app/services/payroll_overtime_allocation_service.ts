import Employee from '#models/employee'
import type { PayrollOvertimeDayMeasurement } from '../interfaces/payroll_overtime_measurement_interface.js'
import type {
  PayrollOvertimeAllocationInput,
  PayrollOvertimeEmployeeAllocation,
  PayrollOvertimeWeekAllocation,
} from '../interfaces/payroll_overtime_allocation_interface.js'

/**
 * Reparto doble/triple del tiempo extraordinario acumulado por semana ISO.
 * Recibe la medición en minutos por día (USRH1783692104352) y aplica el tope
 * semanal legal (`maxWeeklyOvertimeHours`) sin truncar a horas antes de acumular.
 */
export default class PayrollOvertimeAllocationService {
  /**
   * Reparte el tiempo extraordinario de un empleado por semana ISO.
   * Agrupa los minutos por día, aplica el tope semanal legal y devuelve
   * totales doble/triple más el desglose semanal para persistir o reportar.
   */
  allocateFromMeasurement(
    employee: Employee,
    measurement: PayrollOvertimeAllocationInput
  ): PayrollOvertimeEmployeeAllocation {
    const businessUnitId = employee.businessUnitId ?? null

    if (
      measurement.workingTimeRuleUnresolved ||
      !measurement.payrollBusinessUnitId ||
      measurement.days.length === 0
    ) {
      return this.buildEmptyAllocation(
        measurement.employeeId,
        businessUnitId,
        measurement.payrollBusinessUnitId,
        measurement.workingTimeRuleUnresolved
      )
    }

    const weeksByIsoKey = this.groupDaysByIsoWeek(measurement.days)
    const weeks: PayrollOvertimeWeekAllocation[] = []
    let totalDoubleMinutes = 0
    let totalTripleMinutes = 0

    for (const weekDays of weeksByIsoKey.values()) {
      const weekAllocation = this.allocateIsoWeek(
        measurement.employeeId,
        businessUnitId,
        measurement.payrollBusinessUnitId,
        weekDays
      )

      if (!weekAllocation) {
        continue
      }

      weeks.push(weekAllocation)
      totalDoubleMinutes += weekAllocation.doubleMinutes
      totalTripleMinutes += weekAllocation.tripleMinutes
    }

    weeks.sort((left, right) => {
      if (left.isoWeekYear !== right.isoWeekYear) {
        return left.isoWeekYear - right.isoWeekYear
      }
      return left.isoWeek - right.isoWeek
    })

    return {
      employeeId: measurement.employeeId,
      businessUnitId,
      payrollBusinessUnitId: measurement.payrollBusinessUnitId,
      workingTimeRuleUnresolved: false,
      totalDoubleMinutes,
      totalTripleMinutes,
      weeks,
    }
  }

  /**
   * Convierte minutos a horas con dos decimales para el Excel de nómina.
   * No trunca: preserva la precisión acumulada en minutos.
   */
  minutesToDisplayHours(minutes: number): number {
    if (minutes <= 0) {
      return 0
    }
    return Number((minutes / 60).toFixed(2))
  }

  /**
   * Resultado vacío cuando el empleado no participa del reparto
   * (sin empresa de nómina, jornada no resuelta o sin días medidos).
   */
  private buildEmptyAllocation(
    employeeId: number,
    businessUnitId: number | null,
    payrollBusinessUnitId: number | null,
    workingTimeRuleUnresolved: boolean
  ): PayrollOvertimeEmployeeAllocation {
    return {
      employeeId,
      businessUnitId,
      payrollBusinessUnitId,
      workingTimeRuleUnresolved,
      totalDoubleMinutes: 0,
      totalTripleMinutes: 0,
      weeks: [],
    }
  }

  /**
   * Agrupa los días con tiempo extraordinario por clave de semana ISO
   * (`isoWeekYear:isoWeek`). Omite días sin minutos extraordinarios.
   */
  private groupDaysByIsoWeek(
    days: PayrollOvertimeDayMeasurement[]
  ): Map<string, PayrollOvertimeDayMeasurement[]> {
    const weeks = new Map<string, PayrollOvertimeDayMeasurement[]>()

    for (const day of days) {
      if (day.extraordinaryMinutes <= 0) {
        continue
      }

      const key = this.buildIsoWeekKey(day.isoWeekYear, day.isoWeek)
      const bucket = weeks.get(key) ?? []
      bucket.push(day)
      weeks.set(key, bucket)
    }

    return weeks
  }

  /**
   * Reparte una semana ISO: lo que cabe en el tope semanal va al doble,
   * el excedente al triple. Todo el cálculo se hace en minutos enteros.
   */
  private allocateIsoWeek(
    employeeId: number,
    businessUnitId: number | null,
    payrollBusinessUnitId: number,
    weekDays: PayrollOvertimeDayMeasurement[]
  ): PayrollOvertimeWeekAllocation | null {
    const totalExtraordinaryMinutes = weekDays.reduce(
      (sum, day) => sum + day.extraordinaryMinutes,
      0
    )

    if (totalExtraordinaryMinutes <= 0) {
      return null
    }

    const referenceDay = this.resolveReferenceDay(weekDays)
    if (!referenceDay || referenceDay.maxWeeklyOvertimeHours === null) {
      return null
    }

    const weeklyCapMinutes = this.hoursToMinutes(referenceDay.maxWeeklyOvertimeHours)
    const doubleMinutes = Math.min(totalExtraordinaryMinutes, weeklyCapMinutes)
    const tripleMinutes = totalExtraordinaryMinutes - doubleMinutes

    return {
      employeeId,
      businessUnitId,
      payrollBusinessUnitId,
      isoWeekYear: referenceDay.isoWeekYear,
      isoWeek: referenceDay.isoWeek,
      totalExtraordinaryMinutes,
      doubleMinutes,
      tripleMinutes,
      weeklyCapHours: referenceDay.maxWeeklyOvertimeHours,
      effectiveYear: referenceDay.effectiveYear,
      ruleSource: referenceDay.ruleSource,
    }
  }

  /**
   * Selecciona un día de la semana con jornada resuelta para tomar el tope
   * semanal (`maxWeeklyOvertimeHours`) y la trazabilidad de la regla aplicada.
   * La clave ISO (`isoWeekYear`/`isoWeek`) ya fija el año de la semana.
   */
  private resolveReferenceDay(
    weekDays: PayrollOvertimeDayMeasurement[]
  ): PayrollOvertimeDayMeasurement | null {
    return (
      weekDays.find(
        (day) => day.workingTimeRuleResolved && day.maxWeeklyOvertimeHours !== null
      ) ?? null
    )
  }

  /** Construye la clave única de acumulación por semana ISO. */
  private buildIsoWeekKey(isoWeekYear: number, isoWeek: number): string {
    return `${isoWeekYear}:${isoWeek}`
  }

  /** Convierte horas decimales del tope legal a minutos enteros para el reparto. */
  private hoursToMinutes(hours: number): number {
    return Math.round(hours * 60)
  }
}

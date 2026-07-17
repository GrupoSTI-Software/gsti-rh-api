import { DateTime } from 'luxon'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import { AssistInterface } from '../interfaces/assist_interface.js'
import { ShiftExceptionInterface } from '../interfaces/shift_exception_interface.js'
import type {
  PayrollOvertimeDayMeasurement,
  PayrollOvertimeEmployeeMeasurement,
} from '../interfaces/payroll_overtime_measurement_interface.js'

const OVERTIME_EXCEPTION_SLUG = 'working-during-non-working-hours'
/** Misma zona fija que `sync_assists_service` para leer marcas biométricas. */
const ASSISTS_TIME_ZONE = 'UTC-6'
/** Ventana de marcas válidas alrededor del turno (igual que asistencias). */
const SHIFT_PUNCH_WINDOW_HOURS = 3

interface MinuteRange {
  start: number
  end: number
}

interface ShiftBounds {
  expectedStartMin: number
  expectedEndMin: number
}

/**
 * Mide minutos de HE no autorizados por biométrico (entrada antes / salida después
 * del turno) y construye la medición extendida con checador + tramos de excepción
 * que exceden la presencia real del empleado.
 * Las excepciones autorizadas completas se reportan en las columnas normales.
 */
export default class PayrollOvertimeUnauthorizedService {
  /**
   * Construye la medición extendida con marcas del checador más los minutos de
   * excepción autorizada que quedan fuera del rango entrada→salida del empleado.
   */
  buildExtendedMeasurement(
    authorized: PayrollOvertimeEmployeeMeasurement,
    employeeCalendar: AssistDayInterface[]
  ): PayrollOvertimeEmployeeMeasurement {
    const calendarByDay = new Map(employeeCalendar.map((day) => [day.day, day]))

    const days: PayrollOvertimeDayMeasurement[] = authorized.days.map((day) => {
      const calendar = calendarByDay.get(day.date)
      const punchMinutes = calendar ? this.measurePunchOvertimeDayMinutes(calendar) : 0
      const exceptionOutsidePunchMinutes = calendar
        ? this.measureAuthorizedExceptionMinutesOutsidePunchForCalendar(calendar)
        : 0

      return {
        ...day,
        extraordinaryMinutes: punchMinutes + exceptionOutsidePunchMinutes,
      }
    })

    const totalExtraordinaryMinutes = days.reduce(
      (sum, day) => sum + day.extraordinaryMinutes,
      0
    )

    return {
      ...authorized,
      totalExtraordinaryMinutes,
      days,
    }
  }

  /**
   * Minutos del checador (entrada anticipada / salida tardía) que no están ya
   * cubiertos por una excepción autorizada dentro del mismo rango.
   */
  measureUnauthorizedMinutes(calendar: AssistDayInterface): number {
    const punchMinutes = this.measurePunchOvertimeDayMinutes(calendar)
    const authorizedMinutes = this.measureAuthorizedExceptionMinutes(calendar.assist.exceptions)

    return Math.max(0, punchMinutes - authorizedMinutes)
  }

  /**
   * Total extendido del día = solo marcas del checador fuera del turno nominal.
   */
  measurePunchOvertimeDayMinutes(calendar: AssistDayInterface): number {
    const assist = calendar.assist

    if (
      assist.isFutureDay ||
      assist.isRestDay ||
      assist.isVacationDate ||
      assist.isHoliday ||
      assist.isWorkDisabilityDate ||
      !assist.dateShift
    ) {
      return 0
    }

    const dayStart = this.resolveDayStart(calendar.day)
    if (!dayStart.isValid) {
      return 0
    }

    const bounds = this.resolveShiftBounds(
      calendar.day,
      assist.dateShift.shiftTimeStart,
      assist.dateShift.shiftActiveHours,
      dayStart
    )
    if (!bounds) {
      return 0
    }

    return this.sumMergedMinuteRanges(
      this.collectPunchOvertimeRanges(calendar.day, assist, bounds, dayStart)
    )
  }

  private collectPunchOvertimeRanges(
    day: string,
    assist: AssistDayInterface['assist'],
    bounds: ShiftBounds,
    dayStart: DateTime
  ): MinuteRange[] {
    const ranges: MinuteRange[] = []

    let checkInPunch = this.resolveCheckInPunch(day, assist, bounds)
    let checkOutPunch = this.resolveCheckOutPunch(day, assist, bounds)
    ;({ checkIn: checkInPunch, checkOut: checkOutPunch } = this.correctBiometricCalendarShift(
      checkInPunch,
      checkOutPunch,
      bounds,
      dayStart
    ))

    const checkInMin = this.minutesFromDayStart(checkInPunch, dayStart)
    if (checkInMin !== null && checkInMin < bounds.expectedStartMin) {
      ranges.push({ start: checkInMin, end: bounds.expectedStartMin })
    }

    const checkOutMin = this.minutesFromDayStart(checkOutPunch, dayStart)
    if (checkOutMin !== null && checkOutMin > bounds.expectedEndMin) {
      ranges.push({ start: bounds.expectedEndMin, end: checkOutMin })
    }

    return ranges
  }

  /**
   * Corrige desfase de 1 h del calendario de asistencias cuando el biométrico
   * guarda con offset +5 y sync_assists reinterpreta con UTC-6 civil.
   * Síntoma: entrada ~1 h antes del turno y salida ~1 h antes de la real.
   */
  private correctBiometricCalendarShift(
    checkInPunch: DateTime | null,
    checkOutPunch: DateTime | null,
    bounds: ShiftBounds,
    dayStart: DateTime
  ): { checkIn: DateTime | null; checkOut: DateTime | null } {
    if (!checkInPunch?.isValid) {
      return { checkIn: checkInPunch, checkOut: checkOutPunch }
    }

    const checkInMin = checkInPunch.diff(dayStart, 'minutes').minutes
    if (checkInMin >= bounds.expectedStartMin) {
      return { checkIn: checkInPunch, checkOut: checkOutPunch }
    }

    const correctedIn = checkInPunch.plus({ hours: 1 })
    const correctedInMin = correctedIn.diff(dayStart, 'minutes').minutes
    if (correctedInMin <= bounds.expectedStartMin) {
      return { checkIn: checkInPunch, checkOut: checkOutPunch }
    }

    return {
      checkIn: correctedIn,
      checkOut: checkOutPunch?.isValid ? checkOutPunch.plus({ hours: 1 }) : checkOutPunch,
    }
  }

  /**
   * Marca de entrada asignada por el calendario de asistencias.
   */
  private resolveCheckInPunch(
    day: string,
    assist: AssistDayInterface['assist'],
    bounds: ShiftBounds
  ): DateTime | null {
    const assigned = this.parseCalendarAssistPunch(assist.checkIn?.assistPunchTimeUtc, day)
    if (assigned) {
      return assigned
    }

    const flatList = this.filterShiftFlatList(day, assist, bounds)
    return flatList.length > 0
      ? this.parseCalendarAssistPunch(flatList[0].assistPunchTimeUtc, day)
      : null
  }

  /**
   * Marca de salida asignada por el calendario de asistencias.
   */
  private resolveCheckOutPunch(
    day: string,
    assist: AssistDayInterface['assist'],
    bounds: ShiftBounds
  ): DateTime | null {
    const assigned = this.parseCalendarAssistPunch(assist.checkOut?.assistPunchTimeUtc, day)
    if (assigned) {
      return assigned
    }

    const flatList = this.filterShiftFlatList(day, assist, bounds)
    return flatList.length > 0
      ? this.parseCalendarAssistPunch(flatList[flatList.length - 1].assistPunchTimeUtc, day)
      : null
  }

  /**
   * Filtra marcas del día al turno vigente (±3 h), igual que `sync_assists_service`.
   */
  private filterShiftFlatList(
    day: string,
    assist: AssistDayInterface['assist'],
    bounds: ShiftBounds
  ): AssistInterface[] {
    const dayStart = this.resolveDayStart(day)
    const windowStart = dayStart
      .plus({ minutes: bounds.expectedStartMin })
      .minus({ hours: SHIFT_PUNCH_WINDOW_HOURS })
    const windowEnd = dayStart
      .plus({ minutes: bounds.expectedEndMin })
      .plus({ hours: SHIFT_PUNCH_WINDOW_HOURS })

    return (assist.assitFlatList ?? [])
      .filter((record) => record.assistUsed === false)
      .map((record) => ({
        record,
        punch: this.parseCalendarAssistPunch(record.assistPunchTimeUtc, day),
      }))
      .filter((item): item is { record: AssistInterface; punch: DateTime } =>
        !!item.punch && item.punch >= windowStart && item.punch <= windowEnd
      )
      .sort((left, right) => left.punch.toMillis() - right.punch.toMillis())
      .map((item) => item.record)
  }

  private resolveDayStart(day: string): DateTime {
    return DateTime.fromISO(`${day}T00:00:00.000-06:00`, { setZone: true }).setZone(ASSISTS_TIME_ZONE)
  }

  /**
   * Lee la hora de pared que el calendario de asistencias guardó en assistPunchTimeUtc.
   * Tras sync_assists, el campo conserva HH:mm:ss civil aunque la zona sea UTC.
   */
  private parseCalendarAssistPunch(
    punchUtc: DateTime | string | null | undefined,
    day: string
  ): DateTime | null {
    if (!punchUtc) {
      return null
    }

    const stored = DateTime.fromISO(punchUtc.toString(), { zone: 'utc' })
    if (!stored.isValid) {
      return null
    }

    const punch = DateTime.fromISO(`${day}T${stored.toFormat('HH:mm:ss')}.000-06:00`, {
      setZone: true,
    })
    return punch.isValid ? punch : null
  }

  private minutesFromDayStart(punch: DateTime | null, dayStart: DateTime): number | null {
    if (!punch?.isValid) {
      return null
    }

    return punch.diff(dayStart, 'minutes').minutes
  }

  private resolveShiftBounds(
    day: string,
    shiftTimeStart: string,
    shiftActiveHours: number,
    dayStart: DateTime
  ): ShiftBounds | null {
    const normalizedStart = this.normalizeClockTime(shiftTimeStart)
    if (!normalizedStart) {
      return null
    }

    const expectedStart = DateTime.fromISO(`${day}T${normalizedStart}.000-06:00`, {
      setZone: true,
    }).setZone(ASSISTS_TIME_ZONE)
    if (!expectedStart.isValid) {
      return null
    }

    // Fin nominal del turno (ej. 07:00 + 10 h = 17:00), alineado al horario mostrado en UI.
    const expectedEnd = expectedStart.plus({
      minutes: Math.round(shiftActiveHours * 60),
    })

    return {
      expectedStartMin: expectedStart.diff(dayStart, 'minutes').minutes,
      expectedEndMin: expectedEnd.diff(dayStart, 'minutes').minutes,
    }
  }

  /**
   * Minutos totales de excepción autorizada declarada (columnas normales).
   */
  measureAuthorizedExceptionMinutes(exceptions: ShiftExceptionInterface[]): number {
    let totalMinutes = 0

    for (const exception of exceptions) {
      if (!this.isAuthorizedOvertimeException(exception)) {
        continue
      }

      totalMinutes += this.measureExceptionDurationMinutes(
        exception.shiftExceptionCheckInTime!,
        exception.shiftExceptionCheckOutTime!
      )
    }

    return totalMinutes
  }

  /**
   * Minutos de excepción autorizada que quedan fuera de la presencia real del checador.
   * Ej.: excepción 17:00–19:00 y salida 18:00 → 60 min se suman al extendido.
   */
  measureAuthorizedExceptionMinutesOutsidePunchForCalendar(
    calendar: AssistDayInterface
  ): number {
    const punchRange = this.resolvePunchPresenceRange(calendar)
    if (!punchRange) {
      return this.measureAuthorizedExceptionMinutes(calendar.assist.exceptions)
    }

    const dayStart = this.resolveDayStart(calendar.day)
    if (!dayStart.isValid) {
      return 0
    }

    const outsideRanges: MinuteRange[] = []

    for (const exception of calendar.assist.exceptions) {
      if (!this.isAuthorizedOvertimeException(exception)) {
        continue
      }

      const exceptionRange = this.collectAuthorizedExceptionRange(
        exception,
        calendar.day,
        dayStart
      )
      if (!exceptionRange) {
        continue
      }

      outsideRanges.push(...this.subtractMinuteRange(exceptionRange, punchRange))
    }

    return this.sumMergedMinuteRanges(outsideRanges)
  }

  private resolvePunchPresenceRange(calendar: AssistDayInterface): MinuteRange | null {
    const assist = calendar.assist

    if (
      assist.isFutureDay ||
      assist.isRestDay ||
      assist.isVacationDate ||
      assist.isHoliday ||
      assist.isWorkDisabilityDate ||
      !assist.dateShift
    ) {
      return null
    }

    const dayStart = this.resolveDayStart(calendar.day)
    if (!dayStart.isValid) {
      return null
    }

    const bounds = this.resolveShiftBounds(
      calendar.day,
      assist.dateShift.shiftTimeStart,
      assist.dateShift.shiftActiveHours,
      dayStart
    )
    if (!bounds) {
      return null
    }

    let checkInPunch = this.resolveCheckInPunch(calendar.day, assist, bounds)
    let checkOutPunch = this.resolveCheckOutPunch(calendar.day, assist, bounds)
    ;({ checkIn: checkInPunch, checkOut: checkOutPunch } = this.correctBiometricCalendarShift(
      checkInPunch,
      checkOutPunch,
      bounds,
      dayStart
    ))

    const punchInMin = this.minutesFromDayStart(checkInPunch, dayStart)
    const punchOutMin = this.minutesFromDayStart(checkOutPunch, dayStart)
    if (punchInMin === null || punchOutMin === null || punchOutMin <= punchInMin) {
      return null
    }

    return { start: punchInMin, end: punchOutMin }
  }

  private collectAuthorizedExceptionRange(
    exception: ShiftExceptionInterface,
    day: string,
    dayStart: DateTime
  ): MinuteRange | null {
    const startMin = this.parseExceptionClockToMinutesFromDayStart(
      exception.shiftExceptionCheckInTime!,
      day,
      dayStart
    )
    let endMin = this.parseExceptionClockToMinutesFromDayStart(
      exception.shiftExceptionCheckOutTime!,
      day,
      dayStart
    )

    if (startMin === null || endMin === null) {
      return null
    }

    if (endMin < startMin) {
      endMin += 24 * 60
    }

    return { start: startMin, end: endMin }
  }

  private parseExceptionClockToMinutesFromDayStart(
    time: string,
    day: string,
    dayStart: DateTime
  ): number | null {
    const normalized = this.normalizeClockTime(time)
    if (!normalized) {
      return null
    }

    const dateTime = DateTime.fromISO(`${day}T${normalized}.000-06:00`, { setZone: true })
    if (!dateTime.isValid) {
      return null
    }

    return dateTime.diff(dayStart, 'minutes').minutes
  }

  private subtractMinuteRange(container: MinuteRange, exclusion: MinuteRange): MinuteRange[] {
    if (exclusion.end <= container.start || exclusion.start >= container.end) {
      return [container]
    }

    const remaining: MinuteRange[] = []

    if (exclusion.start > container.start) {
      remaining.push({
        start: container.start,
        end: Math.min(exclusion.start, container.end),
      })
    }

    if (exclusion.end < container.end) {
      remaining.push({
        start: Math.max(exclusion.end, container.start),
        end: container.end,
      })
    }

    return remaining.filter((range) => range.end > range.start)
  }

  private isAuthorizedOvertimeException(exception: ShiftExceptionInterface): boolean {
    return (
      exception.exceptionType?.exceptionTypeSlug === OVERTIME_EXCEPTION_SLUG &&
      Number(exception.shiftExceptionEnjoymentOfSalary) === 1 &&
      !!exception.shiftExceptionCheckInTime &&
      !!exception.shiftExceptionCheckOutTime
    )
  }

  private measureExceptionDurationMinutes(checkInTime: string, checkOutTime: string): number {
    const checkIn = this.parseClockTime(checkInTime)
    const checkOut = this.parseClockTime(checkOutTime)

    if (!checkIn?.isValid || !checkOut?.isValid) {
      return 0
    }

    let minutes = checkOut.diff(checkIn, 'minutes').minutes
    if (minutes < 0) {
      minutes += 24 * 60
    }

    return Math.max(0, Math.round(minutes))
  }

  private sumMergedMinuteRanges(ranges: MinuteRange[]): number {
    if (ranges.length === 0) {
      return 0
    }

    const merged = this.mergeMinuteRanges(
      ranges.filter((range) => range.end > range.start)
    )

    return Math.max(
      0,
      Math.round(merged.reduce((sum, range) => sum + (range.end - range.start), 0))
    )
  }

  private mergeMinuteRanges(ranges: MinuteRange[]): MinuteRange[] {
    if (ranges.length === 0) {
      return []
    }

    const sorted = [...ranges].sort((left, right) => left.start - right.start)
    const merged: MinuteRange[] = [{ ...sorted[0] }]

    for (let index = 1; index < sorted.length; index++) {
      const current = sorted[index]
      const last = merged[merged.length - 1]

      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end)
      } else {
        merged.push({ ...current })
      }
    }

    return merged
  }

  private parseClockTime(time: string): DateTime | null {
    const trimmed = time?.trim()
    if (!trimmed) {
      return null
    }

    if (trimmed.includes('T')) {
      const iso = DateTime.fromISO(trimmed)
      if (iso.isValid) {
        return iso
      }
    }

    const normalized = trimmed.length === 5 ? `${trimmed}:00` : trimmed
    const fromIso = DateTime.fromISO(`1970-01-01T${normalized}`)
    if (fromIso.isValid) {
      return fromIso
    }

    for (const format of ['HH:mm:ss', 'HH:mm'] as const) {
      const parsed = DateTime.fromFormat(trimmed, format)
      if (parsed.isValid) {
        return parsed
      }
    }

    return null
  }

  private normalizeClockTime(time: string): string | null {
    const trimmed = time?.trim()
    if (!trimmed) {
      return null
    }

    if (trimmed.includes('T')) {
      const iso = DateTime.fromISO(trimmed)
      return iso.isValid ? iso.toFormat('HH:mm:ss') : null
    }

    return trimmed.length === 5 ? `${trimmed}:00` : trimmed
  }
}

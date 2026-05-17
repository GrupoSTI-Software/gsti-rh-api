import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Assist from '#models/assist'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export type AssistType = 'on_time' | 'tolerance' | 'delay' | 'fault'

/** Zona del calendario de negocio (misma que usa SyncAssists en UTC-6 / México). */
export const DEMO_ASSIST_CALENDAR_ZONE = 'America/Mexico_City'

export function demoAssistNow(): DateTime {
  return DateTime.now().setZone(DEMO_ASSIST_CALENDAR_ZONE)
}

export interface AssistDayConfig {
  /** Día laboral `yyyy-MM-dd` en calendario de negocio (no usar Date del servidor). */
  workDate:             string
  shiftTimeStart:       string
  shiftActiveHours:     number
  delayToleranceMinutes: number
  faultToleranceMinutes: number
  type:                 AssistType
}

// ---------------------------------------------------------------------------
// Distribución demo (monitor): mayoría a tiempo, retrasos, tolerancias, pocas faltas.
// Por mes calendario (`yyyy-MM` en zona negocio).
// ---------------------------------------------------------------------------

const DEMO_SHARE_ON_TIME     = 0.83
const DEMO_SHARE_DELAY       = 0.10
const DEMO_SHARE_TOLERANCE   = 0.05
const DEMO_SHARE_FAULT       = 0.02

export function distributeWorkDaysDemoProportions(workDays: string[]): {
  onTimeDays: string[]
  toleranceDays: string[]
  delayDays: string[]
  faultDays: string[]
} {
  const totalDays = workDays.length
  if (totalDays === 0) {
    return { onTimeDays: [], toleranceDays: [], delayDays: [], faultDays: [] }
  }

  const faultCount    = Math.min(totalDays, Math.max(0, Math.round(totalDays * DEMO_SHARE_FAULT)))
  const remainingDays = totalDays - faultCount

  let onTimeCount     = Math.round(totalDays * DEMO_SHARE_ON_TIME)
  let delayCount      = Math.round(totalDays * DEMO_SHARE_DELAY)
  let toleranceCount  = Math.round(totalDays * DEMO_SHARE_TOLERANCE)

  let totalAssigned = onTimeCount + delayCount + toleranceCount

  if (totalAssigned > remainingDays) {
    const excess          = totalAssigned - remainingDays
    const delayFactor     = delayCount / totalAssigned
    const toleranceFactor = toleranceCount / totalAssigned
    const onTimeFactor    = onTimeCount / totalAssigned

    delayCount      = Math.max(0, Math.round(delayCount - excess * delayFactor))
    toleranceCount  = Math.max(0, Math.round(toleranceCount - excess * toleranceFactor))
    onTimeCount     = Math.max(0, Math.round(onTimeCount - excess * onTimeFactor))

    totalAssigned = onTimeCount + delayCount + toleranceCount
    if (totalAssigned > remainingDays) {
      onTimeCount = Math.max(0, onTimeCount - (totalAssigned - remainingDays))
    }
  } else if (totalAssigned < remainingDays) {
    onTimeCount += remainingDays - totalAssigned
  }

  const shuffled       = [...workDays].sort(() => Math.random() - 0.5)
  const onTimeDays     = shuffled.slice(0, onTimeCount)
  const delayDays      = shuffled.slice(onTimeCount, onTimeCount + delayCount)
  const toleranceDays  = shuffled.slice(onTimeCount + delayCount, onTimeCount + delayCount + toleranceCount)
  const faultDays      = shuffled.slice(onTimeCount + delayCount + toleranceCount)

  return { onTimeDays, toleranceDays, delayDays, faultDays }
}

export function distributeWorkDays(workDays: string[]): {
  onTimeDays: string[]
  toleranceDays: string[]
  delayDays: string[]
  faultDays: string[]
} {
  const byMonth = new Map<string, string[]>()
  for (const dateStr of workDays) {
    const key = dateStr.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(dateStr)
  }

  const keys = [...byMonth.keys()].sort()
  const onTimeDays: string[]    = []
  const toleranceDays: string[] = []
  const delayDays: string[]     = []
  const faultDays: string[]     = []

  for (const k of keys) {
    const chunk = byMonth.get(k)!
    const part  = distributeWorkDaysDemoProportions(chunk)
    onTimeDays.push(...part.onTimeDays)
    toleranceDays.push(...part.toleranceDays)
    delayDays.push(...part.delayDays)
    faultDays.push(...part.faultDays)
  }

  return { onTimeDays, toleranceDays, delayDays, faultDays }
}

/**
 * Lista de fechas `yyyy-MM-dd` laborables (zona negocio), respetando descansos del turno y feriados.
 */
export function buildWorkDays(
  restDays: number[],
  holidays: string[],
  monthsSpan: number,
  anchor: 'firstDayOfMonth' | 'rollingFromToday' = 'firstDayOfMonth',
): string[] {
  let startDate: DateTime
  let endDate: DateTime

  if (anchor === 'rollingFromToday') {
    endDate   = demoAssistNow().startOf('day')
    startDate = endDate.minus({ months: monthsSpan }).startOf('day')
  } else {
    const n   = demoAssistNow()
    startDate = n.minus({ months: monthsSpan }).startOf('month')
    endDate   = n.plus({ days: 1 }).startOf('day')
  }

  const workDays: string[] = []
  let current               = startDate

  while (current <= endDate) {
    const dayOfWeek = current.weekday

    if (!restDays.includes(dayOfWeek)) {
      const dateStr = current.toFormat('yyyy-MM-dd')
      if (!holidays.includes(dateStr)) {
        workDays.push(dateStr)
      }
    }

    current = current.plus({ days: 1 })
  }

  return workDays
}

function calcOnTimePunch(dateString: string, hourStart: string): DateTime {
  const [hour, minute]   = hourStart.split(':')
  const minutesVariation = Math.floor(Math.random() * 6) - 5
  const base = DateTime.fromFormat(
    `${dateString} ${hour}:${minute}:00`,
    'yyyy-MM-dd HH:mm:ss',
    { zone: DEMO_ASSIST_CALENDAR_ZONE }
  )
  return base.plus({ minutes: minutesVariation }).toUTC()
}

function calcTolerancePunch(
  dateString: string,
  hourStart: string,
  delayToleranceMinutes: number
): DateTime {
  const [hour, minute]   = hourStart.split(':')
  const minutesVariation = Math.floor(Math.random() * delayToleranceMinutes) + 1
  const totalMinutes     = Number(minute) + minutesVariation
  const finalHour        = Number(hour) + Math.floor(totalMinutes / 60)
  const finalMinute      = totalMinutes % 60
  const timeStr = `${dateString} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:00`
  return DateTime.fromFormat(timeStr, 'yyyy-MM-dd HH:mm:ss', { zone: DEMO_ASSIST_CALENDAR_ZONE }).toUTC()
}

function calcDelayPunch(
  dateString: string,
  hourStart: string,
  delayToleranceMinutes: number,
  faultToleranceMinutes: number
): DateTime {
  const [hour, minute] = hourStart.split(':')
  const span = Math.max(1, faultToleranceMinutes - delayToleranceMinutes)
  const minutesVariation =
    Math.floor(Math.random() * span) + delayToleranceMinutes + 15
  const totalMinutes = Number(minute) + minutesVariation
  const finalHour    = Number(hour) + Math.floor(totalMinutes / 60)
  const finalMinute  = totalMinutes % 60
  const timeStr = `${dateString} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:00`
  return DateTime.fromFormat(timeStr, 'yyyy-MM-dd HH:mm:ss', { zone: DEMO_ASSIST_CALENDAR_ZONE }).toUTC()
}

export function buildPunchTime(config: AssistDayConfig): DateTime | null {
  if (config.type === 'fault') return null

  const dateString = config.workDate

  switch (config.type) {
    case 'on_time':
      return calcOnTimePunch(dateString, config.shiftTimeStart)
    case 'tolerance':
      return calcTolerancePunch(dateString, config.shiftTimeStart, config.delayToleranceMinutes)
    case 'delay':
      return calcDelayPunch(
        dateString,
        config.shiftTimeStart,
        config.delayToleranceMinutes,
        config.faultToleranceMinutes
      )
    default:
      return null
  }
}

export const AssistFactory = factory
  .define(Assist, () => {
    const now = DateTime.now().toUTC()
    return {
      assistEmpId:           0,
      assistEmpCode:         '0000',
      assistSyncId:          0,
      assistPunchTime:       now,
      assistPunchTimeUtc:    now,
      assistPunchTimeOrigin: now,
      assistUploadTime:      now,
      assistTerminalSn:      '',
      assistTerminalAlias:   '',
      assistAreaAlias:       '',
      assistLongitude:       0,
      assistLatitude:        0,
      assistPrecision:       0,
      assistTerminalId:      null,
      assistActive:          1,
      assistType:            'check',
    }
  })
  .build()

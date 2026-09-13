import { DateTime } from 'luxon'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type { ShiftExceptionInterface } from '../../interfaces/shift_exception_interface.js'
import type {
  AttendanceStatistics,
  CleanCounters,
  InformationalCounters,
  OverviewStatistics,
  ToleranceThresholds,
} from './dto/attendance-stats.dto.js'

/**
 * Reglas de dominio de attendance-stats: clasificación de un día-empleado,
 * agregación de contadores y porcentajes con cierre 100%.
 *
 * Módulo puro: no importa BD, modelos, repositorios ni el service. Lo usan el
 * service y los constructores de respuesta (cobertura y ausencias por día) sin
 * formar un ciclo de imports.
 */

export function emptyClean(): CleanCounters {
  return { assists: 0, tolerances: 0, delays: 0, earlyOuts: 0, faults: 0 }
}

export function emptyInformational(): InformationalCounters {
  return { justifiedAbsences: 0, vacations: 0, holidays: 0 }
}

export function addClean(dst: CleanCounters, src: CleanCounters): void {
  dst.assists += src.assists
  dst.tolerances += src.tolerances
  dst.delays += src.delays
  dst.earlyOuts += src.earlyOuts
  dst.faults += src.faults
}

export function addInformational(dst: InformationalCounters, src: InformationalCounters): void {
  dst.justifiedAbsences += src.justifiedAbsences
  dst.vacations += src.vacations
  dst.holidays += src.holidays
}

/**
 * Cierre 100%: ontime + tolerance + delay + fault === 100. El residuo de
 * redondeo lo absorbe el bucket con MAYOR count (no siempre fault — si faults=0
 * y el residuo es negativo, daría un porcentaje negativo). earlyOutPercentage
 * es independiente. Si totalAvailable=0, todos los % son 0.
 *
 * Única implementación de la regla: la usa by-employee directo y, vía
 * `toOverviewStatistics`, overview (statistics, daily, monthly) y by-department.
 */
export function toStatistics(c: CleanCounters, info: InformationalCounters): AttendanceStatistics {
  const totalAvailable = c.assists + c.tolerances + c.delays + c.faults
  if (totalAvailable === 0) {
    return {
      assists: 0,
      tolerances: 0,
      delays: 0,
      earlyOuts: c.earlyOuts,
      faults: 0,
      totalAvailable: 0,
      ontimePercentage: 0,
      tolerancePercentage: 0,
      delayPercentage: 0,
      earlyOutPercentage: 0,
      faultPercentage: 0,
      ...info,
    }
  }
  let ontimePercentage = Math.round((c.assists / totalAvailable) * 100)
  let tolerancePercentage = Math.round((c.tolerances / totalAvailable) * 100)
  let delayPercentage = Math.round((c.delays / totalAvailable) * 100)
  let faultPercentage = Math.round((c.faults / totalAvailable) * 100)
  const earlyOutPercentage = Math.round((c.earlyOuts / totalAvailable) * 100)

  // Cierre: el residuo de redondeo (típicamente ±1-2) lo absorbe el bucket con
  // mayor count. Garantiza suma === 100 sin producir porcentajes negativos.
  const residual = 100 - ontimePercentage - tolerancePercentage - delayPercentage - faultPercentage
  const maxCount = Math.max(c.assists, c.tolerances, c.delays, c.faults)
  if (c.assists === maxCount) ontimePercentage += residual
  else if (c.tolerances === maxCount) tolerancePercentage += residual
  else if (c.delays === maxCount) delayPercentage += residual
  else faultPercentage += residual

  return {
    assists: c.assists,
    tolerances: c.tolerances,
    delays: c.delays,
    earlyOuts: c.earlyOuts,
    faults: c.faults,
    totalAvailable,
    ontimePercentage,
    tolerancePercentage,
    delayPercentage,
    earlyOutPercentage,
    faultPercentage,
    ...info,
  }
}

/**
 * Estadísticas base más `employeesQty` (empleados evaluados). La usan overview
 * y by-department; by-employee no expone este conteo.
 */
export function toOverviewStatistics(
  c: CleanCounters,
  info: InformationalCounters,
  employeesQty: number
): OverviewStatistics {
  return { ...toStatistics(c, info), employeesQty }
}

/**
 * Clasifica UN día-empleado en sus counters (clean + informational). Unidad
 * atómica de agregación reutilizada por `aggregateCalendar` (suma sobre el
 * calendario de un empleado) y por `getOverview` (agrupa por fecha para el
 * desglose diario).
 * - Aplica el filtro evaluable (rest, vacation, holiday, work disability, excepciones no-generales).
 * - Para días con permiso late-arrival, recompute check_in_status contra la hora autorizada.
 * - Para días con permiso early-departure, neutraliza el earlyOut si la salida fue posterior a la hora autorizada.
 * - Suma a contadores informativos (vacaciones, festivos, faltas justificadas) en paralelo.
 */
export function classifyDay(
  day: AssistDayInterface,
  thresholds: ToleranceThresholds
): { clean: CleanCounters; informational: InformationalCounters } {
  const clean = emptyClean()
  const info = emptyInformational()

  // Contadores informativos (independientes del cierre 100%).
  if (day.assist.isVacationDate) info.vacations += 1
  if (day.assist.isHoliday) info.holidays += 1
  if (hasJustifiedAbsenceException(day.assist.exceptions)) info.justifiedAbsences += 1

  // Filtro evaluable.
  if (!isEvaluableDay(day)) return { clean, informational: info }

  const lateArrival = findException(day.assist.exceptions, 'late-arrival')
  const earlyDeparture = findException(day.assist.exceptions, 'early-departure')

  // Recompute check_in_status si hay permiso de llegada tarde.
  const effectiveStatus = lateArrival
    ? computeCheckInStatusWithPermission(day, lateArrival, thresholds)
    : mapStoredStatus(day.assist.checkInStatus)

  if (effectiveStatus === 'ontime') clean.assists += 1
  else if (effectiveStatus === 'tolerance') clean.tolerances += 1
  else if (effectiveStatus === 'delay') clean.delays += 1
  else if (effectiveStatus === 'fault') clean.faults += 1

  // earlyOut: solo cuenta si check_out_status='delay' Y no hay permiso que lo neutralice.
  if (day.assist.checkOutStatus === 'delay') {
    if (!earlyDeparture || isStillEarlyAfterPermission(day, earlyDeparture, thresholds)) {
      clean.earlyOuts += 1
    }
  }

  return { clean, informational: info }
}

/**
 * Recorre el calendario en-memoria de UN empleado y produce sus counters
 * sumando `classifyDay` sobre cada día.
 */
export function aggregateCalendar(
  calendar: AssistDayInterface[],
  thresholds: ToleranceThresholds
): { clean: CleanCounters; informational: InformationalCounters } {
  const clean = emptyClean()
  const info = emptyInformational()
  for (const day of calendar) {
    const r = classifyDay(day, thresholds)
    addClean(clean, r.clean)
    addInformational(info, r.informational)
  }
  return { clean, informational: info }
}

/**
 * Enumera todos los días [startDay, endDay] inclusive en formato yyyy-MM-dd.
 * Comparación por fecha pura (sin componente horario): las fechas son días
 * laborales del huso México y el servidor corre en UTC.
 */
export function enumerateDays(startDay: string, endDay: string): string[] {
  const days: string[] = []
  let cursor = DateTime.fromISO(startDay)
  const end = DateTime.fromISO(endDay)
  while (cursor.isValid && cursor <= end) {
    days.push(cursor.toFormat('yyyy-MM-dd'))
    cursor = cursor.plus({ days: 1 })
  }
  return days
}

/**
 * Día que entra a los contadores de asistencia: excluye día futuro, descanso,
 * vacaciones, festivo, incapacidad y excepciones no generales. Única
 * implementación; la usan las estadísticas, la cobertura y las ausencias por día.
 */
export function isEvaluableDay(day: AssistDayInterface): boolean {
  if (day.assist.isFutureDay) return false
  if (day.assist.isRestDay) return false
  if (day.assist.isVacationDate) return false
  if (day.assist.isHoliday) return false
  if (day.assist.isWorkDisabilityDate) return false
  if (hasNonGeneralException(day.assist.exceptions)) return false
  return true
}

/**
 * `exceptionTypeIsGeneral` llega en el tipo de excepción aunque
 * `ShiftExceptionType` no lo declare; se lee como propiedad sin tipar.
 */
function hasNonGeneralException(exceptions: ShiftExceptionInterface[]): boolean {
  return exceptions.some((e) => {
    const exceptionType: object | null | undefined = e.exceptionType
    if (exceptionType === null || exceptionType === undefined) return false
    return (exceptionType as Record<string, unknown>)['exceptionTypeIsGeneral'] === 0
  })
}

function hasJustifiedAbsenceException(exceptions: ShiftExceptionInterface[]): boolean {
  return exceptions.some((e) => {
    const slug = e.exceptionType?.exceptionTypeSlug
    return slug === 'absence-from-work' || slug === 'nuevo-ingreso'
  })
}

function findException(
  exceptions: ShiftExceptionInterface[],
  slug: 'late-arrival' | 'early-departure'
): ShiftExceptionInterface | undefined {
  return exceptions.find((e) => e.exceptionType?.exceptionTypeSlug === slug)
}

function mapStoredStatus(stored: string | null | undefined): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  if (stored === 'ontime' || stored === 'tolerance' || stored === 'delay' || stored === 'fault') {
    return stored
  }
  return null
}

/**
 * Recomputa check_in_status contra la hora autorizada por el permiso late-arrival.
 * Replica la lógica de sync_assists_service.ts:1932-1965.
 */
function computeCheckInStatusWithPermission(
  day: AssistDayInterface,
  lateArrival: ShiftExceptionInterface,
  thresholds: ToleranceThresholds
): 'ontime' | 'tolerance' | 'delay' | 'fault' | null {
  const punch = day.assist.checkIn?.assistPunchTimeUtc
  if (!punch) return 'fault'

  const authorizedTime = lateArrival.shiftExceptionCheckInTime
  if (!authorizedTime) return mapStoredStatus(day.assist.checkInStatus)

  const minutes = minutesLateAgainst(day.day, String(authorizedTime), String(punch))
  if (minutes === null) return mapStoredStatus(day.assist.checkInStatus)

  if (minutes > thresholds.faultMinutes) return 'fault'
  if (minutes > thresholds.delayMinutes) return 'delay'
  if (minutes <= 0) return 'ontime'
  return 'tolerance'
}

/**
 * Cuando hay permiso early-departure: cuenta como earlyOut solo si la salida real
 * fue ANTES de la hora autorizada por más de `delayMinutes`.
 */
function isStillEarlyAfterPermission(
  day: AssistDayInterface,
  earlyDeparture: ShiftExceptionInterface,
  thresholds: ToleranceThresholds
): boolean {
  const punch = day.assist.checkOut?.assistPunchTimeUtc
  if (!punch) return false

  const authorizedTime = earlyDeparture.shiftExceptionCheckOutTime
  if (!authorizedTime) return true

  const minutesEarly = minutesEarlyAgainst(day.day, String(authorizedTime), String(punch))
  if (minutesEarly === null) return true
  return minutesEarly > thresholds.delayMinutes
}

function minutesLateAgainst(day: string, hhmmss: string, punchUtc: string): number | null {
  const expected = DateTime.fromISO(`${day}T${hhmmss}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return actual.diff(expected, 'minutes').minutes
}

function minutesEarlyAgainst(day: string, hhmmss: string, punchUtc: string): number | null {
  const expected = DateTime.fromISO(`${day}T${hhmmss}`, { zone: 'UTC-6' })
  const actual = DateTime.fromISO(punchUtc, { setZone: true }).setZone('UTC-6')
  if (!expected.isValid || !actual.isValid) return null
  return expected.diff(actual, 'minutes').minutes
}

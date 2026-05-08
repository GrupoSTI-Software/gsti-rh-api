import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Assist from '#models/assist'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export type AssistType = 'on_time' | 'tolerance' | 'delay' | 'fault'

export interface AssistDayConfig {
  workDate:             Date
  shiftTimeStart:       string   // 'HH:mm'
  shiftActiveHours:     number
  delayToleranceMinutes: number  // minutos máximos para estar "en tolerancia"
  faultToleranceMinutes: number  // minutos máximos antes de contar como falta
  type:                 AssistType
}

// ---------------------------------------------------------------------------
// Lógica de distribución de días — replica createAssistDemo() en assist_service.ts
// ---------------------------------------------------------------------------

/**
 * Calcula el reparto de días según los porcentajes del servicio actual:
 *  - 90 % on time
 *  -  5 % tolerancia
 *  -  3 % retardo
 *  -  2 % falta (no se crea asistencia)
 *
 * Respeta el mismo algoritmo de ajuste proporcional para evitar desbordamientos
 * al redondear (líneas 3483-3516 de assist_service.ts).
 */
export function distributeWorkDays(workDays: Date[]): {
  onTimeDays: Date[]
  toleranceDays: Date[]
  delayDays: Date[]
  faultDays: Date[]
} {
  const totalDays    = workDays.length
  const faultCount   = Math.max(1, Math.round(totalDays * 0.02))
  const remainingDays = totalDays - faultCount

  let onTimeCount    = Math.round(totalDays * 0.90)
  let toleranceCount = Math.round(totalDays * 0.05)
  let delayCount     = Math.round(totalDays * 0.03)

  let totalAssigned  = onTimeCount + toleranceCount + delayCount

  if (totalAssigned > remainingDays) {
    const excess          = totalAssigned - remainingDays
    const onTimeFactor    = onTimeCount    / totalAssigned
    const toleranceFactor = toleranceCount / totalAssigned
    const delayFactor     = delayCount     / totalAssigned

    onTimeCount    = Math.max(0, Math.round(onTimeCount    - excess * onTimeFactor))
    toleranceCount = Math.max(0, Math.round(toleranceCount - excess * toleranceFactor))
    delayCount     = Math.max(0, Math.round(delayCount     - excess * delayFactor))

    totalAssigned  = onTimeCount + toleranceCount + delayCount
    if (totalAssigned > remainingDays) {
      onTimeCount = Math.max(0, onTimeCount - (totalAssigned - remainingDays))
    }
  } else if (totalAssigned < remainingDays) {
    onTimeCount += remainingDays - totalAssigned
  }

  const shuffled      = [...workDays].sort(() => Math.random() - 0.5)
  const onTimeDays    = shuffled.slice(0, onTimeCount)
  const toleranceDays = shuffled.slice(onTimeCount, onTimeCount + toleranceCount)
  const delayDays     = shuffled.slice(onTimeCount + toleranceCount, onTimeCount + toleranceCount + delayCount)
  const faultDays     = shuffled.slice(onTimeCount + toleranceCount + delayCount)

  return { onTimeDays, toleranceDays, delayDays, faultDays }
}

/**
 * Calcula el rango de días laborables para el período DEMO.
 *
 * BUG CORREGIDO (referencia: assist_service.ts líneas 3438-3443):
 * El servicio original calcula startDate = primer día del mes anterior (correcto),
 * pero luego modifica `today` con setDate(today.getDate() + 1) DESPUÉS de llamar
 * a setHours(0,0,0,0).  Esto hace que el límite superior sea mañana, no hoy,
 * lo cual provoca que el bucle while (currentDate <= today) incluya el día actual
 * pero sólo si la mutación ocurre correctamente.  El problema real es que las
 * llamadas a setMonth / setDate sobre el mismo objeto Date mutan el estado, y
 * cuando el mes actual tiene más días que el mes anterior, setMonth puede saltar
 * al mes siguiente.  Esta factory usa Luxon para evitar esas mutaciones.
 *
 * @param monthsBack  Cuántos meses hacia atrás calcular (por defecto 1, igual que el servicio)
 */
export function buildWorkDays(
  restDays: number[],
  holidays: string[],   // lista de fechas 'yyyy-MM-dd' que son feriado
  monthsBack = 1,
): Date[] {
  // Inicio: primer día del mes anterior
  const startDate  = DateTime.now().minus({ months: monthsBack }).startOf('month')
  // Fin: hoy (inclusive) — el servicio usaba tomorrow pero eso era consecuencia
  // de querer incluir el día actual; aquí lo hacemos explícito con endOf('day')
  const endDate    = DateTime.now().startOf('day')

  const workDays: Date[] = []
  let current = startDate

  while (current <= endDate) {
    const jsDay    = current.weekday          // Luxon: 1=lunes … 7=domingo
    const dayOfWeek = jsDay                   // ya coincide con el formato del servicio

    if (!restDays.includes(dayOfWeek)) {
      const dateStr = current.toFormat('yyyy-MM-dd')
      if (!holidays.includes(dateStr)) {
        workDays.push(current.toJSDate())
      }
    }

    current = current.plus({ days: 1 })
  }

  return workDays
}

// ---------------------------------------------------------------------------
// Helpers para calcular punch time por tipo de asistencia
// ---------------------------------------------------------------------------

function calcOnTimePunch(dateString: string, hourStart: string): DateTime {
  const [hour, minute]   = hourStart.split(':')
  const minutesVariation = Math.floor(Math.random() * 6) - 5   // -5 a 0
  const base = DateTime.fromFormat(
    `${dateString} ${hour}:${minute}:00`,
    'yyyy-MM-dd HH:mm:ss',
    { zone: 'UTC-6' }
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
  return DateTime.fromFormat(timeStr, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC-6' }).toUTC()
}

function calcDelayPunch(
  dateString: string,
  hourStart: string,
  delayToleranceMinutes: number,
  faultToleranceMinutes: number
): DateTime {
  const [hour, minute] = hourStart.split(':')
  // Replica la línea 3608 de assist_service.ts:
  // minutesVariation = random(faultTolerance - delayTolerance) + delayTolerance + 15
  const minutesVariation =
    Math.floor(Math.random() * (faultToleranceMinutes - delayToleranceMinutes)) +
    delayToleranceMinutes + 15
  const totalMinutes = Number(minute) + minutesVariation
  const finalHour    = Number(hour) + Math.floor(totalMinutes / 60)
  const finalMinute  = totalMinutes % 60
  const timeStr = `${dateString} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:00`
  return DateTime.fromFormat(timeStr, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC-6' }).toUTC()
}

/**
 * Construye el punch time de entrada a partir de la config del día.
 */
export function buildPunchTime(config: AssistDayConfig): DateTime | null {
  if (config.type === 'fault') return null   // falta: no se crea asistencia

  const dateString = DateTime.fromJSDate(config.workDate).toFormat('yyyy-MM-dd')

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

// ---------------------------------------------------------------------------
// Factory de Assist
// ---------------------------------------------------------------------------

/**
 * Factory de Assist para datos DEMO.
 *
 * Genera un registro de checada (entrada O salida) con los tiempos correctos.
 * Desde el seeder se usa de la siguiente forma para cada día laborable:
 *
 *   const punchIn = buildPunchTime(dayConfig)
 *   if (!punchIn) continue   // es falta, saltar
 *
 *   // Checada de entrada
 *   await AssistFactory.merge({
 *     assistEmpId:   employee.employeeId,
 *     assistEmpCode: String(employee.employeeCode),
 *     assistPunchTime:       punchIn,
 *     assistPunchTimeUtc:    punchIn,
 *     assistPunchTimeOrigin: punchIn,
 *     assistUploadTime:      punchIn,
 *   }).create()
 *
 *   // Checada de salida
 *   const punchOut = punchIn.plus({ hours: shiftActiveHours })
 *   await AssistFactory.merge({
 *     assistEmpId:   employee.employeeId,
 *     assistEmpCode: String(employee.employeeCode),
 *     assistPunchTime:       punchOut,
 *     assistPunchTimeUtc:    punchOut,
 *     assistPunchTimeOrigin: punchOut,
 *     assistUploadTime:      punchOut,
 *   }).create()
 */
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

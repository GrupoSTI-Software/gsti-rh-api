import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import SyncAssistsService from '#services/sync_assists_service'
import type Employee from '#models/employee'
import { resolveSiteTimeZone, toInstant } from '#modules/attendance-time/attendance_clock'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type { AssistInterface } from '../../interfaces/assist_interface.js'
import type { MaterializedDay } from './dto/work_journal.dto.js'

/** Colaborador a materializar: su id y si está discriminado de asistencia. */
export type MaterializableEmployee = Pick<Employee, 'employeeId' | 'employeeAssistDiscriminator'>

/** Estados de entrada que el cálculo de asistencia califica. */
const EVALUATED_CHECK_IN_STATUSES: ReadonlySet<string> = new Set([
  'ontime',
  'tolerance',
  'delay',
  'fault',
])

/**
 * Traduce el cálculo de asistencia vigente del sistema en jornadas diarias
 * listas para sellar, SIN rehacer el cálculo (regla de negocio #10). Consume
 * `SyncAssistsService.index`, que ya cruza checadas × turno × tolerancias y
 * resuelve entrada/salida/estado por día en la zona del sitio.
 *
 * La jornada se sella con las checadas reales del colaborador, no con el
 * horario esperado del turno: un día sin checadas queda sin entrada, sin
 * salida y sin minutos trabajados.
 */
export default class WorkJournalMaterializer {
  private readonly assists: SyncAssistsService

  constructor(i18n?: I18n, assists: SyncAssistsService = new SyncAssistsService(i18n)) {
    this.assists = assists
  }

  /**
   * Construye la lista de días materializados de un empleado en [from, to].
   * Los días futuros, y los que no tienen turno ni checadas, se omiten: no hay
   * jornada que sellar (Duda 2 → se omiten, no se sellan vacíos).
   */
  async buildForEmployee(
    employee: MaterializableEmployee,
    from: string,
    to: string
  ): Promise<MaterializedDay[]> {
    const response = await this.assists.index({
      date: from,
      dateEnd: to,
      employeeID: employee.employeeId,
    })
    const data = response?.data
    const calendar = (
      data && !Array.isArray(data) && 'employeeCalendar' in data ? data.employeeCalendar : []
    ) as AssistDayInterface[]
    const zone =
      data && !Array.isArray(data) && 'timeZone' in data && typeof data.timeZone === 'string'
        ? data.timeZone
        : resolveSiteTimeZone([]).zone
    const discriminated = employee.employeeAssistDiscriminator === 1

    const days: MaterializedDay[] = []
    for (const dayEntry of calendar) {
      const materialized = this.materializeDay(employee.employeeId, dayEntry, zone, discriminated)
      if (materialized) {
        days.push(materialized)
      }
    }
    return days
  }

  /** Materializa un día concreto o devuelve null si no hay nada que sellar. */
  private materializeDay(
    employeeId: number,
    dayEntry: AssistDayInterface,
    zone: string,
    discriminated: boolean
  ): MaterializedDay | null {
    const assist = dayEntry.assist
    if (!assist || assist.isFutureDay) {
      return null
    }

    const date = DateTime.fromISO(`${dayEntry.day}`, { zone }).toISODate()
    if (!date) {
      return null
    }

    const checkIn = this.punchInstant(assist.checkIn)
    const checkOut = this.punchInstant(assist.checkOut)
    const hasPunches = (assist.assitFlatList?.length ?? 0) > 0 || !!checkIn || !!checkOut
    if (!assist.dateShift && !hasPunches) {
      return null
    }

    return {
      employeeId,
      date,
      checkIn: checkIn ? checkIn.setZone(zone).toISO() : null,
      checkOut: checkOut ? checkOut.setZone(zone).toISO() : null,
      workedMinutes: this.computeWorkedMinutes(
        checkIn,
        checkOut,
        this.punchInstant(assist.checkEatIn),
        this.punchInstant(assist.checkEatOut)
      ),
      dayStatus: this.resolveDayStatus(assist, discriminated, hasPunches),
      shiftId: assist.dateShift?.shiftId ?? null,
    }
  }

  /**
   * Unifica las banderas del cálculo de asistencia en un único estado del día.
   * Prioridad (de mayor a menor): incapacidad → vacaciones → festivo →
   * descanso → no evaluado (discriminado) → estado de la entrada → justificado
   * → ausencia. Una incapacidad manda aunque el día sea también festivo o
   * descanso. Un estado vacío nunca se lee como "a tiempo".
   */
  private resolveDayStatus(
    assist: AssistDayInterface['assist'],
    discriminated: boolean,
    hasPunches: boolean
  ): string {
    if (assist.isWorkDisabilityDate) return 'disability'
    if (assist.isVacationDate) return 'vacation'
    if (assist.isHoliday) return 'holiday'
    if (assist.isRestDay) return 'rest'
    if (discriminated) return 'not-evaluated'
    if (EVALUATED_CHECK_IN_STATUSES.has(assist.checkInStatus)) {
      // Una falta sin ninguna checada es una ausencia.
      return assist.checkInStatus === 'fault' && !hasPunches ? 'absence' : assist.checkInStatus
    }
    if (assist.hasExceptions) return 'justified'
    return hasPunches ? 'not-evaluated' : 'absence'
  }

  /**
   * Minutos trabajados de la entrada a la salida, menos la comida cuando se
   * checaron su salida y su regreso. Corrige el cruce de día (salida en la
   * madrugada del día siguiente) sumando 24 h. Devuelve null si falta la
   * entrada o la salida.
   */
  private computeWorkedMinutes(
    checkIn: DateTime | null,
    checkOut: DateTime | null,
    lunchOut: DateTime | null,
    lunchBack: DateTime | null
  ): number | null {
    if (!checkIn || !checkOut) {
      return null
    }
    let minutes = checkOut.diff(checkIn, 'minutes').minutes
    if (minutes < 0) {
      minutes += 24 * 60
    }
    if (lunchOut && lunchBack) {
      const lunchMinutes = lunchBack.diff(lunchOut, 'minutes').minutes
      if (lunchMinutes > 0 && lunchMinutes < minutes) {
        minutes -= lunchMinutes
      }
    }
    return Math.round(minutes)
  }

  /** Instante UTC de una checada, o null si no la hay. */
  private punchInstant(punch: AssistInterface | null | undefined): DateTime | null {
    if (!punch?.assistPunchTimeUtc) {
      return null
    }
    const instant = toInstant(punch.assistPunchTimeUtc)
    return instant.isValid ? instant : null
  }
}

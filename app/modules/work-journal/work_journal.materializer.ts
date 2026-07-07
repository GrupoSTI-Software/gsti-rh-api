import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import SyncAssistsService from '#services/sync_assists_service'
import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'
import type { MaterializedDay } from './dto/work_journal.dto.js'

/**
 * Traduce el cálculo de asistencia vigente del sistema en jornadas diarias
 * listas para sellar, SIN rehacer el cálculo (regla de negocio #10). Consume
 * `SyncAssistsService.index`, que ya cruza checadas × turno × tolerancias y
 * resuelve entrada/salida/estado por día en UTC-6.
 */
export default class WorkJournalMaterializer {
  private readonly assists: SyncAssistsService

  constructor(i18n?: I18n) {
    this.assists = new SyncAssistsService(i18n)
  }

  /**
   * Construye la lista de días materializados de un empleado en [from, to].
   * Los días futuros o sin turno/asistencia utilizable se omiten: no hay
   * jornada que sellar (Duda 2 → se omiten, no se sellan vacíos).
   */
  async buildForEmployee(
    employeeId: number,
    from: string,
    to: string
  ): Promise<MaterializedDay[]> {
    const response = await this.assists.index({ date: from, dateEnd: to, employeeID: employeeId })
    const data = response?.data
    const calendar = (
      data && !Array.isArray(data) && 'employeeCalendar' in data ? data.employeeCalendar : []
    ) as AssistDayInterface[]

    const days: MaterializedDay[] = []
    for (const dayEntry of calendar) {
      const materialized = this.materializeDay(employeeId, dayEntry)
      if (materialized) {
        days.push(materialized)
      }
    }
    return days
  }

  /** Materializa un día concreto o devuelve null si no hay nada que sellar. */
  private materializeDay(employeeId: number, dayEntry: AssistDayInterface): MaterializedDay | null {
    const assist = dayEntry.assist
    if (!assist || assist.isFutureDay) {
      return null
    }

    const date = DateTime.fromISO(`${dayEntry.day}`, { zone: 'UTC-6' }).toISODate()
    if (!date) {
      return null
    }

    const checkInIso = this.toIso(assist.checkInDateTime)
    const checkOutIso = this.toIso(assist.checkOutDateTime)

    return {
      employeeId,
      date,
      checkIn: checkInIso,
      checkOut: checkOutIso,
      workedMinutes: this.computeWorkedMinutes(assist.checkInDateTime, assist.checkOutDateTime),
      dayStatus: this.resolveDayStatus(assist),
      shiftId: assist.dateShift?.shiftId ?? null,
    }
  }

  /**
   * Unifica las banderas del cálculo de asistencia en un único estado del día.
   * Prioridad (de mayor a menor): incapacidad → vacaciones → festivo →
   * descanso → asistencia (según el estatus de check-in) → ausencia.
   * Una incapacidad manda aunque el día sea también festivo o descanso.
   */
  private resolveDayStatus(assist: AssistDayInterface['assist']): string {
    if (assist.isWorkDisabilityDate) return 'disability'
    if (assist.isVacationDate) return 'vacation'
    if (assist.isHoliday) return 'holiday'
    if (assist.isRestDay) return 'rest'
    if (assist.checkInDateTime) {
      return assist.checkInStatus || 'ontime'
    }
    return 'absence'
  }

  /**
   * Minutos trabajados como diferencia entrada→salida. Corrige el cruce de día
   * (salida en la madrugada del día siguiente) sumando 24 h. Devuelve null si
   * falta alguna de las dos marcas.
   */
  private computeWorkedMinutes(
    checkIn: DateTime | null,
    checkOut: DateTime | null
  ): number | null {
    if (!checkIn || !checkOut) {
      return null
    }
    let minutes = checkOut.diff(checkIn, 'minutes').minutes
    if (minutes < 0) {
      minutes += 24 * 60
    }
    return Math.round(minutes)
  }

  private toIso(value: DateTime | null): string | null {
    if (!value) {
      return null
    }
    return value.setZone('UTC-6').toISO()
  }
}

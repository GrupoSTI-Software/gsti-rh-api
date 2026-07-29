import { DateTime } from 'luxon'
import Employee from '#models/employee'
import Shift from '#models/shift'
import Assist from '#models/assist'
import type { SimulateAttendancePayload } from './validators/simulate_attendance.validator.js'

const TIMEZONE = 'America/Mexico_City'
const SIMULATED_AREA_ALIAS = 'Onboarding Simulado'

export interface SimulatedAttendanceResult {
  date: string
  employeeCode: string
  checkIn: string
  checkOut: string
  disclaimer: string
}

/**
 * Genera checadas de entrada/salida para el paso de onboarding.
 *
 * Las horas se persisten en el mismo “UTC de biométrico” que consume
 * `attendance-stats`: offset +5 dentro del horario de verano del checador
 * (abr–oct) y +6 el resto del año. No se usa `America/Mexico_City.toUTC()`
 * (UTC civil fijo +6), porque en verano el KPI marcaría el día como falta
 * (~60 min de desfase vs el turno esperado).
 */
export default class SimulateAttendanceService {
  async simulate(payload: SimulateAttendancePayload): Promise<SimulatedAttendanceResult> {
    const { employeeId, shiftId, date } = payload

    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw Object.assign(new Error('SIMULATE.EMPLOYEE_NOT_FOUND'), { code: 'EMPLOYEE_NOT_FOUND' })
    }

    const employeeCode = String(employee.employeeCode ?? '')

    const shift = await Shift.query()
      .where('shift_id', shiftId)
      .first()

    if (!shift) {
      throw Object.assign(new Error('SIMULATE.SHIFT_NOT_FOUND'), { code: 'SHIFT_NOT_FOUND' })
    }

    const [yyyy, mm, dd] = date.split('-').map(Number)
    const [startHour, startMinute] = shift.shiftTimeStart.split(':').map(Number)
    const utcOffsetHours = this.biometricUtcOffsetHours(date)

    const checkInLocal = DateTime.fromObject(
      { year: yyyy, month: mm, day: dd, hour: startHour, minute: startMinute, second: 0 },
      { zone: TIMEZONE }
    )
    const checkOutLocal = checkInLocal.plus({ hours: shift.shiftActiveHours })

    const checkInBiometricUtc = this.toBiometricUtc(checkInLocal, utcOffsetHours)
    const checkOutBiometricUtc = this.toBiometricUtc(checkOutLocal, utcOffsetHours)

    // Idempotente: evita duplicar checadas si se re-ejecuta el paso.
    await this.deletePreviousSimulatedAssists(employeeCode, date, utcOffsetHours)

    for (const punch of [
      { local: checkInLocal, utc: checkInBiometricUtc },
      { local: checkOutLocal, utc: checkOutBiometricUtc },
    ]) {
      await Assist.create({
        assistEmpCode: employeeCode,
        assistTerminalSn: '',
        assistTerminalAlias: '',
        assistAreaAlias: SIMULATED_AREA_ALIAS,
        assistLongitude: 0,
        assistLatitude: 0,
        assistPrecision: 0,
        assistUploadTime: punch.utc,
        assistEmpId: employee.employeeId,
        assistTerminalId: null,
        assistSyncId: 0,
        assistActive: 1,
        assistType: 'check',
        assistPunchTime: punch.local,
        assistPunchTimeUtc: punch.utc,
        assistPunchTimeOrigin: punch.utc,
      })
    }

    return {
      date,
      employeeCode,
      checkIn: checkInLocal.toFormat('HH:mm'),
      checkOut: checkOutLocal.toFormat('HH:mm'),
      disclaimer: 'Asistencias generadas automáticamente de manera simulada para demostración',
    }
  }

  /**
   * Convierte hora civil México a la marca UTC falsa del biométrico:
   * hora de pared del día + offset (+5 verano / +6 invierno).
   */
  private toBiometricUtc(local: DateTime, utcOffsetHours: number): DateTime {
    return DateTime.fromObject(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: local.hour,
        minute: local.minute,
        second: local.second,
      },
      { zone: 'UTC' }
    ).plus({ hours: utcOffsetHours })
  }

  /**
   * Offset biométrico del día. Replica `computeMexicoDST` de attendance-stats:
   * primer domingo de abril → último domingo de octubre → +5; fuera → +6.
   */
  private biometricUtcOffsetHours(dayIso: string): number {
    const year = Number(dayIso.slice(0, 4))
    const { dstStart, dstEnd } = this.computeMexicoBiometricDst(year)
    return dayIso >= dstStart && dayIso <= dstEnd ? 5 : 6
  }

  /**
   * Bounds del DST del checador (no el civil de México post-2022).
   */
  private computeMexicoBiometricDst(year: number): { dstStart: string; dstEnd: string } {
    const aprilFirst = new Date(Date.UTC(year, 3, 1))
    const aprilFirstDow = aprilFirst.getUTCDay()
    const dstStartDate = new Date(Date.UTC(year, 3, 1 + ((7 - aprilFirstDow) % 7)))

    const octLast = new Date(Date.UTC(year, 9, 31))
    const octLastDow = octLast.getUTCDay()
    const dstEndDate = new Date(Date.UTC(year, 9, 31 - octLastDow))

    return {
      dstStart: dstStartDate.toISOString().slice(0, 10),
      dstEnd: dstEndDate.toISOString().slice(0, 10),
    }
  }

  /**
   * Borra checadas previas del mismo paso de onboarding en la ventana del día
   * (cubre tanto el encoding civil viejo como el biométrico nuevo).
   */
  private async deletePreviousSimulatedAssists(
    employeeCode: string,
    dayIso: string,
    utcOffsetHours: number
  ): Promise<void> {
    const dayStart = DateTime.fromISO(`${dayIso}T00:00:00`, { zone: 'UTC' }).minus({ hours: 1 })
    const dayEnd = DateTime.fromISO(`${dayIso}T23:59:59`, { zone: 'UTC' })
      .plus({ hours: utcOffsetHours + 1 })
      .plus({ days: 1 })

    await Assist.query()
      .where('assist_emp_code', employeeCode)
      .where('assist_area_alias', SIMULATED_AREA_ALIAS)
      .where('assist_punch_time_utc', '>=', dayStart.toSQL({ includeOffset: false })!)
      .where('assist_punch_time_utc', '<=', dayEnd.toSQL({ includeOffset: false })!)
      .delete()
  }
}

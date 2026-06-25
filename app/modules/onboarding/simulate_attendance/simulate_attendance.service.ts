import { DateTime } from 'luxon'
import Employee from '#models/employee'
import Shift from '#models/shift'
import Assist from '#models/assist'
import type { SimulateAttendancePayload } from './validators/simulate_attendance.validator.js'

const TIMEZONE = 'America/Mexico_City'

export interface SimulatedAttendanceResult {
  date: string
  employeeCode: string
  checkIn: string
  checkOut: string
  disclaimer: string
}

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

    const shift = await Shift.query()
      .where('shift_id', shiftId)
      .first()

    if (!shift) {
      throw Object.assign(new Error('SIMULATE.SHIFT_NOT_FOUND'), { code: 'SHIFT_NOT_FOUND' })
    }

    const [yyyy, mm, dd] = date.split('-').map(Number)
    const [startHour, startMinute] = shift.shiftTimeStart.split(':').map(Number)

    const checkInLocal = DateTime.fromObject(
      { year: yyyy, month: mm, day: dd, hour: startHour, minute: startMinute, second: 0 },
      { zone: TIMEZONE }
    )
    const checkOutLocal = checkInLocal.plus({ hours: shift.shiftActiveHours })

    const checkInUtc  = checkInLocal.toUTC()
    const checkOutUtc = checkOutLocal.toUTC()

    for (const punchTime of [checkInUtc, checkOutUtc]) {
      await Assist.create({
        assistEmpCode: employee.employeeCode ?? '',
        assistTerminalSn: '',
        assistTerminalAlias: '',
        assistAreaAlias: 'Onboarding Simulado',
        assistLongitude: 0,
        assistLatitude: 0,
        assistPrecision: 0,
        assistUploadTime: punchTime,
        assistEmpId: employee.employeeId,
        assistTerminalId: null,
        assistSyncId: 0,
        assistActive: 1,
        assistType: 'check',
        assistPunchTime: punchTime,
        assistPunchTimeUtc: punchTime,
        assistPunchTimeOrigin: punchTime,
      })
    }

    return {
      date,
      employeeCode: employee.employeeCode ?? '',
      checkIn: checkInLocal.toFormat('HH:mm'),
      checkOut: checkOutLocal.toFormat('HH:mm'),
      disclaimer: 'Asistencias generadas automáticamente de manera simulada para demostración',
    }
  }
}

import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import Shift from '#models/shift'
import Assist from '#models/assist'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import type { SimulateAttendancePayload } from './validators/simulate_attendance.validator.js'

const SIMULATED_AREA_ALIAS = 'Onboarding Simulado'

export interface SimulatedAttendanceResult {
  date: string
  employeeCode: string
  checkIn: string
  checkOut: string
  disclaimer: string
  /** Ids de las checadas creadas (tracking de la siembra demo, USRH1785438246847). */
  assistIds: number[]
}

/**
 * Genera checadas de entrada/salida para el paso de onboarding.
 *
 * Las horas se persisten como instante UTC real: la hora civil del turno se
 * toma en la zona del sitio del colaborador (sucursal, o empresa, o sistema),
 * que es la misma con la que el resto de asistencia la clasifica y la muestra.
 */
export default class SimulateAttendanceService {
  private siteTimeZones: SiteTimeZoneService

  constructor(siteTimeZones?: SiteTimeZoneService) {
    this.siteTimeZones = siteTimeZones ?? new SiteTimeZoneService()
  }

  /**
   * `trx` opcional (USRH1785438246847): la siembra demo genera las checadas
   * dentro de su transacción todo-o-nada. Sin `trx` se comporta igual que antes.
   */
  async simulate(
    payload: SimulateAttendancePayload,
    trx?: TransactionClientContract
  ): Promise<SimulatedAttendanceResult> {
    const { employeeId, shiftId, date } = payload

    const employee = await Employee.query({ client: trx })
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw Object.assign(new Error('SIMULATE.EMPLOYEE_NOT_FOUND'), { code: 'EMPLOYEE_NOT_FOUND' })
    }

    const employeeCode = String(employee.employeeCode ?? '')

    const shift = await Shift.query({ client: trx })
      .where('shift_id', shiftId)
      .first()

    if (!shift) {
      throw Object.assign(new Error('SIMULATE.SHIFT_NOT_FOUND'), { code: 'SHIFT_NOT_FOUND' })
    }

    const [yyyy, mm, dd] = date.split('-').map(Number)
    const [startHour, startMinute] = shift.shiftTimeStart.split(':').map(Number)
    const { zone } = await this.siteTimeZones.forEmployee(employee.employeeId)

    const checkInLocal = DateTime.fromObject(
      { year: yyyy, month: mm, day: dd, hour: startHour, minute: startMinute, second: 0 },
      { zone }
    )
    const checkOutLocal = checkInLocal.plus({ hours: shift.shiftActiveHours })

    // Idempotente: evita duplicar checadas si se re-ejecuta el paso.
    await this.deletePreviousSimulatedAssists(employeeCode, employee.businessUnitId, date, zone, trx)

    const assistIds: number[] = []
    for (const punch of [
      { local: checkInLocal, utc: checkInLocal.toUTC() },
      { local: checkOutLocal, utc: checkOutLocal.toUTC() },
    ]) {
      const assist = await Assist.create(
        {
          businessUnitId: employee.businessUnitId,
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
        },
        { client: trx }
      )
      assistIds.push(assist.assistId)
    }

    return {
      date,
      employeeCode,
      checkIn: checkInLocal.toFormat('HH:mm'),
      checkOut: checkOutLocal.toFormat('HH:mm'),
      disclaimer: 'Asistencias generadas automáticamente de manera simulada para demostración',
      assistIds,
    }
  }

  /**
   * Borra checadas previas del mismo paso de onboarding en la ventana del día
   * civil del sitio, con una hora de margen a cada lado para cubrir filas que
   * se hubieran escrito con la convención vieja del checador.
   */
  private async deletePreviousSimulatedAssists(
    employeeCode: string,
    businessUnitId: number | null,
    dayIso: string,
    zone: string,
    trx?: TransactionClientContract
  ): Promise<void> {
    if (!businessUnitId) {
      return
    }

    const dayStart = DateTime.fromISO(`${dayIso}T00:00:00`, { zone }).toUTC().minus({ hours: 1 })
    const dayEnd = DateTime.fromISO(`${dayIso}T23:59:59`, { zone })
      .toUTC()
      .plus({ hours: 1 })
      .plus({ days: 1 })

    const deleteQuery = Assist.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .where('assist_emp_code', employeeCode)
      .where('assist_area_alias', SIMULATED_AREA_ALIAS)

    await deleteQuery
      .where('assist_punch_time_utc', '>=', dayStart.toSQL({ includeOffset: false })!)
      .where('assist_punch_time_utc', '<=', dayEnd.toSQL({ includeOffset: false })!)
      .delete()
  }
}

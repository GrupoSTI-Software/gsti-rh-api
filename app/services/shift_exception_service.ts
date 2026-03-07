import ShiftException from '#models/shift_exception'
import { DateTime } from 'luxon'
import { ShiftExceptionFilterInterface } from '../interfaces/shift_exception_filter_interface.js'
import { LogShiftException } from '../interfaces/MongoDB/log_shift_exception.js'
import { LogStore } from '#models/MongoDB/log_store'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import SyncAssistsService from './sync_assists_service.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import ExceptionType from '#models/exception_type'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import EmployeeShift from '#models/employee_shift'
import ShiftForEmployeeService from './shift_for_employees_service.js'
import type { ShiftRecordInterface } from '../interfaces/shift_record_interface.js'
import type { EmployeeRecordInterface } from '../interfaces/employee_record_interface.js'
import Holiday from '#models/holiday'
import env from '#start/env'

export default class ShiftExceptionService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async create(shiftException: ShiftException) {
    const newShiftException = new ShiftException()
    newShiftException.employeeId = shiftException.employeeId
    newShiftException.shiftExceptionsDescription = shiftException.shiftExceptionsDescription
    newShiftException.shiftExceptionsDate = shiftException.shiftExceptionsDate
    newShiftException.exceptionTypeId = shiftException.exceptionTypeId
    newShiftException.vacationSettingId = shiftException.vacationSettingId
    newShiftException.shiftExceptionCheckInTime = shiftException.shiftExceptionCheckInTime
    newShiftException.shiftExceptionCheckOutTime = shiftException.shiftExceptionCheckOutTime
    newShiftException.shiftExceptionEnjoymentOfSalary =
      shiftException.shiftExceptionEnjoymentOfSalary
    newShiftException.shiftExceptionTimeByTime = shiftException.shiftExceptionTimeByTime
    newShiftException.workDisabilityPeriodId = shiftException.workDisabilityPeriodId
    await newShiftException.save()

    const exceptionDate = newShiftException.shiftExceptionsDate
    const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate
    await this.updateAssistCalendar(shiftException.employeeId, date)

    return newShiftException
  }

  async update(currentShiftException: ShiftException, shiftException: ShiftException) {
    currentShiftException.employeeId = shiftException.employeeId
    currentShiftException.shiftExceptionsDescription = shiftException.shiftExceptionsDescription
    currentShiftException.shiftExceptionsDate = shiftException.shiftExceptionsDate
    currentShiftException.exceptionTypeId = shiftException.exceptionTypeId
    currentShiftException.vacationSettingId = shiftException.vacationSettingId
    currentShiftException.shiftExceptionCheckInTime = shiftException.shiftExceptionCheckInTime
    currentShiftException.shiftExceptionCheckOutTime = shiftException.shiftExceptionCheckOutTime
    currentShiftException.shiftExceptionEnjoymentOfSalary =
      shiftException.shiftExceptionEnjoymentOfSalary
    currentShiftException.shiftExceptionTimeByTime = shiftException.shiftExceptionTimeByTime
    await currentShiftException.save()

    const exceptionDate = currentShiftException.shiftExceptionsDate
    const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate
    await this.updateAssistCalendar(shiftException.employeeId, date)

    return currentShiftException
  }

  async show(shiftExceptionId: number) {
    const shiftException = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exception_id', shiftExceptionId)
      .first()
    return shiftException ? shiftException : null
  }


  async getByEmployee(filters: ShiftExceptionFilterInterface) {
    const shiftExceptions = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('employee_id', filters.employeeId)
      .if(filters.exceptionTypeId > 0, (query) => {
        query.where('exception_type_id', filters.exceptionTypeId)
      })
      .if(filters.dateStart && filters.dateEnd, (query) => {
        const stringDate = `${filters.dateStart}T00:00:00.000-06:00`
        const time = DateTime.fromISO(stringDate, { setZone: true })
        const timeCST = time.setZone('UTC-6')
        const filterInitialDate = timeCST.toFormat('yyyy-LL-dd HH:mm:ss')
        const stringEndDate = `${filters.dateEnd}T23:59:59.000-06:00`
        const timeEnd = DateTime.fromISO(stringEndDate, { setZone: true })
        const timeEndCST = timeEnd.setZone('UTC-6')
        const filterEndDate = timeEndCST.toFormat('yyyy-LL-dd HH:mm:ss')
        query.where('shift_exceptions_date', '>=', filterInitialDate)
        query.where('shift_exceptions_date', '<=', filterEndDate)
      })
      .preload('exceptionType')
      .preload('vacationSetting')
      .orderBy('shift_exceptions_date')
    return shiftExceptions
  }

  isValidDate(date: string) {
    try {
      date = date.replaceAll('"', '')
      let dt = DateTime.fromFormat(date, 'yyyy-MM-dd')
      if (dt.isValid) {
        return true
      } else {
        dt = DateTime.fromISO(date)
        if (dt.isValid) {
          return true
        }
      }
    } catch (error) {}
    return false
  }

  getDateAndTime(shiftExceptionsDate: string) {
    // const dateAndTime = shiftExceptionsDate.toString()
    // if (dateAndTime.toString().includes('T')) {
    //   let [date, horaConZona] = dateAndTime.split('T')
    //   const time = horaConZona.replaceAll('"', '').substring(0, 8)
    //   return `${date.replaceAll('"', '')} ${time}`
    // } else {
    //   let [date, horaConZona] = dateAndTime.split(' ')
    //   const time = horaConZona.replaceAll('"', '').substring(0, 8)
    //   return `${date.replaceAll('"', '')} ${time}`
    // }
    return `${shiftExceptionsDate}T00:00:00.000-06:00`
  }


  async verifyInfoExist(shiftException: ShiftException) {
    const existExceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_id', shiftException.exceptionTypeId)
      .first()

    if (!existExceptionType && shiftException.exceptionTypeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The exception type was not found',
        message: 'The exception type was not found with the entered ID',
        data: { ...shiftException },
      }
    }

    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', shiftException.employeeId)
      .first()

    if (!existEmployee && shiftException.employeeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee was not found',
        message: 'The employee was not found with the entered ID',
        data: { ...shiftException },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...shiftException },
    }
  }

  async verifyInfo(shiftException: ShiftException) {
    const action = shiftException.shiftExceptionId > 0 ? 'update' : 'create'
    const existDate = await ShiftException.query()
      .if(shiftException.shiftExceptionId > 0, (query) => {
        query.whereNot('shift_exception_id', shiftException.shiftExceptionId)
      })
      .where('exception_type_id', shiftException.exceptionTypeId)
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exceptions_date', shiftException.shiftExceptionsDate)
      .where('employee_id', shiftException.employeeId)
      .first()

    if (existDate) {
      return {
        status: 400,
        type: 'warning',
        title: 'The date exists in other exception',
        message: `The shift exception resource cannot be ${action} because this exception type is already assigned on the same date for the same employee.`,
        data: { ...shiftException },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...shiftException },
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logShiftException = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogShiftException
    return logShiftException
  }

  async saveActionOnLog(logShiftException: LogShiftException, table: string) {
    try {
      const employeeId = logShiftException.record_current?.employeeId
      if (employeeId) {
        const employeeShiftId = await this.getEmployeeShiftId(employeeId)
        logShiftException.employeeShiftId = employeeShiftId
      }
      await LogStore.set(table, logShiftException)
    } catch (err) {}
  }

  async getEmployeeShiftId(employeeId: number): Promise<number | null> {
    try {
      const today = new Date().toISOString().split('T')[0]
      const employeeShift = await EmployeeShift.query()
        .whereNull('employe_shifts_deleted_at')
        .where('employee_id', employeeId)
        .whereRaw('DATE(employe_shifts_apply_since) <= ?', [today])
        .orderBy('employe_shifts_apply_since', 'desc')
        .first()
      return employeeShift?.shiftId || null
    } catch (error) {
      return null
    }
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  async getEvidences(shiftExceptionId: number) {
    const shiftExceptionEvidences = await ShiftExceptionEvidence.query()
      .whereNull('shift_exception_evidence_deleted_at')
      .where('shift_exception_id', shiftExceptionId)

    return shiftExceptionEvidences ? shiftExceptionEvidences : []
  }

  async updateAssistCalendar(employeeId: number, date: Date) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate() - 24)

    const dateEnd = new Date(date)
    dateEnd.setDate(dateEnd.getDate() + 1)

    const filter: SyncAssistsServiceIndexInterface = {
        date: this.formatDate(dateStart),
        dateEnd: this.formatDate(dateEnd),
        employeeID: employeeId
      }
      const syncAssistsService = new SyncAssistsService(this.i18n)
      await syncAssistsService.setDateCalendar(filter)
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  /**
   * Obtiene el turno asignado al empleado para una fecha, respetando apply_since
   * (misma lógica que SyncAssistsService.getAssignedDateShift).
   */
  private getAssignedDateShiftForDate(
    compareDateTime: DateTime,
    dailyShifts: ShiftRecordInterface[]
  ): ShiftRecordInterface | undefined {
    const checkTime = compareDateTime.setZone('UTC-6')
    const availableShifts = dailyShifts.filter((shift) => {
      const shiftDate = DateTime.fromJSDate(new Date(shift.employeShiftsApplySince)).setZone('UTC-6')
      return checkTime >= shiftDate
    })
    const sorted = availableShifts.sort(
      (a, b) =>
        new Date(b.employeShiftsApplySince).getTime() -
        new Date(a.employeShiftsApplySince).getTime()
    )
    return sorted[0]
  }

  /**
   * Indica si el día es de descanso según el turno (shiftRestDays, 1-7).
   * Misma lógica que SyncAssistsService.isRestDay usando día natural en UTC-6.
   */
  private isRestDayForShift(dayDate: DateTime, shiftRestDays: string): boolean {
    const naturalDay = dayDate.setZone('UTC-6').toFormat('c')
    const restDays = shiftRestDays.split(',').map((d) => d.trim())
    return restDays.some((d) => Number.parseInt(d, 10) === Number.parseInt(naturalDay, 10))
  }

  /**
   * Slugs de tipos de excepción que se consideran "no laborables" para asignar vacaciones:
   * descanso por permiso, permiso de falta, permiso de incapacidad, incapacidad por maternidad.
   * Esos días se saltan al calcular días hábiles para vacaciones.
   */
  private static readonly EXCEPTION_SLUGS_NON_WORK_DAY = new Set([
    'rest-day', // descanso como permiso
    'absence-from-work', // permiso de falta
    'falta-por-incapacidad', // permiso de incapacidad
    'incapacidad-por-maternidad', // incapacidad por maternidad
    // si es necesario agregar más, agregar aquí 
  ])

  /**
   * Obtiene las fechas que son días hábiles (laborales) para el empleado en el rango,
   * excluyendo: días de descanso del turno, festivos de descanso oficial, y días con
   * excepciones de descanso/permiso/falta/incapacidad.
   * Usado para vacaciones: solo se asignan días que son laborales.
   */
  async getVacationBusinessDays(
    employeeId: number,
    startDate: DateTime,
    daysToApply: number
  ): Promise<string[]> {
    if (daysToApply <= 0) {
      return []
    }

    const dateStart = startDate.setZone('UTC-6').startOf('day')
    const rangeEnd = dateStart.plus({ days: Math.max(daysToApply * 3 + 31, 90) })
    const filterDateStart = dateStart.minus({ years: 10 }).toFormat('yyyy-LL-dd')
    const filterDateEnd = rangeEnd.toFormat('yyyy-LL-dd')

    const serviceResponse = await new ShiftForEmployeeService().getEmployeeShifts(
      { dateStart: filterDateStart, dateEnd: filterDateEnd, employeeId },
      999999,
      1
    )

    if (serviceResponse.status !== 200 || !serviceResponse.data?.data) {
      return []
    }

    const dailyShifts = (serviceResponse.data.data as EmployeeRecordInterface[])[0]
    const employeeShifts: ShiftRecordInterface[] = (dailyShifts?.employeeShifts ||
      []) as ShiftRecordInterface[]

    if (employeeShifts.length === 0) {
      return []
    }

    const [officialHolidayDates, datesWithRestOrPermission] = await Promise.all([
      this.getOfficialHolidayDatesInRange(
        dateStart.toFormat('yyyy-LL-dd'),
        rangeEnd.toFormat('yyyy-LL-dd')
      ),
      this.getDatesWithRestOrPermissionExceptions(
        employeeId,
        dateStart.toFormat('yyyy-LL-dd'),
        rangeEnd.toFormat('yyyy-LL-dd')
      ),
    ])

    const businessDays: string[] = []
    let current = dateStart

    while (businessDays.length < daysToApply && current <= rangeEnd) {
      const dateShift = this.getAssignedDateShiftForDate(current, employeeShifts)
      if (!dateShift?.shift) {
        current = current.plus({ days: 1 })
        continue
      }
      const isRest = this.isRestDayForShift(current, dateShift.shift.shiftRestDays)
      const dateStr = current.toFormat('yyyy-LL-dd')
      const isOfficialHoliday = officialHolidayDates.has(dateStr)
      const hasRestOrPermissionException = datesWithRestOrPermission.has(dateStr)
      if (!isRest && !isOfficialHoliday && !hasRestOrPermissionException) {
        businessDays.push(dateStr)
      }
      current = current.plus({ days: 1 })
    }

    return businessDays
  }

  /**
   * Devuelve las fechas (yyyy-MM-dd) en las que el empleado tiene alguna excepción
   * que se considera no laborable: descanso como permiso, falta, incapacidad, maternidad.
   */
  private async getDatesWithRestOrPermissionExceptions(
    employeeId: number,
    firstDate: string,
    lastDate: string
  ): Promise<Set<string>> {
    const slugs = ShiftExceptionService.EXCEPTION_SLUGS_NON_WORK_DAY
    const exceptions = await ShiftException.query()
      .where('employee_id', employeeId)
      .whereRaw('DATE(shift_exceptions_date) >= ?', [firstDate])
      .whereRaw('DATE(shift_exceptions_date) <= ?', [lastDate])
      .whereNull('shift_exceptions_deleted_at')
      .preload('exceptionType')
      .select('shift_exceptions_date', 'exception_type_id')

    const dates = new Set<string>()
    for (const ex of exceptions) {
      const slug = ex.exceptionType?.exceptionTypeSlug
      if (slug && slugs.has(slug)) {
        const d =
          typeof ex.shiftExceptionsDate === 'string'
            ? ex.shiftExceptionsDate
            : DateTime.fromJSDate(ex.shiftExceptionsDate as unknown as Date).toFormat('yyyy-LL-dd')
        dates.add(d.split('T')[0])
      }
    }
    return dates
  }

  /**
   * Carga fechas de festivos con descanso oficial en el rango y las devuelve como Set.
   */
  private async getOfficialHolidayDatesInRange(
    firstDate: string,
    lastDate: string
  ): Promise<Set<string>> {
    const businessConf = env.get('SYSTEM_BUSINESS', '')
    const businessList = businessConf ? businessConf.split(',').map((b) => b.trim()) : []

    const query = Holiday.query()
      .where('holidayDate', '>=', firstDate)
      .where('holidayDate', '<=', lastDate)
      .where('holidayIsOfficialRestDay', true)
      .whereNull('holiday_deleted_at')

    if (businessList.length > 0) {
      query.andWhere((q) => {
        businessList.forEach((business) => {
          q.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [business])
        })
      })
    }

    const holidays = await query.select('holidayDate')
    const dates = new Set<string>()
    for (const h of holidays) {
      const d =
        typeof h.holidayDate === 'string'
          ? h.holidayDate
          : DateTime.fromJSDate(h.holidayDate as unknown as Date).toFormat('yyyy-LL-dd')
      dates.add(d)
    }
    return dates
  }
}

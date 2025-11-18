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
      await LogStore.set(table, logShiftException)
    } catch (err) {}
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
}

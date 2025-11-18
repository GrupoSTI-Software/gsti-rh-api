import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import WorkDisability from '#models/work_disability'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityType from '#models/work_disability_type'
import { DateTime } from 'luxon'
import ShiftExceptionService from './shift_exception_service.js'
import { ShiftExceptionErrorInterface } from '../interfaces/shift_exception_error_interface.js'
import { WorkDisabilityPeriodAddShiftExceptionInterface } from '../interfaces/work_disability_period_add_shift_exception_interface.js'
import SyncAssistsService from './sync_assists_service.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import { I18n } from '@adonisjs/i18n'

export default class WorkDisabilityPeriodService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }
  async create(workDisabilityPeriod: WorkDisabilityPeriod) {
    const newWorkDisabilityPeriod = new WorkDisabilityPeriod()
    newWorkDisabilityPeriod.workDisabilityPeriodStartDate =
      workDisabilityPeriod.workDisabilityPeriodStartDate
    newWorkDisabilityPeriod.workDisabilityPeriodEndDate =
      workDisabilityPeriod.workDisabilityPeriodEndDate
    newWorkDisabilityPeriod.workDisabilityPeriodTicketFolio =
      workDisabilityPeriod.workDisabilityPeriodTicketFolio
    newWorkDisabilityPeriod.workDisabilityPeriodFile = workDisabilityPeriod.workDisabilityPeriodFile
    newWorkDisabilityPeriod.workDisabilityId = workDisabilityPeriod.workDisabilityId
    newWorkDisabilityPeriod.workDisabilityTypeId = workDisabilityPeriod.workDisabilityTypeId
    await newWorkDisabilityPeriod.save()
    await newWorkDisabilityPeriod.load('workDisability')

    return newWorkDisabilityPeriod
  }

  async update(
    currentWorkDisabilityPeriod: WorkDisabilityPeriod,
    workDisabilityPeriod: WorkDisabilityPeriod
  ) {
    currentWorkDisabilityPeriod.workDisabilityPeriodTicketFolio =
      workDisabilityPeriod.workDisabilityPeriodTicketFolio
    currentWorkDisabilityPeriod.workDisabilityPeriodFile =
      workDisabilityPeriod.workDisabilityPeriodFile
    currentWorkDisabilityPeriod.workDisabilityTypeId = workDisabilityPeriod.workDisabilityTypeId
    await currentWorkDisabilityPeriod.save()

    return currentWorkDisabilityPeriod
  }

  async delete(currentWorkDisabilityPeriod: WorkDisabilityPeriod) {
    await currentWorkDisabilityPeriod.delete()
  

    return currentWorkDisabilityPeriod
  }

  async show(workDisabilityPeriodId: number) {
    const workDisabilityPeriod = await WorkDisabilityPeriod.query()
      .whereNull('work_disability_period_deleted_at')
      .where('work_disability_period_id', workDisabilityPeriodId)
      .preload('workDisabilityType')
      .preload('workDisabilityPeriodExpenses')
      .first()
    return workDisabilityPeriod ? workDisabilityPeriod : null
  }

  async addShiftExceptions(filters: WorkDisabilityPeriodAddShiftExceptionInterface) {
    const shiftExceptionsSaved = [] as Array<ShiftException>
    const shiftExceptionsError = [] as Array<ShiftExceptionErrorInterface>
    const workDisabilityExceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'falta-por-incapacidad')
      .first()
    if (workDisabilityExceptionType) {
      await filters.workDisabilityPeriod.load('workDisability')
      await filters.workDisabilityPeriod.load('workDisabilityType')
      let currentDate = DateTime.fromISO(filters.workDisabilityPeriod.workDisabilityPeriodStartDate)
      const endDate = DateTime.fromISO(filters.workDisabilityPeriod.workDisabilityPeriodEndDate)
      for await (const date of this.iterateDates(currentDate, endDate)) {
        const shiftException = {
          employeeId: filters.workDisabilityPeriod.workDisability.employeeId,
          shiftExceptionsDescription: `${filters.workDisabilityPeriod.workDisability.insuranceCoverageType.insuranceCoverageTypeName}, ${filters.workDisabilityPeriod.workDisabilityType.workDisabilityTypeName}`,
          shiftExceptionsDate: date.toISODate(),
          exceptionTypeId: workDisabilityExceptionType.exceptionTypeId,
          vacationSettingId: null,
          shiftExceptionCheckInTime: null,
          shiftExceptionCheckOutTime: null,
          shiftExceptionEnjoymentOfSalary: 1,
          shiftExceptionTimeByTime: null,
          workDisabilityPeriodId: filters.workDisabilityPeriod.workDisabilityPeriodId,
        } as ShiftException
        try {
          const shiftExceptionService = new ShiftExceptionService(this.i18n)
          const verifyInfoException = await shiftExceptionService.verifyInfo(shiftException)
          if (verifyInfoException.status !== 200) {
            shiftExceptionsError.push({
              shiftExceptionsDate: date.toISODate(),
              error: verifyInfoException.message,
            })
          } else {
            const newShiftException = await shiftExceptionService.create(shiftException)
            if (newShiftException) {
              const rawHeaders = filters.request.request.rawHeaders
              const userId = filters.auth.user?.userId
              if (userId) {
                const logShiftException = await shiftExceptionService.createActionLog(
                  rawHeaders,
                  'store'
                )
                logShiftException.user_id = userId
                logShiftException.record_current = JSON.parse(JSON.stringify(newShiftException))
                const table = 'log_shift_exceptions'
                await shiftExceptionService.saveActionOnLog(logShiftException, table)
              }
              await newShiftException.load('exceptionType')
              await newShiftException.load('vacationSetting')
              shiftExceptionsSaved.push(newShiftException)
            }
          }
        } catch (error) {
          shiftExceptionsError.push({
            shiftExceptionsDate: date.toISODate(),
            error: error.message,
          })
        }
      }
    }
    return { shiftExceptionsSaved, shiftExceptionsError }
  }

  async updateShiftExceptions(workDisabilityPeriod: WorkDisabilityPeriod) {
    const shiftExceptions = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('work_disability_period_id', workDisabilityPeriod.workDisabilityPeriodId)
      .orderBy('work_disability_period_id')
    for await (const shiftException of shiftExceptions) {
      shiftException.shiftExceptionsDescription = `${workDisabilityPeriod.workDisability.insuranceCoverageType.insuranceCoverageTypeName}, ${workDisabilityPeriod.workDisabilityType.workDisabilityTypeName}`
      await shiftException.save()
    }
  }

  async deleteShiftExceptions(workDisabilityPeriod: WorkDisabilityPeriod) {
    const shiftExceptions = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('work_disability_period_id', workDisabilityPeriod.workDisabilityPeriodId)
      .orderBy('work_disability_period_id')
    for await (const shiftException of shiftExceptions) {
      await shiftException.delete()
    }
  }

  async verifyInfoExist(workDisabilityPeriod: WorkDisabilityPeriod) {
    const existWorkDisability = await WorkDisability.query()
      .whereNull('work_disability_deleted_at')
      .where('work_disability_id', workDisabilityPeriod.workDisabilityId)
      .first()

    if (!existWorkDisability && workDisabilityPeriod.workDisabilityId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The work disability was not found',
        message: 'The work disability was not found with the entered ID',
        data: { ...workDisabilityPeriod },
      }
    }

    const existWorkDisabilityType = await WorkDisabilityType.query()
      .whereNull('work_disability_type_deleted_at')
      .where('work_disability_type_id', workDisabilityPeriod.workDisabilityTypeId)
      .first()

    if (!existWorkDisabilityType && workDisabilityPeriod.workDisabilityTypeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The work disability type was not found',
        message: 'The work disability type was not found with the entered ID',
        data: { ...workDisabilityPeriod },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...workDisabilityPeriod },
    }
  }

  async verifyInfo(workDisabilityPeriod: WorkDisabilityPeriod) {
    const workDisabilityPeriodStartDate = workDisabilityPeriod.workDisabilityPeriodStartDate
    if (
      workDisabilityPeriodStartDate &&
      !this.isValidDate(workDisabilityPeriodStartDate.toString())
    ) {
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'Date start is invalid',
        data: workDisabilityPeriodStartDate,
      }
    }
    const workDisabilityPeriodEndDate = workDisabilityPeriod.workDisabilityPeriodEndDate
    if (workDisabilityPeriodEndDate && !this.isValidDate(workDisabilityPeriodEndDate.toString())) {
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'Date end is invalid',
        data: workDisabilityPeriodEndDate,
      }
    }
    const workDisability = await WorkDisability.query()
      .whereNull('work_disability_deleted_at')
      .where('work_disability_id', workDisabilityPeriod.workDisabilityId)
      .first()
    if (workDisability && !workDisabilityPeriod.workDisabilityPeriodId) {
      const wortkDisabilities = await WorkDisability.query()
        .whereNull('work_disability_deleted_at')
        .where('employee_id', workDisability.employeeId)
        .orderBy('work_disability_id')
      if (wortkDisabilities.length > 0) {
        const wortkDisabilitiesIds = wortkDisabilities.map((item) => item.workDisabilityId)
        const existWorkDisabilityPeriod = await WorkDisabilityPeriod.query()
          .whereNull('work_disability_period_deleted_at')
          .whereIn('work_disability_id', wortkDisabilitiesIds)
          .andWhere((query) => {
            query
              .whereBetween('work_disability_period_start_date', [
                workDisabilityPeriodStartDate,
                workDisabilityPeriodEndDate,
              ])
              .orWhereBetween('work_disability_period_end_date', [
                workDisabilityPeriodStartDate,
                workDisabilityPeriodEndDate,
              ])
              .orWhere((subQuery) => {
                subQuery
                  .where('work_disability_period_start_date', '<=', workDisabilityPeriodStartDate)
                  .andWhere('work_disability_period_end_date', '>=', workDisabilityPeriodEndDate)
              })
          })
          .preload('workDisability')
          .first()
        if (existWorkDisabilityPeriod) {
          const startDateInput = existWorkDisabilityPeriod.workDisabilityPeriodStartDate
          const startDateFormatted = DateTime.fromISO(startDateInput, { zone: 'utc' }).isValid
            ? DateTime.fromISO(startDateInput, { zone: 'utc' }).setLocale('en').toFormat('DDDD')
            : DateTime.fromJSDate(new Date(startDateInput)).setLocale('en').toFormat('DDDD')

          const endDateInput = existWorkDisabilityPeriod.workDisabilityPeriodEndDate
          const endDateFormatted = DateTime.fromISO(endDateInput, { zone: 'utc' }).isValid
            ? DateTime.fromISO(endDateInput, { zone: 'utc' }).setLocale('en').toFormat('DDDD')
            : DateTime.fromJSDate(new Date(endDateInput)).setLocale('en').toFormat('DDDD')

          const message = `Period is already exist in work disability: '${existWorkDisabilityPeriod.workDisability.workDisabilityUuid}' in range ${startDateFormatted} to ${endDateFormatted}`
          return {
            status: 400,
            type: 'error',
            title: 'Validation error',
            message: message,
            data: workDisabilityPeriodEndDate,
          }
        }
      }
    }
    if (workDisabilityPeriod.workDisabilityPeriodTicketFolio) {
      const action = workDisabilityPeriod.workDisabilityPeriodId > 0 ? 'updated' : 'created'
      const workDisabilities = await WorkDisability.query()
        .whereNull('work_disability_deleted_at')
        .orderBy('work_disability_id')

      for await (const itemWorkDisability of workDisabilities) {
        const existTicketFolio = await WorkDisabilityPeriod.query()
          .where('work_disability_id', itemWorkDisability.workDisabilityId)
          .whereNull('work_disability_period_deleted_at')
          .where(
            'work_disability_period_ticket_folio',
            workDisabilityPeriod.workDisabilityPeriodTicketFolio
          )
          .if(workDisabilityPeriod.workDisabilityPeriodId > 0, (query) => {
            query.whereNot('work_disability_period_id', workDisabilityPeriod.workDisabilityPeriodId)
          })
          .first()

        if (existTicketFolio) {
          return {
            status: 400,
            type: 'warning',
            title: 'The ticket folio already exists for another period',
            message: `The period resource cannot be ${action} because the ticket folio is already assigned to another period`,
            data: { ...workDisabilityPeriod },
          }
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...workDisabilityPeriod },
    }
  }

  private isValidDate(date: string) {
    try {
      date = date.replaceAll('"', '')
      let dt = DateTime.fromISO(date)
      if (dt.isValid) {
        return true
      } else {
        dt = DateTime.fromFormat(date, 'yyyy-MM-dd')
        if (dt.isValid) {
          return true
        }
      }
    } catch (error) {}
    return false
  }

  async *iterateDates(startDate: DateTime, endDate: DateTime) {
    while (startDate <= endDate) {
      yield startDate
      startDate = startDate.plus({ days: 1 })
    }
  }

  async updateAssistCalendar(employeeId: number, dateStart: Date, dateEnd: Date) {
   
    dateStart.setDate(dateStart.getDate() - 24)

    
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

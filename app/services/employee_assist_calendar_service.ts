import { DateTime } from 'luxon'
import Employee from '#models/employee'
import { EmployeeAssistCalendarFilterInterface } from '../interfaces/employee_assist_calendar_filter_interface.js'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import AssistsService from './assist_service.js'
import { AssistFlatFilterInterface } from '../interfaces/assist_flat_filter_interface.js'
import ShiftExceptionService from './shift_exception_service.js'
import { ShiftExceptionFilterInterface } from '../interfaces/shift_exception_filter_interface.js'
import HolidayService from './holiday_service.js'
import SyncAssistsService from './sync_assists_service.js'
import { I18n } from '@adonisjs/i18n'
// import { AssistInterface } from '../interfaces/assist_interface.js'

export default class EmployeeAssistsCalendarService {
  private t: (key: string,params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  async index (filters: EmployeeAssistCalendarFilterInterface) {
    const stringDate = `${filters.dateStart}T00:00:00.000-06:00`
    const time = DateTime.fromISO(stringDate, { setZone: true })
    const timeCST = time.setZone('UTC-6')
    const filterInitialDate = timeCST.toFormat('yyyy-LL-dd')
    const stringEndDate = `${filters.dateEnd}T23:59:59.000-06:00`
    const timeEnd = DateTime.fromISO(stringEndDate, { setZone: true })
    const timeEndCST = timeEnd.setZone('UTC-6')//.plus({ days: 1 })
    const filterEndDate = timeEndCST.toFormat('yyyy-LL-dd')
    let employee = null
    if (filters.employeeID) {
      employee = await Employee.query()
        .where('employee_id', filters.employeeID || 0)
        .withTrashed()
        .first()

      if (!employee) {
        const entity = this.t('employee')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: null,
        }
      }
    }

    let employeeCalendar = await this.fetchCalendarData(filters, filterInitialDate, filterEndDate, employee)
    const allDatesInRange: string[] = []
    for (
      let dt = DateTime.fromISO(filters.dateStart);
      dt <= DateTime.fromISO(filters.dateEnd);
      dt = dt.plus({ days: 1 })
    ) {
      allDatesInRange.push(dt.toFormat('yyyy-LL-dd'))
    }

    const datesWithData = new Set(employeeCalendar.map(c => c.day))
    const missingDates = allDatesInRange.filter(date => !datesWithData.has(date))

    if (missingDates.length > 0 && employee) {
      const assistService = new AssistsService(this.i18n)
      for await (const day of missingDates) {
        const date = typeof day === 'string' ? new Date(day) : day
        await assistService.updateAssistCalendar(employee.employeeId, date)
      }
      employeeCalendar = await this.fetchCalendarData(filters, filterInitialDate, filterEndDate, employee)
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data: {
        employeeCalendar,
      },
    }
  }

  private async fetchCalendarData(
    filters: EmployeeAssistCalendarFilterInterface,
    filterInitialDate: string,
    filterEndDate: string,
    employee: any
  ): Promise<AssistDayInterface[]> {
    const query = EmployeeAssistCalendar.query()

    if (filters.dateStart && !filters.dateEnd) {
      query.where('day', '>=', filterInitialDate)
    }

    if (filters.dateEnd && filters.dateStart) {
      query.where('day', '>=', filterInitialDate)
      query.andWhere('day', '<=', filterEndDate)
    }

    if (employee) {
      query.where('employee_id', employee.employeeId)
    }

    query
      .preload('dateShift')
      .preload('checkIn')
      .preload('checkOut')
      .preload('checkEatIn')
      .preload('checkEatOut')
      .orderBy('day', 'asc')

    const assistService = new AssistsService(this.i18n)
    const holidayService = new HolidayService(this.i18n)
    const shiftExceptionService = new ShiftExceptionService(this.i18n)
    const syncAssistService = new SyncAssistsService(this.i18n)

    const employeeAssistCalendar = await query
    const employeeCalendar: AssistDayInterface[] = []

    for await (const calendar of employeeAssistCalendar) {
      let assistDay: AssistDayInterface = {
        day: calendar.day,
        assist: JSON.parse(JSON.stringify(calendar)) as any,
      }

      assistDay.assist.exceptions = []

      const promises: Promise<any>[] = []

      if (assistDay.assist.hasExceptions) {
        const filter = {
          employeeId: filters.employeeID,
          exceptionTypeId: 0,
          dateStart: calendar.day,
          dateEnd: calendar.day,
        } as ShiftExceptionFilterInterface

        promises.push(
          shiftExceptionService.getByEmployee(filter).then(response => {
            assistDay.assist.exceptions = JSON.parse(JSON.stringify(response))
          })
        )
      }

      if (assistDay.assist.isHoliday) {
        promises.push(
          holidayService.index(calendar.day, calendar.day, '', 1, 999999).then(response => {
            if (response.status === 200 && response.holidays && response.holidays?.length > 0) {
              assistDay.assist.holiday = JSON.parse(JSON.stringify(response.holidays[0]))
            }
          })
        )
      }

      assistDay.assist.assitFlatList = []

      if (assistDay.assist.hasAssitFlatList) {
        const filter = {
          employeeId: filters.employeeID,
          dateStart: calendar.day,
          dateEnd: calendar.day,
        } as AssistFlatFilterInterface

        promises.push(
          assistService.getAssistFlatList(filter).then(response => {
            assistDay.assist.assitFlatList = response
          })
        )
      }

      await Promise.all(promises)
      assistDay = syncAssistService.verifyCheckOutToday(assistDay)

      assistDay.assist = this.fixedCSTSummerTime(DateTime.fromISO(assistDay.day).toJSDate(), assistDay.assist)

      employeeCalendar.push(assistDay)
    }
    // Ordenar el resultado por día
    employeeCalendar.sort((a, b) => {
      return DateTime.fromISO(a.day).toMillis() - DateTime.fromISO(b.day).toMillis()
    })

    return employeeCalendar
  }

  private getMexicoDSTChangeDates (year: number) {
    const startDST = new Date(year, 3, 1)
    startDST.setDate(1 + (7 - startDST.getDay()) % 7) // Asegura que es el primer domingo

    // Último domingo de octubre (fin del horario de verano)
    const endDST = new Date(year, 9, 31)
    endDST.setDate(endDST.getDate() - endDST.getDay()) // Asegura que es el último domingo

    return { startDST, endDST }
  }

  private checkDSTSummerTime (date: Date): boolean {
    const year = date.getFullYear()
    const { startDST, endDST } = this.getMexicoDSTChangeDates(year)

    if (date >= startDST && date < endDST) {
      // En horario de verano
      return true
    } else {
      // En horario estándar
      return false
    }
  }

  private fixedCSTSummerTime (evaluatedDay: Date, assist: any) {
    const isSummerTime = this.checkDSTSummerTime(evaluatedDay)

    if (isSummerTime) {
      if (assist?.checkIn?.assistPunchTimeUtc) {
        assist.checkIn.assistPunchTimeUtc = DateTime.fromISO(assist.checkIn.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 }).toISO()
      }

      if (assist?.checkEatIn?.assistPunchTimeUtc) {
        assist.checkEatIn.assistPunchTimeUtc = DateTime.fromISO(assist.checkEatIn.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 }).toISO()
      }

      if (assist?.checkEatOut?.assistPunchTimeUtc) {
        assist.checkEatOut.assistPunchTimeUtc = DateTime.fromISO(assist.checkEatOut.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 }).toISO()
      }

      if (assist?.checkOut?.assistPunchTimeUtc) {
        assist.checkOut.assistPunchTimeUtc = DateTime.fromISO(assist.checkOut.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 }).toISO()
      }
    }

    return assist
  }
}

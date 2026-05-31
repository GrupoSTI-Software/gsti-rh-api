import Employee from '#models/employee'
import Holiday from '#models/holiday'
import { I18n } from '@adonisjs/i18n'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import SyncAssistsService from './sync_assists_service.js'

export default class HolidayService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async index(firstDate: string, lastDate: string, search: string, page: number, limit: number, allowedBusinessUnitSlugs: string[] = []) {
    try {
      const holidays = Holiday.query()
        .andWhere((query) => {
          if (allowedBusinessUnitSlugs.length === 0) {
            query.whereRaw('1 = 0')
            return
          }
          query.andWhere((subQuery) => {
            allowedBusinessUnitSlugs.forEach((business) => {
              subQuery.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [business.trim()])
            })
          })
        })

      if (search) {
        holidays.where('holidayName', 'like', `%${search}%`)
      }

      if (firstDate) {
        holidays.where('holidayDate', '>=', firstDate)
      }

      if (lastDate) {
        holidays.where('holidayDate', '<=', lastDate)
      }

      const responseHolidays = await holidays.orderBy('holidayDate', 'asc').paginate(page, limit)

      return {
        status: 200,
        type: 'success',
        title: 'Successfully action',
        message: 'Resources fetched',
        holidays: responseHolidays as Holiday[],
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred',
        data: error,
      }
    }
  }

  async updateAssistCalendar(date: Date, allowedBusinessUnitIds: number[] = []) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate())

    const dateEnd = new Date(date)
    dateEnd.setDate(dateEnd.getDate())

    if (allowedBusinessUnitIds.length === 0) {
      return
    }

    const employees = await Employee.query()
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .orderBy('employee_id')

    for await (const employee of employees) {
      const filter: SyncAssistsServiceIndexInterface = {
        date: this.formatDate(dateStart),
        dateEnd: this.formatDate(dateEnd),
        employeeID: employee.employeeId
      }
      const syncAssistsService = new SyncAssistsService(this.i18n)
      await syncAssistsService.setDateCalendar(filter)
    }
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }
}

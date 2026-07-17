import EmployeeShift from '#models/employee_shift'
import { DateTime } from 'luxon'
import { EmployeeShiftFilterInterface } from '../interfaces/employee_shift_filter_interface.js'
import { LogStore } from '#models/MongoDB/log_store'
import { LogEmployeeShift } from '../interfaces/MongoDB/log_employee_shift.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import SyncAssistsService from './sync_assists_service.js'
import { I18n } from '@adonisjs/i18n'
import User from '#models/user'
import UserFcmToken from '#models/user_fcm_token'
import admin from '../../config/firebase.js'
import Shift from '#models/shift'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'

export default class EmployeeShiftService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async verifyInfo(employeeShift: EmployeeShift) {
    const lastShift = await EmployeeShift.query()
      .whereNull('employe_shifts_deleted_at')
      .if(employeeShift.employeeShiftId > 0, (query) => {
        query.whereNot('employee_shift_id', employeeShift.employeeShiftId)
      })
      .where('employee_id', employeeShift.employeeId)
      .orderBy('employe_shifts_apply_since', 'desc')
      .first()

    if (lastShift) {
      const currentDateApplySince = DateTime.fromISO(lastShift.employeShiftsApplySince.toString())
      const newDateApplySince = DateTime.fromISO(employeeShift.employeShiftsApplySince.toString())

      if (
        lastShift.shiftId === employeeShift.shiftId &&
        newDateApplySince >= currentDateApplySince
      ) {
        return {
          status: 400,
          type: 'warning',
          title: 'The shift ID is already exist',
          message: 'Shift cannot be reassigned',
          data: { ...employeeShift },
        }
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employeeShift },
    }
  }

  async getByEmployee(filters: EmployeeShiftFilterInterface) {
    const employeeShifts = await EmployeeShift.query()
      .whereNull('employe_shifts_deleted_at')
      .where('employee_id', filters.employeeId)
      .if(filters.shiftId > 0, (query) => {
        query.where('shift_id', filters.shiftId)
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
        query.where('employe_shifts_apply_since', '>=', filterInitialDate)
        query.where('employe_shifts_apply_since', '<=', filterEndDate)
      })
      .preload('shift')
      .orderBy('employe_shifts_apply_since')
    return employeeShifts
  }

  async getShiftActiveByEmployee(employeeId: number) {
    const today = new Date().toISOString().split('T')[0]
    const employeeShift = await EmployeeShift.query()
      .whereNull('employe_shifts_deleted_at')
      .where('employee_id', employeeId)
      .whereRaw('DATE(employe_shifts_apply_since) <= ?', [today])
      .orderBy('employe_shifts_apply_since', 'desc')
      .preload('shift')
      .first()
    return employeeShift
  }

  async deleteEmployeeShifts(currentEmployeeShifts: EmployeeShift) {
    const existingShifts = await EmployeeShift.query()
      .where('employeeId', currentEmployeeShifts.employeeId)
      .where('employe_shifts_apply_since', currentEmployeeShifts.employeShiftsApplySince)
      .whereNull('deletedAt')

    if (existingShifts.length > 0) {
      for (const employeeShift of existingShifts) {
        await employeeShift.delete()
      }
    }
  }

  isValidDate(date: string) {
    try {
      date = date.replaceAll('"', '')
      let dt = DateTime.fromISO(date)
      if (dt.isValid) {
        return true
      } else {
        dt = DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm:ss')
        if (dt.isValid) {
          return true
        }
      }
    } catch (error) {}
    return false
  }

  getDateAndTime(employeShiftsApplySince: string) {
    const dateAndTime = employeShiftsApplySince.toString()

    if (dateAndTime.toString().includes('T')) {
      let [date, horaConZona] = dateAndTime.split('T')
      const time = horaConZona.replaceAll('"', '').substring(0, 8)
      const dateTime = `${date.replaceAll('"', '')}T${time}.000-06:00`
      return dateTime
    } else {
      let [date, horaConZona] = dateAndTime.split(' ')
      const time = horaConZona.replaceAll('"', '').substring(0, 8)
      const dateTime = `${date.replaceAll('"', '')}T${time}.000-06:00`
      return dateTime
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logEmployeeShift = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogEmployeeShift
    return logEmployeeShift
  }

  async saveActionOnLog(logEmployeeShift: LogEmployeeShift) {
    try {
      await LogStore.set('log_employee_shifts', logEmployeeShift)
    } catch (err) {}
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  async updateAssistCalendar(employeeId: number, date: Date) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate() - 24)

    const dateEnd = new Date()

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

  async sendNotificationToUser(userId: number, date: string | null, shift: Shift) {
    const user = await User.query()
      .where('user_id', userId)
      .first()
    if (!user) {
      return {
        status: 400,
        type: 'warning',
        title: 'User not found',
        message: 'User not found with the entered ID',
        data: { userId: userId },
      }
    }
    const userFcmTokens = await UserFcmToken.query()
      .where('user_id', userId)
      .where('user_fcm_token_active', 1)
      .where('user_fcm_token_last_seen_at', '>', DateTime.now().minus({ days: 50 }).toISO())
    if (!userFcmTokens) {
      return {
        status: 400,
        type: 'warning',
        title: 'User FCM tokens not found',
        message: 'User FCM tokens not found with the entered ID',
        data: { userId: userId },
      }
    }
    // USRH1783712837584: la ruta (/api/employee_shifts, `businessScope` middleware)
    // ya resuelve el tenant en `TenantContext`; fail-closed silencioso — sin
    // configuración propia se conserva el ícono vacío que ya manejaba el código.
    const systemSettingService = new SystemSettingService()
    const businessUnitId = TenantContext.getScope()[0]
    let systemSetting: SystemSetting | null = null
    if (businessUnitId) {
      try {
        systemSetting = await systemSettingService.resolveByBusinessUnitId(businessUnitId)
      } catch (error) {
        if (!(error instanceof SystemSettingResolutionError)) throw error
      }
    }
    // se crea el mensaje algo como "Se te ha asignado el turno de 08:00  to 18:00 Rest(NA) a partir del lunes 02 de febrero, 2026"
    const message = 'Se te ha asignado el turno de ' + shift.shiftName + ' a partir del ' + date
    for (const userFcmToken of userFcmTokens) {
      try {
        const dateTime = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
        admin.messaging().send({
          webpush: {
            notification: {
              title: 'Turno Asignado ' + dateTime,
              body: message,
              icon: systemSetting?.systemSettingFavicon ? systemSetting.systemSettingFavicon : ''
            },
          },
          token: userFcmToken.userFcmToken
        });
      } catch (error) {
        console.error(error)
      }
    }
   
  
    return {
      status: 200,
      type: 'success',
      title: 'User FCM tokens found',
      message: 'User FCM tokens found with the entered ID',
      data: { userFcmTokens: userFcmTokens },
    }
  }
}

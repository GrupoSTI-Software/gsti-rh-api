/* eslint-disable prettier/prettier */
import Employee from '#models/employee'
import { DateTime } from 'luxon'
import EmployeeShiftChange from '#models/employee_shift_changes'
import Shift from '#models/shift'
import { EmployeeShiftChangeFilterInterface } from '../interfaces/employee_shift_change_filter_interface.js'
import { LogStore } from '#models/MongoDB/log_store'
import { LogEmployeeShiftChange } from '../interfaces/MongoDB/log_employee_shift_change.js'
import EmployeeShift from '#models/employee_shift'
import User from '#models/user'
import UserFcmToken from '#models/user_fcm_token'
import admin from '../../config/firebase.js'

export default class EmployeeShiftChangeService {
  async create(employeeShiftChange: EmployeeShiftChange) {
    const newEmployeeShiftChange = new EmployeeShiftChange()
    newEmployeeShiftChange.employeeIdFrom = employeeShiftChange.employeeIdFrom
    newEmployeeShiftChange.shiftIdFrom = employeeShiftChange.shiftIdFrom
    newEmployeeShiftChange.employeeShiftChangeDateFrom = employeeShiftChange.employeeShiftChangeDateFrom
    newEmployeeShiftChange.employeeShiftChangeDateFromIsRestDay = employeeShiftChange.employeeShiftChangeDateFromIsRestDay
    newEmployeeShiftChange.employeeIdTo = employeeShiftChange.employeeIdTo
    newEmployeeShiftChange.shiftIdTo = employeeShiftChange.shiftIdTo
    newEmployeeShiftChange.employeeShiftChangeDateTo = employeeShiftChange.employeeShiftChangeDateTo
    newEmployeeShiftChange.employeeShiftChangeDateToIsRestDay = employeeShiftChange.employeeShiftChangeDateToIsRestDay
    newEmployeeShiftChange.employeeShiftChangeChangeThisShift = employeeShiftChange.employeeShiftChangeChangeThisShift
    newEmployeeShiftChange.employeeShiftChangeNote = employeeShiftChange.employeeShiftChangeNote
    await newEmployeeShiftChange.save()
    return newEmployeeShiftChange
  }

  async delete(currentEmployeeShiftChange: EmployeeShiftChange) {
    await currentEmployeeShiftChange.delete()
    return currentEmployeeShiftChange
  }

  async show(employeeShiftChangeId: number) {
    const employeeShiftChange = await EmployeeShiftChange.query()
      .whereNull('employee_shift_change_deleted_at')
      .where('employee_shift_change_id', employeeShiftChangeId)
      .preload('employeeTo')
      .preload('shiftTo')
      .preload('shiftFrom')
      .first()
    return employeeShiftChange ? employeeShiftChange : null
  }

  async getByEmployee(filters: EmployeeShiftChangeFilterInterface) {
    const employeeShiftChanges = await EmployeeShiftChange.query()
      .whereNull('employee_shift_change_deleted_at')
      .where('employee_id_from', filters.employeeId)
      .if(filters.date, (query) => {
        const stringDate = `${filters.date}T00:00:00.000-06:00`
        const time = DateTime.fromISO(stringDate, { setZone: true })
        const timeCST = time.setZone('UTC-6')
        const filterInitialDate = timeCST.toFormat('yyyy-MM-dd')
        query.whereRaw('DATE(employee_shift_change_date_from) = ?', [filterInitialDate])
      })
      .preload('employeeTo')
      .preload('shiftTo')
      .preload('shiftFrom')
      .orderBy('employee_shift_change_date_from')
    return employeeShiftChanges
  }

  async verifyInfoExist(employeeShiftChange: EmployeeShiftChange) {

    const existEmployeeFrom = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeShiftChange.employeeIdFrom)
      .first()

    if (!existEmployeeFrom && employeeShiftChange.employeeIdFrom) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee from was not found',
        message: 'The employee from was not found with the entered ID',
        data: { ...employeeShiftChange },
      }
    }
    const existShiftFrom = await Shift.query()
      .whereNull('shift_deleted_at')
      .where('shift_id', employeeShiftChange.shiftIdFrom)
      .first()

    if (!existShiftFrom && employeeShiftChange.shiftIdFrom) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift from was not found',
        message: 'The shift from was not found with the entered ID',
        data: { ...employeeShiftChange },
      }
    }

    const existEmployeeTo = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeShiftChange.employeeIdTo)
      .first()

    if (!existEmployeeTo && employeeShiftChange.employeeIdTo) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee to was not found',
        message: 'The employee to was not found with the entered ID',
        data: { ...employeeShiftChange },
      }
    }
    const existShiftTo = await Shift.query()
      .whereNull('shift_deleted_at')
      .where('shift_id', employeeShiftChange.shiftIdTo)
      .first()

    if (!existShiftTo && employeeShiftChange.shiftIdTo) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift to was not found',
        message: 'The shift to was not found with the entered ID',
        data: { ...employeeShiftChange },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employeeShiftChange },
    }
  }

  async verifyInfo(employeeShiftChange: EmployeeShiftChange) {
    const action = employeeShiftChange.employeeShiftChangeId > 0 ? 'updated' : 'created'
    const employeeShiftChangeDateFrom = DateTime.fromJSDate(new Date(employeeShiftChange.employeeShiftChangeDateFrom)).toFormat('yyyy-MM-dd')
    const existEmployeeShiftChangeDateFrom = await EmployeeShiftChange.query()
      .whereNull('employee_shift_change_deleted_at')
      .if(employeeShiftChange.employeeShiftChangeId > 0, (query) => {
        query.whereNot(
          'employee_shift_change_id',
          employeeShiftChange.employeeShiftChangeId
        )
      })
      .where('employee_id_from', employeeShiftChange.employeeIdFrom)
      .whereRaw('DATE(employee_shift_change_date_from) = ?', [employeeShiftChangeDateFrom])
      .first()
    if (existEmployeeShiftChangeDateFrom) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee shift change date from already exists',
        message: `The employee shift change resource cannot be ${action} because the date from is already assigned`,
        data: { ...employeeShiftChange },
      }
    }
    const employeeShiftChangeDateTo = DateTime.fromJSDate(new Date(employeeShiftChange.employeeShiftChangeDateTo)).toFormat('yyyy-MM-dd')
    const existEmployeeShiftChangeDateTo = await EmployeeShiftChange.query()
      .whereNull('employee_shift_change_deleted_at')
      .if(employeeShiftChange.employeeShiftChangeId > 0, (query) => {
        query.whereNot(
          'employee_shift_change_id',
          employeeShiftChange.employeeShiftChangeId
        )
      })
      .where('employee_id_to', employeeShiftChange.employeeIdTo)
      .whereRaw('DATE(employee_shift_change_date_to) = ?', [employeeShiftChangeDateTo])
      .first()
    if (existEmployeeShiftChangeDateTo) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee shift change date to already exists',
        message: `The employee shift change resource cannot be ${action} because the date to is already assigned`,
        data: { ...employeeShiftChange },
      }
    }
   /*  if (employeeShiftChangeDateFrom === employeeShiftChangeDateTo) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee shift change date to',
        message: `The employee shift change resource cannot be ${action} because the 'date to' is the same as the 'date from'`,
        data: { ...employeeShiftChange },
      }
    } */
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...employeeShiftChange },
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logEmployeeShiftChange = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogEmployeeShiftChange
    return logEmployeeShiftChange
  }

  async saveActionOnLog(logEmployeeShiftChange: LogEmployeeShiftChange, table: string) {
    try {
      const employeeId = logEmployeeShiftChange.record_current?.employeeIdFrom
      if (employeeId) {
        const employeeShiftId = await this.getEmployeeShiftId(employeeId)
        logEmployeeShiftChange.employeeShiftId = employeeShiftId
      }
      await LogStore.set(table, logEmployeeShiftChange)
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

  async sendNotificationToUser(userId: number) {
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
      .first()
    if (!userFcmTokens) {
      return {
        status: 400,
        type: 'warning',
        title: 'User FCM tokens not found',
        message: 'User FCM tokens not found with the entered ID',
        data: { userId: userId },
      }
    }
    admin.messaging().send({
      notification: {
        title: 'Turno cambiado',
        body: 'Se te ha cambiado el turno'
      },
      token: userFcmTokens.userFcmToken
    });
  
    return {
      status: 200,
      type: 'success',
      title: 'User FCM tokens found',
      message: 'User FCM tokens found with the entered ID',
      data: { userFcmTokens: userFcmTokens },
    }
  }
  }

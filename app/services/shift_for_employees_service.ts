import EmployeeShift from '#models/employee_shift'
import { DateTime } from 'luxon'
import type { ShiftForEmployeeFiltersInterface } from '../interfaces/shift_for_employee_filters_interface.js'
import type { EmployeeRecordInterface } from '../interfaces/employee_record_interface.js'

export default class ShiftForEmployeeService {
  async getEmployeeShifts(
    filters: ShiftForEmployeeFiltersInterface,
    limitPage: number,
    nPage: number
  ) {
    const onlyDateStart = filters.dateStart
    const onliDateEnd = filters.dateEnd
    const startDate =
      DateTime.fromISO(onlyDateStart, { setZone: true }).setZone('UTC-6') || ''
    const endDate =
      DateTime.fromISO(onliDateEnd, { setZone: true }).setZone('UTC-6') || ''

    const page = nPage || 1
    const limit = limitPage || 999999

    if (startDate >= endDate) {
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'startDate must be less than endDate',
      }
    }

    let query = EmployeeShift.query()
      .whereBetween('employeShiftsApplySince', [onlyDateStart, onliDateEnd])
      .preload('employee', (employeeQuery) => {
        employeeQuery.preload('person')
      })
      .preload('shift')
      .whereNull('deletedAt')
      .orderBy('employeShiftsApplySince', 'asc')

    if (filters.employeeId) {
      query = query.where('employeeId', filters.employeeId)
    }

    const records = await query.paginate(page, limit)

    if (records.length === 0) {
      return {
        status: 400,
        type: 'warning',
        title: 'no_employee_shifts',
        message: 'The employe has not shifts',
        data: null,
      }
    }
    const employeeRecords = records.reduce(
      (acc, record) => {
        if (!acc[record.employeeId]) {
          acc[record.employeeId] = {
            employeeId: record.employeeId,
            employeeSyncId: record.employee.employeeSyncId,
            employeeCode: record.employee.employeeCode,
            employeeFirstName: record.employee.person?.personFirstname,
            employeeLastName: `${record.employee.person?.personLastname} ${record.employee.person?.personSecondLastname}`,
            employeePayrollNum: record.employee.employeePayrollNum,
            employeeHireDate: record.employee.employeeHireDate,
            companyId: record.employee.companyId,
            departmentId: record.employee.departmentId,
            positionId: record.employee.positionId,
            departmentSyncId: record.employee.departmentSyncId,
            positionSyncId: record.employee.positionSyncId,
            employeeLastSynchronizationAt: record.employee.employeeLastSynchronizationAt,
            employeeCreatedAt: record.employee.employeeCreatedAt,
            employeeUpdatedAt: record.employee.employeeUpdatedAt,
            employeeShifts: [],
          }
        }
        acc[record.employeeId].employeeShifts.push({
          employeeShiftId: record.employeeShiftId,
          employeeId: record.employeeId,
          shiftId: record.shiftId,
          employeShiftsApplySince: record.employeShiftsApplySince,
          shiftDate: record.employeShiftsCreatedAt,
          shiftCalculateFlag: record.shift.shiftCalculateFlag,
          shift: {
            shiftId: record.shift.shiftId,
            shiftName: record.shift.shiftName,
            shiftDayStart: record.shift.shiftDayStart,
            shiftTimeStart: record.shift.shiftTimeStart,
            shiftActiveHours: record.shift.shiftActiveHours,
            shiftRestDays: record.shift.shiftRestDays,
            shiftAccumulatedFault: record.shift.shiftAccumulatedFault,
            shiftLunchTime: record.shift.shiftLunchTime || 0,
            shiftCompensableLunchSchedule: record.shift.shiftCompensableLunchSchedule,
            shiftCreatedAt: record.shift.shiftCreatedAt,
            shiftUpdatedAt: record.shift.shiftUpdatedAt,
            shiftCalculateFlag: record.shift.shiftCalculateFlag,
          },
        })
        return acc
      },
      {} as { [key: number]: EmployeeRecordInterface }
    )
    Object.values(employeeRecords).forEach((employee: EmployeeRecordInterface) => {
      employee.employeeShifts.sort(
        (a, b) =>
          new Date(b.shiftDate.toString()).getTime() - new Date(a.shiftDate.toString()).getTime()
      )
    })

    return {
      status: 200,
      type: 'success',
      title: 'Successfully fetched',
      message: 'Records fetched successfully',
      data: {
        meta: {
          total: records.total,
          per_page: records.perPage,
          current_page: records.currentPage,
          last_page: records.lastPage,
          first_page: 1,
        },
        data: Object.values(employeeRecords),
      },
    }
  }
}

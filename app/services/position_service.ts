import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import EmployeeShift from '#models/employee_shift'
import Position from '#models/position'
import Shift from '#models/shift'
import env from '#start/env'
import { I18n } from '@adonisjs/i18n'
import BiometricPositionInterface from '../interfaces/biometric_position_interface.js'
import { PositionShiftEmployeeWarningInterface } from '../interfaces/position_shift_employee_warning_interface.js'
import { PositionShiftFilterInterface } from '../interfaces/position_shift_filter_interface.js'
import EmployeeService from './employee_service.js'
import EmployeeShiftService from './employee_shift_service.js'

export default class PositionService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async syncCreate(position: BiometricPositionInterface) {
    const newPosition = new Position()
    newPosition.positionSyncId = position.id
    newPosition.parentPositionSyncId = position.parentPositionId
    newPosition.positionCode = position.positionCode
    newPosition.positionName = position.positionName
    newPosition.positionIsDefault = position.isDefault
    newPosition.positionActive = 1
    newPosition.parentPositionId = position.parentPositionId
      ? await this.getIdBySyncId(position.parentPositionId)
      : null
    newPosition.companyId = position.companyId
    newPosition.positionLastSynchronizationAt = new Date()
    await newPosition.save()
    return newPosition
  }

  async syncUpdate(position: BiometricPositionInterface, currentPosition: Position) {
    currentPosition.parentPositionSyncId = position.parentPositionId
    currentPosition.positionCode = position.positionCode
    currentPosition.positionName = position.positionName
    currentPosition.positionIsDefault = position.isDefault
    currentPosition.parentPositionId = position.parentPositionId
      ? await this.getIdBySyncId(position.parentPositionId)
      : null
    currentPosition.companyId = position.companyId
    currentPosition.positionLastSynchronizationAt = new Date()
    await currentPosition.save()
    return currentPosition
  }

  async create(position: Position) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
      .first()

    const newPosition = new Position()
    newPosition.positionCode = position.positionCode
    newPosition.positionName = position.positionName
    newPosition.positionAlias = position.positionAlias
    newPosition.positionIsDefault = position.positionIsDefault
    newPosition.positionActive = position.positionActive
    newPosition.parentPositionId = position.parentPositionId
    newPosition.businessUnitId = businessUnit?.businessUnitId || 0

    await newPosition.save()
    await newPosition.load('parentPosition')
    await newPosition.load('subPositions')

    return newPosition
  }

  async update(currentPosition: Position, position: Position) {
    currentPosition.positionCode = position.positionCode
    currentPosition.positionName = position.positionName
    currentPosition.positionAlias = position.positionAlias
    currentPosition.positionIsDefault = position.positionIsDefault
    currentPosition.positionActive = position.positionActive
    currentPosition.parentPositionId = position.parentPositionId
    currentPosition.companyId = position.companyId
    await currentPosition.save()
    await currentPosition.load('parentPosition')
    await currentPosition.load('subPositions')

    return currentPosition
  }

  async delete(currentPosition: Position) {
    await DepartmentPosition.query().where('position_id', currentPosition.positionId).delete()
    await currentPosition.delete()
    return currentPosition
  }

  async assignShift(filters: PositionShiftFilterInterface) {
    const employeeShiftService = new EmployeeShiftService(this.i18n)
    if (!employeeShiftService.isValidDate(filters.applySince)) {
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'Date is invalid',
        data: null,
      }
    }
    const employeeService = new EmployeeService(this.i18n)
    const departmentId = filters.departmentId
    const page = 1
    const limit = 999999999999999
    const resultEmployes = await employeeService.index(
      {
        search: '',
        departmentId: departmentId,
        positionId: filters.positionId,
        page: page,
        limit: limit,
        employeeWorkSchedule: '',
      },
      [departmentId]
    )
    const dataEmployes: any = resultEmployes
    const warnings = [] as Array<PositionShiftEmployeeWarningInterface>
    for await (const employee of dataEmployes) {
      const employeeShift = {
        employeeId: employee.employeeId,
        shiftId: filters.shiftId,
        employeShiftsApplySince: employeeShiftService.getDateAndTime(filters.applySince),
      } as EmployeeShift
      const verifyInfo = await employeeShiftService.verifyInfo(employeeShift)
      if (verifyInfo.status !== 200) {
        warnings.push({
          status: verifyInfo.status,
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          employee: employee,
        })
      } else {
        await EmployeeShift.create(employeeShift)
      }
    }
    return {
      status: 201,
      type: 'success',
      title: 'Successfully action',
      message: 'Resource created',
      data: { warnings },
    }
  }

  async getIdBySyncId(positionSyncId: number) {
    const position = await Position.query().where('position_sync_id', positionSyncId).first()
    if (position) {
      return position.positionId
    } else {
      return 0
    }
  }

  async verifyExistPositionByName(positionName: string) {
    const position = await Position.query().where('position_name', positionName).first()
    if (position) {
      return position.positionId
    } else {
      return null
    }
  }

  async show(positionId: number) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const position = await Position.query()
      .whereIn('businessUnitId', businessUnitsList)
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .preload('parentPosition')
      .preload('subPositions')
      .first()

    return position ? position : null
  }

  async get() {
    const positions = await Position.query().whereNull('position_deleted_at')
    return positions
  }

  async verifyInfoExist(position: Position) {
    if (position.parentPositionId) {
      const existPositionParent = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', position.parentPositionId)
        .first()

      if (!existPositionParent && position.parentPositionId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The position parent was not found',
          message: 'The position parent was not found with the entered ID',
          data: { ...position },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...position },
    }
  }

  async verifyInfo(position: Position) {
    const action = position.positionId > 0 ? 'updated' : 'created'
    const existCode = await Position.query()
      .if(position.positionId > 0, (query) => {
        query.whereNot('position_id', position.positionId)
      })
      .whereNull('position_deleted_at')
      .where('position_code', position.positionCode)
      .first()

    if (existCode && position.positionCode) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position code already exists for another position',
        message: `The position resource cannot be ${action} because the code is already assigned to another position`,
        data: { ...position },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...position },
    }
  }

  async verifyInfoAssignShift(filter: PositionShiftFilterInterface) {
    const departmentId = filter.departmentId
    const positionId = filter.positionId
    const shiftId = filter.shiftId
    if (!departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department Id was not found',
        message: 'Missing data to process',
        data: { departmentId },
      }
    }
    const currentDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()
    if (!currentDepartment) {
      return {
        status: 404,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { departmentId },
      }
    }
    if (!positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position Id was not found',
        message: 'Missing data to process',
        data: { positionId },
      }
    }
    const currentPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .first()
    if (!currentPosition) {
      return {
        status: 404,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { positionId },
      }
    }
    if (!shiftId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift Id was not found',
        message: 'Missing data to process',
        data: { shiftId },
      }
    }
    const currentShift = await Shift.query()
      .whereNull('shift_deleted_at')
      .where('shift_id', shiftId)
      .first()
    if (!currentShift) {
      return {
        status: 404,
        type: 'warning',
        title: 'The shift was not found',
        message: 'The shift was not found with the entered ID',
        data: { shiftId },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...filter },
    }
  }
}

import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Position from '#models/position'
import { I18n } from '@adonisjs/i18n'

export default class DepartmentPositionService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async syncCreate(departmentId: number, positionId: number) {
    const newDepartmentPosition = new DepartmentPosition()
    newDepartmentPosition.departmentId = departmentId
    newDepartmentPosition.positionId = positionId
    newDepartmentPosition.departmentPositionLastSynchronizationAt = new Date()
    await newDepartmentPosition.save()
    return newDepartmentPosition
  }

  async create(departmentPosition: DepartmentPosition) {
    const newDepartmentPosition = new DepartmentPosition()
    newDepartmentPosition.departmentId = departmentPosition.departmentId
    newDepartmentPosition.positionId = departmentPosition.positionId
    await newDepartmentPosition.save()
    return newDepartmentPosition
  }

  async update(
    currentDepartmentPosition: DepartmentPosition,
    departmentPosition: DepartmentPosition
  ) {
    currentDepartmentPosition.departmentId = departmentPosition.departmentId
    currentDepartmentPosition.positionId = departmentPosition.positionId
    await currentDepartmentPosition.save()
    return currentDepartmentPosition
  }

  async delete(currentDepartmentPosition: DepartmentPosition) {
    await currentDepartmentPosition.delete()
    return currentDepartmentPosition
  }

  async show(departmentPositionId: number) {
    const departmentPosition = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .where('department_position_id', departmentPositionId)
      .first()
    return departmentPosition ? departmentPosition : null
  }

  async verifyInfoExist(departmentPosition: DepartmentPosition) {
    const existDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentPosition.departmentId)
      .first()

    if (!existDepartment && departmentPosition.departmentId) {
      const entity = this.t('department')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...departmentPosition },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', departmentPosition.positionId)
      .first()

    if (!existPosition && departmentPosition.positionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...departmentPosition },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...departmentPosition },
    }
  }

  async verifyInfo(departmentPosition: DepartmentPosition) {
    const action = departmentPosition.departmentPositionId > 0 ? 'updated' : 'created'
    const existDepartmentPosition = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .if(departmentPosition.departmentPositionId > 0, (query) => {
        query.whereNot('department_position_id', departmentPosition.departmentPositionId)
      })
      .where('department_id', departmentPosition.departmentId)
      .where('position_id', departmentPosition.positionId)
      .first()
    if (existDepartmentPosition) {
      const entity = `${this.t('relation')} ${this.t('department')} - ${this.t('position')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_relation_is_already_assigned_to_another_register')}`,
        data: { ...departmentPosition },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...departmentPosition },
    }
  }
}

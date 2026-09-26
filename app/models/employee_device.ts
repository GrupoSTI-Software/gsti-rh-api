/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import Employee from './employee.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeDevice:
 *        type: object
 *        properties:
 *          employeeDeviceId:
 *            type: number
 *            description: Employee device id
 *          employeeDeviceToken:
 *            type: string
 *            description: Employee device token
 *          employeeDeviceModel:
 *            type: string
 *            description: Employee device model
 *          employeeDeviceBrand:
 *            type: string
 *            description: Employee device brand
 *          employeeDeviceType:
 *            type: string
 *            description: Employee device type
 *          employeeDeviceOs:
 *            type: string
 *            description: Employee device OS
 *          employeeDeviceActive:
 *            type: number
 *            description: Employee device status active
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeDeviceCreatedAt:
 *            type: string
 *          employeeDeviceUpdatedAt:
 *            type: string
 *          employeeDeviceDeletedAt:
 *            type: string
 *
 */

export default class EmployeeDevice extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeDeviceId: number

  @column()
  declare employeeDeviceToken: string

  @column()
  declare employeeDeviceModel: string

  @column()
  declare employeeDeviceBrand: string

  @column()
  declare employeeDeviceType: string

  @column()
  declare employeeDeviceOs: string

  @column()
  declare employeeDeviceActive: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeDevice) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeDeviceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeDeviceUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_device_deleted_at' })
  declare deletedAt: DateTime | null
}

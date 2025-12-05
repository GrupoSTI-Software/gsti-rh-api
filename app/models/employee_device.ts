/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
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

export default class EmployeeDevice extends compose(BaseModel, SoftDeletes) {
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

  @column.dateTime({ autoCreate: true })
  declare employeeDeviceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeDeviceUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_device_deleted_at' })
  declare deletedAt: DateTime | null
}

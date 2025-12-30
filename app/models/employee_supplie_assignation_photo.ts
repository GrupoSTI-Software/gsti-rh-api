import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import EmployeeSupplie from './employee_supplie.js'
import * as relations from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeSupplieAssignationPhoto:
 *       type: object
 *       properties:
 *         employeeSupplieAssignationPhotoId:
 *           type: number
 *           description: Employee supplie assignation photo ID
 *         employeeSupplyId:
 *           type: number
 *           description: Employee supply ID
 *         employeeSupplieAssignationPhotoType:
 *           type: enum
 *           description: Employee supplie assignation photo type
 *           enum: [assignation, return]
 *         employeeSupplieAssignationPhotoFile:
 *           type: string
 *           description: Employee supplie assignation photo file
 *         employeeSupplieAssignationPhotoCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Employee supplie assignation photo created at
 *         employeeSupplieAssignationPhotoUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Employee supplie assignation photo updated at
 *         employeeSupplieAssignationPhotoDeletedAt:
 *           type: string
 *           format: date-time
 *           description: Employee supplie assignation photo deleted at
 *       example:
 *         employeeSupplieAssignationPhotoId: 1
 *         employeeSupplyId: 1
 *         employeeSupplieAssignationPhotoType: 'assignation'
 *         employeeSupplieAssignationPhotoFile: 'photo.jpg'
 *         employeeSupplieAssignationPhotoCreatedAt: '2025-01-01T00:00:00Z'
 *         employeeSupplieAssignationPhotoUpdatedAt: '2025-01-01T00:00:00Z'
 *         employeeSupplieAssignationPhotoDeletedAt: null
 *         employeeSupply:
 *           # Example employee object
 *         supply:
 *           # Example supply object
 */

export default class EmployeeSupplieAssignationPhoto extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeSupplieAssignationPhotoId: number

  @column()
  declare employeeSupplyId: number

  @column()
  declare employeeSupplieAssignationPhotoType: 'assignation' | 'return'

  @column()
  declare employeeSupplieAssignationPhotoFile: string

  @column.dateTime({ autoCreate: true })
  declare employeeSupplieAssignationPhotoCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeSupplieAssignationPhotoUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_supplie_assignation_photo_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeSupplie, {
    foreignKey: 'employeeSupplyId',
  })
  declare employeeSupply: relations.BelongsTo<typeof EmployeeSupplie>
}

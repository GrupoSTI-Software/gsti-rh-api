import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *     ProceedingFileTypePropertyValue:
 *       type: object
 *       properties:
 *         proceedingFileTypePropertyValueId:
 *           type: number
 *           description: Proceeding file type property value ID
 *         proceedingFileTypePropertyValueValue:
 *           type: string
 *           nullable: true
 *           description: Proceeding file type property value value
 *         proceedingFileTypePropertyValueActive:
 *           type: number
 *           nullable: true
 *         proceedingFileTypePropertyId:
 *           type: number
 *           nullable: true
 *           description: Proceeding file type property id
 *         employeeId:
 *           type: number
 *           nullable: true
 *           description: Employee id
 *         proceedingFileId:
 *           type: number
 *           nullable: true
 *           description: Proceeding file id
 *         proceedingFileTypePropertyValueCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the proceeding file type property value was created
 *         proceedingFileTypePropertyValueUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the proceeding file type property value was last updated
 *         proceedingFileTypePropertyValueDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the proceeding file type property value was soft-deleted
 *       example:
 *         proceedingFileTypePropertyValueId: 1
 *         proceedingFileTypePropertyValueValue: 'Ingles'
 *         proceedingFileTypePropertyValueActive: 1
 *         proceedingFileTypePropertyId: 1
 *         employeeId: 1
 *         proceedingFileId: 1
 *         proceedingFileTypePropertyValueCreatedAt: '2025-03-12T12:00:00Z'
 *         proceedingFileTypePropertyValueUpdatedAt: '2025-03-12T13:00:00Z'
 *         proceedingFileTypePropertyValueDeletedAt: null
 */

export default class ProceedingFileTypePropertyValue extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare proceedingFileTypePropertyValueId: number

  @column()
  declare proceedingFileTypePropertyValueValue: string

  @column()
  declare proceedingFileTypePropertyValueActive: number

  @column()
  declare proceedingFileTypePropertyId: number

  @column()
  declare employeeId: number | null

  @column()
  declare proceedingFileId: number

  @column.dateTime({ autoCreate: true })
  declare proceedingFileTypePropertyValueCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare proceedingFileTypePropertyValueUpdatedAt: DateTime

  @column.dateTime({ columnName: 'proceeding_file_type_property_value_deleted_at' })
  declare deletedAt: DateTime | null
}

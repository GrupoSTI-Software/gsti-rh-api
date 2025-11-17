import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import MedicalConditionTypeProperty from './medical_condition_type_property.js'
import EmployeeMedicalCondition from './employee_medical_condition.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionTypePropertyValue:
 *       type: object
 *       properties:
 *         medicalConditionTypePropertyValueId:
 *           type: number
 *           description: Medical condition type property value ID
 *         medicalConditionTypePropertyId:
 *           type: number
 *           description: Medical condition type property ID
 *         employeeMedicalConditionId:
 *           type: number
 *           description: Employee medical condition ID
 *         medicalConditionTypePropertyValue:
 *           type: string
 *           description: Property value
 *         medicalConditionTypePropertyValueActive:
 *           type: number
 *           description: Property value status
 *         medicalConditionTypePropertyValueCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyValueUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyValueDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionTypePropertyValue extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare medicalConditionTypePropertyValueId: number

  @column()
  declare medicalConditionTypePropertyId: number

  @column()
  declare employeeMedicalConditionId: number

  @column()
  declare medicalConditionTypePropertyValue: string

  @column()
  declare medicalConditionTypePropertyValueActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypePropertyValueCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypePropertyValueUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_property_value_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => MedicalConditionTypeProperty, {
    foreignKey: 'medicalConditionTypePropertyId',
  })
  declare medicalConditionTypeProperty: BelongsTo<typeof MedicalConditionTypeProperty>

  @belongsTo(() => EmployeeMedicalCondition, {
    foreignKey: 'employeeMedicalConditionId',
  })
  declare employeeMedicalCondition: BelongsTo<typeof EmployeeMedicalCondition>
}

import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import MedicalConditionType from './medical_condition_type.js'
import MedicalConditionTypePropertyValue from './medical_condition_type_property_value.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionTypeProperty:
 *       type: object
 *       properties:
 *         medicalConditionTypePropertyId:
 *           type: number
 *           description: Medical condition type property ID
 *         medicalConditionTypePropertyName:
 *           type: string
 *           description: Medical condition type property name
 *         medicalConditionTypePropertyDescription:
 *           type: string
 *           description: Medical condition type property description
 *         medicalConditionTypePropertyDataType:
 *           type: string
 *           description: Medical condition type property data type
 *         medicalConditionTypePropertyRequired:
 *           type: number
 *           description: Medical condition type property required flag
 *         medicalConditionTypeId:
 *           type: number
 *           description: Medical condition type ID
 *         medicalConditionTypePropertyActive:
 *           type: number
 *           description: Medical condition type property status
 *         medicalConditionTypePropertyCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionTypeProperty extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare medicalConditionTypePropertyId: number

  @column()
  declare medicalConditionTypePropertyName: string

  @column()
  declare medicalConditionTypePropertyDescription: string

  @column()
  declare medicalConditionTypePropertyDataType: string

  @column()
  declare medicalConditionTypePropertyRequired: number

  @column()
  declare medicalConditionTypeId: number

  @column()
  declare medicalConditionTypePropertyActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypePropertyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypePropertyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_property_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => MedicalConditionType, {
    foreignKey: 'medicalConditionTypeId',
  })
  declare medicalConditionType: BelongsTo<typeof MedicalConditionType>

  @hasMany(() => MedicalConditionTypePropertyValue, {
    foreignKey: 'medicalConditionTypePropertyId',
    onQuery: (query) => {
      query.whereNull('medical_condition_type_property_value_deleted_at')
    },
  })
  declare propertyValues: HasMany<typeof MedicalConditionTypePropertyValue>
}

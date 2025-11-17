import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import MedicalConditionTypeProperty from './medical_condition_type_property.js'
import EmployeeMedicalCondition from './employee_medical_condition.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionType:
 *       type: object
 *       properties:
 *         medicalConditionTypeId:
 *           type: number
 *           description: Medical condition type ID
 *         medicalConditionTypeName:
 *           type: string
 *           description: Medical condition type name
 *         medicalConditionTypeDescription:
 *           type: string
 *           description: Medical condition type description
 *         medicalConditionTypeActive:
 *           type: number
 *           description: Medical condition type status
 *         medicalConditionTypeCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypeUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionType extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare medicalConditionTypeId: number

  @column()
  declare medicalConditionTypeName: string

  @column()
  declare medicalConditionTypeDescription: string

  @column()
  declare medicalConditionTypeActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => MedicalConditionTypeProperty, {
    foreignKey: 'medicalConditionTypeId',
    onQuery: (query) => {
      query.whereNull('medical_condition_type_property_deleted_at')
    },
  })
  declare properties: HasMany<typeof MedicalConditionTypeProperty>

  @hasMany(() => EmployeeMedicalCondition, {
    foreignKey: 'medicalConditionTypeId',
    onQuery: (query) => {
      query.whereNull('employee_medical_condition_deleted_at')
    },
  })
  declare employeeMedicalConditions: HasMany<typeof EmployeeMedicalCondition>
}

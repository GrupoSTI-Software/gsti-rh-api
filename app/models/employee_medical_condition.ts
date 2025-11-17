import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import MedicalConditionType from './medical_condition_type.js'
import MedicalConditionTypePropertyValue from './medical_condition_type_property_value.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeMedicalCondition:
 *       type: object
 *       properties:
 *         employeeMedicalConditionId:
 *           type: number
 *           description: Employee medical condition ID
 *         employeeId:
 *           type: number
 *           description: Employee ID
 *         medicalConditionTypeId:
 *           type: number
 *           description: Medical condition type ID
 *         employeeMedicalConditionDiagnosis:
 *           type: string
 *           description: Medical condition diagnosis
 *         employeeMedicalConditionTreatment:
 *           type: string
 *           description: Medical condition treatment
 *         employeeMedicalConditionNotes:
 *           type: string
 *           description: Medical condition notes
 *         employeeMedicalConditionActive:
 *           type: number
 *           description: Medical condition status
 *         employeeMedicalConditionCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeMedicalConditionUpdatedAt:
 *           type: string
 *           format: date-time
 *         employeeMedicalConditionDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmployeeMedicalCondition extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeMedicalConditionId: number

  @column()
  declare employeeId: number

  @column()
  declare medicalConditionTypeId: number

  @column()
  declare employeeMedicalConditionDiagnosis: string

  @column()
  declare employeeMedicalConditionTreatment: string

  @column()
  declare employeeMedicalConditionNotes: string

  @column()
  declare employeeMedicalConditionActive: number

  @column.dateTime({ autoCreate: true })
  declare employeeMedicalConditionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeMedicalConditionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_medical_condition_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => MedicalConditionType, {
    foreignKey: 'medicalConditionTypeId',
  })
  declare medicalConditionType: BelongsTo<typeof MedicalConditionType>

  @hasMany(() => MedicalConditionTypePropertyValue, {
    foreignKey: 'employeeMedicalConditionId',
    onQuery: (query) => {
      query.whereNull('medical_condition_type_property_value_deleted_at')
    },
  })
  declare propertyValues: HasMany<typeof MedicalConditionTypePropertyValue>
}

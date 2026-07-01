import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import encryption from '@adonisjs/core/services/encryption'
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

  /**
   * Diagnóstico médico — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de salud sensible reforzado). No se usa en cláusulas WHERE de SQL.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare employeeMedicalConditionDiagnosis: string

  /**
   * Notas del padecimiento — cifradas AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de salud sensible reforzado). No se usa en cláusulas WHERE de SQL.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
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

import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeBiometric:
 *       type: object
 *       properties:
 *         employeeBiometricId:
 *           type: number
 *           description: Employee biometric id
 *         employeeId:
 *           type: number
 *           description: Employee id
 *         employeeBiometricData:
 *           type: string
 *           description: Biometric data in format "Finger:1, Finger:2, Face"
 *         employeeBiometricCreatedAt:
 *           type: string
 *         employeeBiometricUpdatedAt:
 *           type: string
 *         employeeBiometricDeletedAt:
 *           type: string
 */
export default class EmployeeBiometric extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeBiometricId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeBiometricData: string

  @column()
  declare employeeBiometricStatus:
    | 'pending'
    | 'enrolling'
    | 'completed_fingers'
    | 'completed_face'
    | 'completed_both'
    | 'failed'

  @column.dateTime({ autoCreate: true })
  declare employeeBiometricCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBiometricUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_biometric_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}

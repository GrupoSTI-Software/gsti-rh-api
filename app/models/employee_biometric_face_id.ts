import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeBiometricFaceId:
 *        type: object
 *        properties:
 *          employeeBiometricFaceIdId:
 *            type: number
 *            description: Employee Biometric Face ID identifier
 *          employeeId:
 *            type: number
 *            description: Employee ID
 *          employeeBiometricFaceIdPhotoUrl:
 *            type: string
 *            description: URL of the biometric face photo stored in S3
 *          employeeBiometricFaceIdCreatedAt:
 *            type: string
 *            format: date-time
 *          employeeBiometricFaceIdUpdatedAt:
 *            type: string
 *            format: date-time
 *          employeeBiometricFaceIdDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class EmployeeBiometricFaceId extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeBiometricFaceIdId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeBiometricFaceIdPhotoUrl: string

  @column.dateTime({ autoCreate: true })
  declare employeeBiometricFaceIdCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBiometricFaceIdUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_biometric_face_id_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}


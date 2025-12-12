import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeZone:
 *       type: object
 *       properties:
 *         employeeZoneId:
 *           type: number
 *           description: Employee zone ID
 *         employeeId:
 *           type: number
 *           description: ID of the associated employee
 *           nullable: false
 *         zoneId:
 *           type: number
 *           nullable: false
 *           description: ID of the associated zone
 *         employeeZoneCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee zone was created
 *         employeeZoneUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee zone was last updated
 *         employeeZoneDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the employee zone was soft-deleted
 *       example:
 *         employeeZoneId: 1
 *         employeeId: 1
 *         zoneId: 1
 *         employeeZoneCreatedAt: '2025-12-12T12:00:00Z'
 *         employeeZoneUpdatedAt: '2025-12-12T13:00:00Z'
 *         employeeZoneDeletedAt: null
 */

export default class EmployeeZone extends compose(BaseModel, SoftDeletes)  {
  @column({ isPrimary: true })
  declare employeeZoneId: number

  @column()
  declare employeeId: number

  @column()
  declare zoneId: number

  @column.dateTime({ autoCreate: true })
  declare employeeZoneCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeZoneUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_zone_deleted_at' })
  declare deletedAt: DateTime | null
}

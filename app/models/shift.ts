import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import EmployeeShift from './employee_shift.js'
import * as relations from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     Shift:
 *       type: object
 *       properties:
 *         shiftId:
 *           type: number
 *           description: Shift ID
 *         shiftName:
 *           type: string
 *           description: Name of the shift
 *           nullable: false
 *         shiftCalculateFlag:
 *           type: string
 *           description: Name of the shift that apply to generate dynamic calendar ex. 24x48
 *           nullable: false
 *         shiftDayStart:
 *           type: number
 *           description: Day the shift starts
 *           nullable: false
 *         shiftTimeStart:
 *           type: string
 *           description: Time the shift starts (HH:mm format)
 *           nullable: false
 *         shiftActiveHours:
 *           type: number
 *           description: Number of active hours in the shift
 *           nullable: false
 *         shiftActiveMinutes:
 *           type: number
 *           description: Number of active minutes in the shift
 *           nullable: false
 *         shiftRestDays:
 *           type: string
 *           description: Rest days for the shift (comma-separated values)
 *           nullable: false
 *         shiftAccumulatedFault:
 *           type: number
 *           description: Accumulated Faults
 *           nullable: false
 *         shiftBusinessUnits:
 *            type: string
 *            description: Available business Units
 *         shiftTemp:
 *           type: number
 *           description: Shift is temp
 *           nullable: true
 *         shiftCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the shift was created
 *         shiftUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the shift was last updated
 *         shiftDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the shift was soft-deleted
 *       example:
 *         shiftId: 1
 *         shiftName: "Morning Shift"
 *         shiftDayStart: 1
 *         shiftTimeStart: "08:00"
 *         shiftActiveHours: 8
 *         shiftActiveMinutes: 0
 *         shiftRestDays: "0,6"
 *         shiftAccumulatedFault: 1
 *         shiftTemp: 0
 *         shiftCreatedAt: "2024-06-20T12:00:00Z"
 *         shiftUpdatedAt: "2024-06-20T13:00:00Z"
 *         shiftDeletedAt: null
 */

export default class Shift extends BaseModel {
  @column({ isPrimary: true })
  declare shiftId: number

  @column()
  declare shiftName: string

  @column()
  declare shiftCalculateFlag: string

  @column()
  declare shiftDayStart: number | null

  @column()
  declare shiftTimeStart: string

  @column()
  declare shiftActiveHours: number

  @column()
  declare shiftActiveMinutes: number

  @column()
  declare shiftRestDays: string

  @column()
  declare shiftAccumulatedFault: number

  @column()
  declare shiftBusinessUnits: string

  @column()
  declare shiftTemp: number

  @column.dateTime({ autoCreate: true })
  declare shiftCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare shiftUpdatedAt: DateTime

  @column.dateTime()
  declare shiftDeletedAt: DateTime

  @hasMany(() => EmployeeShift, {
    foreignKey: 'shiftId',
  })
  declare employees: relations.HasMany<typeof EmployeeShift>
}

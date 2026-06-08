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
 *         shiftAlias:
 *           type: string
 *           description: Alias of the shift (must be unique per active business unit)
 *           nullable: true
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
 *         shiftLunchTime:
 *           type: number
 *           description: Lunch time in minutes
 *           nullable: true
 *         shiftCompensableLunchSchedule:
 *           type: tinyint
 *           description: Compensable lunch schedule
 *           nullable: true
 *         shiftColor:
 *           type: string
 *           description: Color code for the shift
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
 *         shiftAlias: "MAÑ"
 *         shiftDayStart: 1
 *         shiftTimeStart: "08:00"
 *         shiftActiveHours: 8
 *         shiftRestDays: "0,6"
 *         shiftAccumulatedFault: 1
 *         shiftTemp: 0
 *         shiftLunchTime: 60
 *         shiftCompensableLunchSchedule: 0
 *         shiftColor: "#e67e22"
 *         shiftCreatedAt: "2024-06-20T12:00:00Z"
 *         shiftUpdatedAt: "2024-06-20T13:00:00Z"
 *         shiftDeletedAt: null
 */

/**
 * @tenant-scope pendiente
 * Shift no tiene una columna FK directa `business_unit_id`; usa el campo
 * `shiftBusinessUnits` (CSV de slugs) para la relación con unidades de negocio.
 * Antes de aplicar `withBusinessUnitScope()` se requiere una migración que
 * agregue la columna `business_unit_id` y normalice el campo CSV existente.
 * Hasta entonces, el filtrado de tenant en Shift se gestiona manualmente en
 * los servicios mediante FIND_IN_SET sobre `shift_business_units`.
 */
export default class Shift extends BaseModel {
  @column({ isPrimary: true })
  declare shiftId: number

  @column()
  declare shiftName: string

  @column()
  declare shiftAlias: string | null

  @column()
  declare shiftCalculateFlag: string

  @column()
  declare shiftDayStart: number | null

  @column()
  declare shiftTimeStart: string

  @column()
  declare shiftActiveHours: number

  @column()
  declare shiftRestDays: string

  @column()
  declare shiftAccumulatedFault: number

  @column()
  declare shiftBusinessUnits: string

  @column()
  declare shiftTemp: number

  @column()
  declare shiftLunchTime: number | null

  @column()
  declare shiftCompensableLunchSchedule: number | null

  @column()
  declare shiftColor: string

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

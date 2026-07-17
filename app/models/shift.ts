import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import EmployeeShift from './employee_shift.js'
import BranchOfficeShiftQuota from './branch_office_shift_quota.js'
import * as relations from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

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
 *            description: Espejo denormalizado legado (CSV de slugs). Ya no gobierna el aislamiento; ver businessUnitId.
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio dueña del turno (marca autoritativa de aislamiento, USRH1783821206521)
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
 * @tenant-scope activo (USRH1783821206521)
 * Shift es un modelo dueño de primer nivel (como Employee): cada turno tiene
 * una unidad dueña única en `business_unit_id`, aplicada automáticamente por
 * `withBusinessUnitScope()` en toda query. `shiftBusinessUnits` (CSV de slugs)
 * se conserva como espejo denormalizado por compatibilidad con lectores
 * existentes, pero deja de gobernar el aislamiento.
 */
export default class Shift extends compose(BaseModel, withBusinessUnitScope()) {
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

  /** Unidad de negocio dueña del turno (marca autoritativa de aislamiento). */
  @column()
  declare businessUnitId: number

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

  @hasMany(() => BranchOfficeShiftQuota, {
    foreignKey: 'shiftId',
  })
  declare branchOfficeShiftQuotas: relations.HasMany<typeof BranchOfficeShiftQuota>
}

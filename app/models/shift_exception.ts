import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Employee from './employee.js'
import ExceptionType from './exception_type.js'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import VacationSetting from './vacation_setting.js'
import VacationAuthorizationSignature from './vacation_authorization_signature.js'
import EmployeeVacationArchiveContent from './employee_vacation_archive_content.js'
import EmployeeLactationPeriod from './employee_lactation_period.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     ShiftException:
 *       type: object
 *       properties:
 *         shiftExceptionId:
 *           type: number
 *           description: Shift exception ID
 *         employeeId:
 *           type: number
 *           nullable: false
 *           description: ID of the employee associated with the shift exception
 *         exceptionTypeId:
 *           type: number
 *           nullable: false
 *           description: ID of the exception type associated with the shift exception
 *         shiftExceptionDate:
 *           type: string
 *           format: date
 *           description: Date of the shift exception
 *         shiftExceptionDescription:
 *           type: string
 *           description: Description of the shift exception
 *         vacationSettingId:
 *           type: number
 *           nullable: true
 *           description: ID of the vacation setting associated with the shift exception
 *         shiftExceptionCheckInTime:
 *           type: string
 *           format: time
 *           description: Time check in
 *           nullable: true
 *         shiftExceptionCheckOutTime:
 *           type: string
 *           format: time
 *           description: Time check out
 *           nullable: true
 *         shiftExceptionEnjoymentOfSalary:
 *           type: number
 *           description: Enjoyment of salary
 *           nullable: true
 *         shiftExceptionTimeByTime:
 *           type: number
 *           description: Time by time
 *           nullable: true
 *         workDisabilityPeriodId:
 *           type: number
 *           description: Reference to work disability period id
 *           nullable: true
 *         lactationPeriodId:
 *           type: number
 *           description: Referencia al periodo de lactancia origen, cuando la excepción se generó automáticamente desde `employee_lactation_periods`.
 *           nullable: true
 *         shiftExceptionCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the shift exception was created
 *         shiftExceptionUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the shift exception was last updated
 *         shiftExceptionDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the shift exception was soft-deleted
 *         employee:
 *           $ref: '#/components/schemas/Employee'
 *           description: Employee associated with this shift exception
 *         exceptionType:
 *           $ref: '#/components/schemas/ExceptionType'
 *           description: Exception type associated with this shift exception
 *       example:
 *         shiftExceptionId: 1
 *         employeeId: 1
 *         exceptionTypeId: 1
 *         vacationSettingId: 1
 *         shiftExceptionsDate: '2024-06-20'
 *         shiftExceptionsDescription: "Employee was absent from work"
 *         shiftExceptionCheckInTime: '07:00:00'
 *         shiftExceptionCheckOutTime: '21:00:00'
 *         shiftExceptionEnjoymentOfSalary: 0
 *         shiftExceptionTimeByTime: 0
 *         workDisabilityPeriodId: null
 *         shiftExceptionCreatedAt: '2024-06-20T12:00:00Z'
 *         shiftExceptionUpdatedAt: '2024-06-20T13:00:00Z'
 *         shiftExceptionDeletedAt: null
 *         daysToApply: 0
 *         employee:
 *           # Example Employee object
 *         exceptionType:
 *           # Example ExceptionType object
 *         vacattionSetting:
 *           # Example ExceptionType object
 */
export default class ShiftException extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare shiftExceptionId: number

  @column()
  declare employeeId: number

  @column()
  declare exceptionTypeId: number

  @column()
  declare shiftExceptionsDate: Date | string

  @column()
  declare shiftExceptionsDescription: string

  @column()
  declare shiftExceptionCheckInTime: string | null

  @column()
  declare shiftExceptionCheckOutTime: string | null

  @column()
  declare shiftExceptionEnjoymentOfSalary: number | null

  @column()
  declare shiftExceptionTimeByTime: number | null

  @column()
  declare workDisabilityPeriodId: number | null

  @column.dateTime({ autoCreate: true })
  declare shiftExceptionsCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare shiftExceptionsUpdatedAt: DateTime

  @column()
  declare vacationSettingId: number | null

  /**
   * FK al periodo de lactancia que originó la excepción. `null` cuando la
   * excepción no proviene del flujo de lactancia (la inmensa mayoría).
   * Permite borrar/regenerar excepciones por periodo en bloque desde
   * `ShiftExceptionService.{generate,regenerate,destroy}ForLactationPeriod`.
   */
  @column()
  declare lactationPeriodId: number | null

  @column.dateTime({ columnName: 'shift_exceptions_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => VacationAuthorizationSignature)
  declare vacationAuthorizationSignatures: HasMany<typeof VacationAuthorizationSignature>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => ExceptionType, {
    foreignKey: 'exceptionTypeId',
  })
  declare exceptionType: BelongsTo<typeof ExceptionType>

  @belongsTo(() => VacationSetting, {
    foreignKey: 'vacationSettingId',
  })
  declare vacationSetting: BelongsTo<typeof VacationSetting>

  @belongsTo(() => EmployeeLactationPeriod, {
    foreignKey: 'lactationPeriodId',
  })
  declare lactationPeriod: BelongsTo<typeof EmployeeLactationPeriod>

  @manyToMany(() => EmployeeVacationArchiveContent, {
    pivotTable: 'employee_vacation_archive_content_shift_exceptions',
    pivotForeignKey: 'shift_exception_id',
    pivotRelatedForeignKey: 'employee_vacation_archive_content_id',
    relatedKey: 'employeeVacationArchiveContentId',
    localKey: 'shiftExceptionId',
  })
  declare employeeVacationArchiveContents: ManyToMany<typeof EmployeeVacationArchiveContent>
}

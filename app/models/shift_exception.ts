import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Employee from './employee.js'
import ExceptionType from './exception_type.js'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import VacationSetting from './vacation_setting.js'
import VacationAuthorizationSignature from './vacation_authorization_signature.js'
import EmployeeVacationArchiveContent from './employee_vacation_archive_content.js'
import EmployeeLactationPeriod from './employee_lactation_period.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
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
 *         shiftExceptionsLactationReplacedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Cuando esta fila es resultado de una REASIGNACIÓN de un día de lactancia por conflicto, conserva la fecha del día revocado original (auditoría STPS).
 *         shiftExceptionsLactationRevokeReason:
 *           type: string
 *           nullable: true
 *           description: |
 *             Motivo estable del soft-delete / reasignación cuando aplica. Valores: `vacation_conflict`, `work_disability_conflict`, `maternity_conflict`, `rest_or_permission_conflict`, `holiday_conflict`, `reassigned`, `manual_revoke`.
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
export default class ShiftException extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare shiftExceptionId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (cierre de fuga IDOR, USRH1784259058577). */
  @column()
  declare businessUnitId: number

  @column()
  declare exceptionTypeId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1784259058577). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: ShiftException) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

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

  /**
   * Si la fila es resultado de una REASIGNACIÓN de un día de lactancia
   * (HU de gestión de conflictos), conserva la fecha del día revocado
   * original para que el reporte de cumplimiento pueda trazarlo
   * (auditoría STPS). `null` cuando no aplica.
   */
  @column.date({ columnName: 'shift_exceptions_lactation_replaced_date' })
  declare shiftExceptionsLactationReplacedDate: DateTime | null

  /**
   * Motivo del soft-delete / reasignación de una fila de lactancia.
   * Valores estables: 'vacation_conflict', 'work_disability_conflict',
   * 'maternity_conflict', 'rest_or_permission_conflict',
   * 'holiday_conflict', 'reassigned', 'manual_revoke'. `null` cuando no
   * aplica (la fila no ha sido revocada/reasignada por el flujo de
   * conflictos).
   */
  @column({ columnName: 'shift_exceptions_lactation_revoke_reason' })
  declare shiftExceptionsLactationRevokeReason: string | null

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

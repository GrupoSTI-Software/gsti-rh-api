import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shift from './shift.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeShiftChange:
 *        type: object
 *        properties:
 *          employeeShiftChangeId:
 *            type: number
 *            description: Employee shift change ID
 *          employeeIdFrom:
 *            type: number
 *            description: Employee id from
 *          shiftIdFrom:
 *            type: number
 *            description: Shift id from
 *          employeeShiftChangeDateFrom:
 *           type: string
 *           format: date
 *           description: Employee shift change date from
 *          employeeShiftChangeDateFromIsRestDay:
 *           type: number
 *           description: Employee shift change date from is rest day
 *          employeeIdTo:
 *            type: number
 *            description: Employee id to
 *          shiftIdTo:
 *            type: number
 *            description: Shift id to
 *          employeeShiftChangeDateTo:
 *           type: string
 *           format: date
 *           description: Employee shift change date to
 *          employeeShiftChangeDateToIsRestDay:
 *           type: number
 *           description: Employee shift change date to is rest day
 *          employeeShiftChangeChangeThisShift:
 *           type: number
 *           description: Employee shift change change this shift
 *          employeeShiftChangeNote:
 *           type: strung
 *           description: Employee shift change note
 *          employeeShiftChangeCreatedAt:
 *            type: string
 *            format: date-time
 *          employeeShiftChangeUpdatedAt:
 *            type: string
 *            format: date-time
 *          employeeShiftChangeDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class EmployeeShiftChange extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeShiftChangeId: number

  @column()
  declare employeeIdFrom: number

  @column()
  declare shiftIdFrom: number

  @column()
  declare employeeShiftChangeDateFrom: string

  @column()
  declare employeeShiftChangeDateFromIsRestDay: number

  @column()
  declare employeeIdTo: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08).
   * Derivada de `employeeIdTo` (empleado que queda con el turno).
   */
  @column()
  declare businessUnitId: number

  @column()
  declare shiftIdTo: number

  /** Resuelve businessUnitId desde employeeIdTo (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeShiftChange) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeIdTo).first(),
      'el empleado destino'
    )
  }

  @column()
  declare employeeShiftChangeDateTo: string

  @column()
  declare employeeShiftChangeDateToIsRestDay: number

  @column()
  declare employeeShiftChangeChangeThisShift: number

  @column()
  declare employeeShiftChangeNote: string

  @column.dateTime({ autoCreate: true })
  declare employeeShiftChangeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeShiftChangeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_shift_change_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeIdTo',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    }
  })
  declare employeeTo: BelongsTo<typeof Employee>

  @belongsTo(() => Shift, {
    foreignKey: 'shiftIdTo',
  })
  declare shiftTo: BelongsTo<typeof Shift>

  @belongsTo(() => Shift, {
    foreignKey: 'shiftIdFrom',
  })
  declare shiftFrom: BelongsTo<typeof Shift>
}

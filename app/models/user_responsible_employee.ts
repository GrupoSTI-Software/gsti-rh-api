import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Employee from './employee.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
/**
 * @swagger
 * components:
 *   schemas:
 *      UserResponsibleEmployee:
 *        type: object
 *        properties:
 *          userResponsibleEmployeeId:
 *            type: number
 *            description: User responsible employee ID
 *          userId:
 *            type: number
 *            description: User Id
 *          employeeId:
 *            type: number
 *            description: Employee Id
 *          userResponsibleEmployeeReadonly:
 *            type: number
 *            description: User responsible employee readonly
 *          userResponsibleEmployeeDirectBoss:
 *            type: number
 *            description: User responsible employee direct boss
 *          userResponsibleEmployeeCreatedAt:
 *            type: string
 *            format: date-time
 *          userResponsibleEmployeeUpdatedAt:
 *            type: string
 *            format: date-time
 *          userResponsibleEmployeeDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class UserResponsibleEmployee extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare userResponsibleEmployeeId: number

  @column()
  declare userId: number

  @column()
  declare employeeId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058533).
   * Se ancla en el empleado, no en el usuario responsable.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: UserResponsibleEmployee) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare userResponsibleEmployeeReadonly: number

  @column()
  declare userResponsibleEmployeeDirectBoss: number

  @column.dateTime({ autoCreate: true })
  declare userResponsibleEmployeeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userResponsibleEmployeeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'user_responsible_employee_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'userId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
        query.preload('role')
      }
    }
  })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    }
  })
  declare employee: BelongsTo<typeof Employee>
}

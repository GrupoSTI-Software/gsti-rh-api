import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo,  column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Zone from './zone.js'
import Employee from './employee.js'
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

export default class EmployeeZone extends compose(BaseModel, SoftDeletes, withBusinessUnitScope())  {
  @column({ isPrimary: true })
  declare employeeZoneId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeZone) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare zoneId: number

  @column.dateTime({ autoCreate: true })
  declare employeeZoneCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeZoneUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_zone_deleted_at' })
  declare deletedAt: DateTime | null



  @belongsTo(() => Zone, {
    foreignKey: 'zoneId',
  })
  declare zone: BelongsTo<typeof Zone>
}

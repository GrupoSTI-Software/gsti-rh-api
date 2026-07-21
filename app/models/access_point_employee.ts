import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import Employee from './employee.js'
import AccessPoint from './access_point.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *     AccessPointEmployee:
 *       type: object
 *       properties:
 *         accessPointEmployeeId:
 *           type: number
 *           description: Id de la relación entre el empleado y el punto de acceso
 *         employeeId:
 *           type: number
 *           description: Id del empleado
 *         accessPointId:
 *           type: number
 *           description: Id del punto de acceso
 *         accessPointEmployeePin:
 *           type: string
 *           description: Pin del empleado en el punto de acceso
 *         accessPointEmployeeCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de creación de la relación entre el empleado y el punto de acceso
 *         accessPointEmployeeUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de actualización de la relación entre el empleado y el punto de acceso
 *         accessPointEmployeeDeletedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de eliminación de la relación entre el empleado y el punto de acceso
 */
export default class AccessPointEmployee extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare accessPointEmployeeId: number

  @column()
  declare employeeId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058533).
   * Se ancla en el empleado, no en el punto de acceso.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: AccessPointEmployee) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare accessPointId: number

  @column()
  declare accessPointEmployeePin: string

  @column.dateTime({ autoCreate: true })
  declare accessPointEmployeeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointEmployeeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'access_point_employee_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => AccessPoint, {
    foreignKey: 'accessPointId',
  })
  declare accessPoint: BelongsTo<typeof AccessPoint>
}

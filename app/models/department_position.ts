import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import Position from './position.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *      DepartmentPosition:
 *        type: object
 *        properties:
 *          departmentPositionId:
 *            type: number
 *            description: Department position id
 *          departmentId:
 *            type: number
 *            description: Department id
 *          positionId:
 *            type: number
 *            description: Position id
 *          departmentPositionLastSynchronizationAt:
 *            type: string
 *            description: Last sync date
 *          departmentPositionCreatedAt:
 *            type: string
 *          departmentPositionUpdatedAt:
 *            type: string
 *          departmentPositionDeletedAt:
 *            type: string
 *
 */
export default class DepartmentPosition extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'department_position'

  @column({ isPrimary: true })
  declare departmentPositionId: number

  @column()
  declare departmentId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08).
   * Derivada de `positions.business_unit_id` vía `positionId`.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el puesto padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: DepartmentPosition) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Position.query().where('positionId', instance.positionId).first(),
      'el puesto'
    )
  }

  @column()
  declare positionId: number

  @column()
  declare departmentPositionLastSynchronizationAt: Date

  @column.dateTime({ autoCreate: true })
  declare departmentPositionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare departmentPositionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'department_position_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('parentPosition')
      }
    },
  })
  declare position: BelongsTo<typeof Position>
}

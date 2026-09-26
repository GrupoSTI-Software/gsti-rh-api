import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from './position.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionSpecificFunction:
 *        type: object
 *        properties:
 *          positionSpecificFunctionId:
 *            type: number
 *            description: Position specific function id
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionSpecificFunctionName:
 *            type: string
 *            description: Position specific function name
 *          positionSpecificFunctionFrequency:
 *            type: string
 *            description: Position specific function type
 *          positionSpecificFunctionCreatedAt:
 *            type: string
 *            description: Position specific function created at
 *          positionSpecificFunctionUpdatedAt:
 *            type: string
 *          positionSpecificFunctionDeletedAt:
 *            type: string
 *            description: Position specific function deleted at
 */

export default class PositionSpecificFunction extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare positionSpecificFunctionId: number

  @column()
  declare positionId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el puesto padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: PositionSpecificFunction) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Position.query().where('positionId', instance.positionId).first(),
      'el puesto'
    )
  }

  @column()
  declare positionSpecificFunctionName: string

  @column()
  declare positionSpecificFunctionFrequency: string

  @column.dateTime({ autoCreate: true })
  declare positionSpecificFunctionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionSpecificFunctionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_specific_function_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>
}

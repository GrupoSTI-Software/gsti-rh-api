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
 *      PositionWorkTool:
 *        type: object
 *        properties:
 *          positionWorkToolId:
 *            type: number
 *            description: Position work tool id
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionWorkToolName:
 *            type: string
 *            description: Position work tool name
 *          positionWorkToolCreatedAt:
 *            type: string
 *            description: Position work tool created at
 *          positionWorkToolUpdatedAt:
 *            type: string
 *            description: Position work tool updated at
 *          positionWorkToolDeletedAt:
 *            type: string
 *            description: Position work tool deleted at
 */

export default class PositionWorkTool extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare positionWorkToolId: number

  @column()
  declare positionId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el puesto padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: PositionWorkTool) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Position.query().where('positionId', instance.positionId).first(),
      'el puesto'
    )
  }

  @column()
  declare positionWorkToolName: string

  @column.dateTime({ autoCreate: true })
  declare positionWorkToolCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionWorkToolUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_work_tool_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>
}

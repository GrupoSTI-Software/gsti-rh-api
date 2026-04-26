import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
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

export default class PositionWorkTool extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionWorkToolId: number

  @column()
  declare positionId: number

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

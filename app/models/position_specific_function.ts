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
 *          positionSpecificFunctionType:
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

export default class PositionSpecificFunction extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionSpecificFunctionId: number

  @column()
  declare positionId: number

  @column()
  declare positionSpecificFunctionName: string

  @column()
  declare positionSpecificFunctionType: string

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

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
 *      PositionApprovalHistory:
 *        type: object
 *        properties:
 *          positionApprovalHistoryId:
 *            type: number
 *            description: Position approval history id
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionApprovalHistoryDate:
 *            type: string
 *            description: Approval history date
 *          positionApprovalHistoryCreatedAt:
 *            type: string
 *            description: Approval history created at
 *          positionApprovalHistoryUpdatedAt:
 *            type: string
 *          positionApprovalHistoryDeletedAt:
 *            type: string
 *            description: Approval history deleted at
 */

export default class PositionApprovalHistory extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionApprovalHistoryId: number

  @column()
  declare positionId: number

  @column()
  declare positionApprovalHistoryDate: Date

  @column.dateTime({ autoCreate: true })
  declare positionApprovalHistoryCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionApprovalHistoryUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_approval_history_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>
}

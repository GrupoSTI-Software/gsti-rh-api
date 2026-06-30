import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'

export default class AttentionActionLevel extends compose(BaseModel, SoftDeletes) {
  static table = 'attention_action_levels'

  @column({ isPrimary: true })
  declare attentionActionLevelId: number

  @column()
  declare regulationId: number

  @column()
  declare regulationClauseId: number | null

  @column()
  declare attentionActionLevelCode: string

  @column()
  declare attentionActionLevelNameKey: string

  @column()
  declare attentionActionLevelOrder: number

  @column.dateTime({ autoCreate: true })
  declare attentionActionLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare attentionActionLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'attention_action_level_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Regulation, { foreignKey: 'regulationId' })
  declare regulation: BelongsTo<typeof Regulation>

  @belongsTo(() => RegulationClause, { foreignKey: 'regulationClauseId' })
  declare clause: BelongsTo<typeof RegulationClause>
}

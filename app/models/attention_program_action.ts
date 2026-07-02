import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AttentionProgram from '#models/attention_program'
import PsychosocialDimension from '#models/psychosocial_dimension'
import AttentionActionLevel from '#models/attention_action_level'

export type AttentionProgramActionStatus = 'pendiente' | 'en-curso' | 'cumplida'

export default class AttentionProgramAction extends compose(BaseModel, SoftDeletes) {
  static table = 'attention_program_actions'

  @column({ isPrimary: true })
  declare attentionProgramActionId: number

  @column()
  declare attentionProgramId: number

  @column()
  declare psychosocialDimensionId: number

  @column()
  declare attentionActionLevelId: number

  @column()
  declare attentionProgramActionTarget: string

  @column()
  declare attentionProgramActionDescription: string

  @column.date()
  declare attentionProgramActionStartDate: DateTime

  @column.date()
  declare attentionProgramActionEndDate: DateTime

  @column()
  declare attentionProgramActionProgress: string

  @column()
  declare attentionProgramActionEvaluation: string

  @column()
  declare attentionProgramActionResponsible: string

  @column()
  declare attentionProgramActionStatus: AttentionProgramActionStatus

  @column.dateTime({ autoCreate: true })
  declare attentionProgramActionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare attentionProgramActionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'attention_program_action_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => AttentionProgram, { foreignKey: 'attentionProgramId' })
  declare attentionProgram: BelongsTo<typeof AttentionProgram>

  @belongsTo(() => PsychosocialDimension, { foreignKey: 'psychosocialDimensionId' })
  declare psychosocialDimension: BelongsTo<typeof PsychosocialDimension>

  @belongsTo(() => AttentionActionLevel, { foreignKey: 'attentionActionLevelId' })
  declare attentionActionLevel: BelongsTo<typeof AttentionActionLevel>
}

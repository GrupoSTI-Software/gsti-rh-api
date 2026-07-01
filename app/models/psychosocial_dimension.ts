import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'

export default class PsychosocialDimension extends compose(BaseModel, SoftDeletes) {
  static table = 'psychosocial_dimensions'

  @column({ isPrimary: true })
  declare psychosocialDimensionId: number

  @column()
  declare regulationId: number

  @column()
  declare regulationClauseId: number | null

  @column()
  declare psychosocialDimensionCode: string

  @column()
  declare psychosocialDimensionNameKey: string

  @column()
  declare psychosocialDimensionOrd: number

  @column.dateTime({ autoCreate: true })
  declare psychosocialDimensionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare psychosocialDimensionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'psychosocial_dimension_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Regulation, { foreignKey: 'regulationId' })
  declare regulation: BelongsTo<typeof Regulation>

  @belongsTo(() => RegulationClause, { foreignKey: 'regulationClauseId' })
  declare clause: BelongsTo<typeof RegulationClause>
}

import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import RegulationQuestionnaire from '#models/regulation_questionnaire'

type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'
type TabulationScope = 'overall' | 'category' | 'domain'

export default class RiskThreshold extends compose(BaseModel, SoftDeletes) {
  static table = 'risk_thresholds'

  @column({ isPrimary: true })
  declare riskThresholdId: number

  @column()
  declare regulationQuestionnaireId: number

  @column()
  declare riskThresholdScope: TabulationScope

  @column()
  declare riskThresholdTargetCode: string | null

  @column()
  declare riskThresholdLevel: RiskLevel

  @column()
  declare riskThresholdMin: number

  @column()
  declare riskThresholdMax: number

  @column()
  declare riskThresholdOrd: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => RegulationQuestionnaire, {
    foreignKey: 'regulationQuestionnaireId',
  })
  declare questionnaire: BelongsTo<typeof RegulationQuestionnaire>
}

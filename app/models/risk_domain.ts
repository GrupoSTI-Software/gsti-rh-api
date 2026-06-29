import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import RiskDomainQuestion from '#models/risk_domain_question'

export default class RiskDomain extends compose(BaseModel, SoftDeletes) {
  static table = 'risk_domains'

  @column({ isPrimary: true })
  declare riskDomainId: number

  @column()
  declare regulationQuestionnaireId: number

  @column()
  declare riskDomainCode: string

  @column()
  declare riskDomainNameKey: string

  @column()
  declare riskDomainCategorySectionCode: string

  @column()
  declare riskDomainOrd: number

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

  @hasMany(() => RiskDomainQuestion, {
    foreignKey: 'riskDomainId',
  })
  declare questions: HasMany<typeof RiskDomainQuestion>
}

import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import RiskDomain from '#models/risk_domain'
import RegulationQuestionnaireQuestion from '#models/regulation_questionnaire_question'

export default class RiskDomainQuestion extends compose(BaseModel, SoftDeletes) {
  static table = 'risk_domain_questions'

  @column({ isPrimary: true })
  declare riskDomainQuestionId: number

  @column()
  declare riskDomainId: number

  @column()
  declare regulationQuestionnaireQuestionId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => RiskDomain, {
    foreignKey: 'riskDomainId',
  })
  declare riskDomain: BelongsTo<typeof RiskDomain>

  @belongsTo(() => RegulationQuestionnaireQuestion, {
    foreignKey: 'regulationQuestionnaireQuestionId',
  })
  declare question: BelongsTo<typeof RegulationQuestionnaireQuestion>
}

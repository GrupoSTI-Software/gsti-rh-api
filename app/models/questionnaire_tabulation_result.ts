import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import BusinessUnit from '#models/business_unit'

type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'
type TabulationScope = 'overall' | 'category' | 'domain'

export default class QuestionnaireTabulationResult extends BaseModel {
  static table = 'questionnaire_tabulation_results'

  @column({ isPrimary: true })
  declare questionnaireTabulationResultId: number

  @column()
  declare questionnaireApplicationId: number

  @column()
  declare businessUnitId: number

  @column()
  declare questionnaireTabulationResultScope: TabulationScope

  @column()
  declare questionnaireTabulationResultTargetCode: string | null

  @column()
  declare questionnaireTabulationResultScore: number

  @column()
  declare questionnaireTabulationResultRiskLevel: RiskLevel | null

  @column()
  declare questionnaireTabulationResultRespondersCount: number

  @column.dateTime()
  declare questionnaireTabulationResultComputedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare questionnaireTabulationResultCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare questionnaireTabulationResultUpdatedAt: DateTime

  @belongsTo(() => QuestionnaireApplication, {
    foreignKey: 'questionnaireApplicationId',
  })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}

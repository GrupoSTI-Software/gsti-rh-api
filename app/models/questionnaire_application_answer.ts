import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplicationResponse from '#models/questionnaire_application_response'
import RegulationQuestionnaireQuestion from '#models/regulation_questionnaire_question'

export default class QuestionnaireApplicationAnswer extends BaseModel {
  static table = 'questionnaire_application_answers'

  @column({ isPrimary: true })
  declare questionnaireApplicationAnswerId: number

  @column()
  declare questionnaireApplicationResponseId: number

  @column()
  declare regulationQuestionnaireQuestionId: number

  @column()
  declare questionnaireApplicationAnswerOptionKey: string

  @column()
  declare questionnaireApplicationAnswerValue: number

  @column.dateTime({ autoCreate: true, columnName: 'questionnaire_application_answer_created_at' })
  declare questionnaireApplicationAnswerCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'questionnaire_application_answer_updated_at',
  })
  declare questionnaireApplicationAnswerUpdatedAt: DateTime

  @belongsTo(() => QuestionnaireApplicationResponse, {
    foreignKey: 'questionnaireApplicationResponseId',
  })
  declare questionnaireApplicationResponse: BelongsTo<typeof QuestionnaireApplicationResponse>

  @belongsTo(() => RegulationQuestionnaireQuestion, {
    foreignKey: 'regulationQuestionnaireQuestionId',
  })
  declare regulationQuestionnaireQuestion: BelongsTo<typeof RegulationQuestionnaireQuestion>
}

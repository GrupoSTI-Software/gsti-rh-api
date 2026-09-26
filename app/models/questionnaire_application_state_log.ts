import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { QuestionnaireApplicationStatus } from '#models/questionnaire_application'
import QuestionnaireApplication from '#models/questionnaire_application'
import User from '#models/user'

export default class QuestionnaireApplicationStateLog extends BaseModel {
  static table = 'questionnaire_application_state_logs'

  @column({ isPrimary: true })
  declare questionnaireApplicationStateLogId: number

  @column()
  declare questionnaireApplicationId: number

  @column({ columnName: 'actor_user_id' })
  declare actorUserId: number

  @column()
  declare questionnaireApplicationStateLogFromStatus: QuestionnaireApplicationStatus

  @column()
  declare questionnaireApplicationStateLogToStatus: QuestionnaireApplicationStatus

  @column()
  declare questionnaireApplicationStateLogNote: string

  @column.dateTime({
    autoCreate: true,
    columnName: 'questionnaire_application_state_log_created_at',
  })
  declare questionnaireApplicationStateLogCreatedAt: DateTime

  @belongsTo(() => QuestionnaireApplication, { foreignKey: 'questionnaireApplicationId' })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actorUser: BelongsTo<typeof User>
}

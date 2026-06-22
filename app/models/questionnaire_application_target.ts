import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'

export type QuestionnaireApplicationTargetStatus = 'pendiente' | 'respondido'

export default class QuestionnaireApplicationTarget extends BaseModel {
  static table = 'questionnaire_application_targets'

  @column({ isPrimary: true })
  declare questionnaireApplicationTargetId: number

  @column()
  declare questionnaireApplicationId: number

  @column()
  declare employeeId: number

  @column()
  declare questionnaireApplicationTargetStatus: QuestionnaireApplicationTargetStatus

  @column.dateTime()
  declare questionnaireApplicationTargetRespondedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare questionnaireApplicationTargetCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare questionnaireApplicationTargetUpdatedAt: DateTime

  @belongsTo(() => QuestionnaireApplication, { foreignKey: 'questionnaireApplicationId' })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>
}

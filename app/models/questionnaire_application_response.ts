import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'
import QuestionnaireApplicationAnswer from '#models/questionnaire_application_answer'

export type QuestionnaireApplicationResponseStatus = 'borrador' | 'respondido'

export default class QuestionnaireApplicationResponse extends compose(BaseModel, SoftDeletes) {
  static table = 'questionnaire_application_responses'

  @column({ isPrimary: true })
  declare questionnaireApplicationResponseId: number

  @column()
  declare questionnaireApplicationId: number

  @column()
  declare employeeId: number

  @column()
  declare questionnaireApplicationResponseAnsweredCount: number

  @column()
  declare questionnaireApplicationResponseStatus: QuestionnaireApplicationResponseStatus

  @column.dateTime()
  declare questionnaireApplicationResponseSubmittedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare questionnaireApplicationResponseCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare questionnaireApplicationResponseUpdatedAt: DateTime

  @column.dateTime({ columnName: 'questionnaire_application_response_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => QuestionnaireApplication, { foreignKey: 'questionnaireApplicationId' })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @hasMany(() => QuestionnaireApplicationAnswer, {
    foreignKey: 'questionnaireApplicationResponseId',
  })
  declare answers: HasMany<typeof QuestionnaireApplicationAnswer>
}

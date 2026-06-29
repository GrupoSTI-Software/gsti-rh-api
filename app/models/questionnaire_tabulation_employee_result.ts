import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'

type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'

export default class QuestionnaireTabulationEmployeeResult extends BaseModel {
  static table = 'questionnaire_tabulation_employee_results'

  @column({ isPrimary: true })
  declare questionnaireTabulationEmployeeResultId: number

  @column()
  declare questionnaireApplicationId: number

  @column()
  declare employeeId: number

  @column()
  declare questionnaireTabulationEmployeeResultScore: number

  @column()
  declare questionnaireTabulationEmployeeResultRiskLevel: RiskLevel | null

  @column.dateTime({ autoCreate: true })
  declare questionnaireTabulationEmployeeResultCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare questionnaireTabulationEmployeeResultUpdatedAt: DateTime

  @belongsTo(() => QuestionnaireApplication, {
    foreignKey: 'questionnaireApplicationId',
  })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}

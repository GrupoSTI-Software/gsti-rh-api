import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'

export default class QuestionnaireTabulationEmployeeResult extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'questionnaire_tabulation_employee_results'

  @column({ isPrimary: true })
  declare questionnaireTabulationEmployeeResultId: number

  @column()
  declare questionnaireApplicationId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058521).
   * Se llavea a la APLICACIÓN, coherente con cómo el motor de tabulación
   * ya llavea el resultado agregado (no al empleado).
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la aplicación padre (nunca del payload ni del empleado). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: QuestionnaireTabulationEmployeeResult) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        QuestionnaireApplication.query()
          .where('questionnaireApplicationId', instance.questionnaireApplicationId)
          .first(),
      'la aplicación de cuestionario'
    )
  }

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

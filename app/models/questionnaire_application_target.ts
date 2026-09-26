import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

export type QuestionnaireApplicationTargetStatus = 'pendiente' | 'respondido'

export default class QuestionnaireApplicationTarget extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'questionnaire_application_targets'

  @column({ isPrimary: true })
  declare questionnaireApplicationTargetId: number

  @column()
  declare questionnaireApplicationId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058521).
   * Se llavea a la APLICACIÓN, no al empleado.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la aplicación padre (nunca del payload ni del empleado). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: QuestionnaireApplicationTarget) {
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

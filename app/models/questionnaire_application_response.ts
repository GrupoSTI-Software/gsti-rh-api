import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import QuestionnaireApplication from '#models/questionnaire_application'
import Employee from '#models/employee'
import QuestionnaireApplicationAnswer from '#models/questionnaire_application_answer'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

export type QuestionnaireApplicationResponseStatus = 'borrador' | 'respondido'

export default class QuestionnaireApplicationResponse extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'questionnaire_application_responses'

  @column({ isPrimary: true })
  declare questionnaireApplicationResponseId: number

  @column()
  declare questionnaireApplicationId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058521).
   * Se llavea a la APLICACIÓN, no al empleado: un empleado prestado puede
   * pertenecer a otra unidad que la aplicación que contestó.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la aplicación padre (nunca del payload ni del empleado). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: QuestionnaireApplicationResponse) {
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

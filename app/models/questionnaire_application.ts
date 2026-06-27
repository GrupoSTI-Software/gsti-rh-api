import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import BranchOffice from '#models/branch_office'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import QuestionnaireApplicationTarget from '#models/questionnaire_application_target'

export type QuestionnaireApplicationInstrument = 'guide_ii' | 'guide_iii'
export type QuestionnaireApplicationStatus = 'borrador' | 'en-curso' | 'cerrada'

export default class QuestionnaireApplication extends compose(BaseModel, SoftDeletes) {
  static table = 'questionnaire_applications'

  @column({ isPrimary: true })
  declare questionnaireApplicationId: number

  @column()
  declare businessUnitId: number

  @column()
  declare branchOfficeId: number

  @column()
  declare regulationQuestionnaireId: number

  @column()
  declare questionnaireApplicationFolio: string

  @column()
  declare questionnaireApplicationInstrument: QuestionnaireApplicationInstrument

  @column()
  declare questionnaireApplicationStatus: QuestionnaireApplicationStatus

  @column.dateTime()
  declare questionnaireApplicationLaunchedAt: DateTime

  @column.dateTime()
  declare questionnaireApplicationClosedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare questionnaireApplicationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare questionnaireApplicationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'questionnaire_application_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => BranchOffice, { foreignKey: 'branchOfficeId' })
  declare branchOffice: BelongsTo<typeof BranchOffice>

  @belongsTo(() => RegulationQuestionnaire, { foreignKey: 'regulationQuestionnaireId' })
  declare regulationQuestionnaire: BelongsTo<typeof RegulationQuestionnaire>

  @hasMany(() => QuestionnaireApplicationTarget, { foreignKey: 'questionnaireApplicationId' })
  declare targets: HasMany<typeof QuestionnaireApplicationTarget>
}

import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import TeleworkChecklistApplication from '#models/telework_checklist_application'
import TeleworkChecklistItem from '#models/telework_checklist_item'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { TeleworkChecklistAnswerResult } from '#constants/telework_checklist'

/**
 * Respuesta de un punto en una aplicación de la lista de verificación de
 * teletrabajo (VLRH-H1790812613870).
 *
 * Sin soft delete y sin `updatedAt`: la respuesta nace con la aplicación y no
 * se edita. `businessUnitId` replica el de la aplicación padre para el
 * aislamiento por empresa.
 */
export default class TeleworkChecklistAnswer extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_checklist_answers'

  @column({ isPrimary: true })
  declare teleworkChecklistAnswerId: number

  @column()
  declare teleworkChecklistApplicationId: number

  @column()
  declare teleworkChecklistItemId: number

  @column()
  declare businessUnitId: number

  /** Resultado del punto: `cumple`, `no_cumple` o `no_aplica`. */
  @column()
  declare teleworkChecklistAnswerResult: TeleworkChecklistAnswerResult

  @column()
  declare teleworkChecklistAnswerObservation: string | null

  @column.dateTime({ autoCreate: true })
  declare teleworkChecklistAnswerCreatedAt: DateTime

  @belongsTo(() => TeleworkChecklistApplication, { foreignKey: 'teleworkChecklistApplicationId' })
  declare teleworkChecklistApplication: BelongsTo<typeof TeleworkChecklistApplication>

  @belongsTo(() => TeleworkChecklistItem, { foreignKey: 'teleworkChecklistItemId' })
  declare teleworkChecklistItem: BelongsTo<typeof TeleworkChecklistItem>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}

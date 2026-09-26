import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import Regulation from '#models/regulation'
import QuestionnaireApplication from '#models/questionnaire_application'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

export type AttentionProgramStatus = 'borrador' | 'vigente' | 'cerrado'

/**
 * Compone `withBusinessUnitScope()` (USRH1784259058567, defensa en
 * profundidad): la columna `businessUnitId` ya existía NOT NULL con FK
 * RESTRICT. CAVEAT: las lecturas de `attention_program_service.ts` usan
 * `db.from` crudo con `whereIn` manual (load-bearing, el mixin NO cubre
 * queries crudas) — esos filtros NO se retiran; el compose solo cubre
 * queries de modelo (`AttentionProgram.query()`) futuras.
 */
export default class AttentionProgram extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'attention_programs'

  @column({ isPrimary: true })
  declare attentionProgramId: number

  @column()
  declare businessUnitId: number

  @column()
  declare regulationId: number

  @column()
  declare questionnaireApplicationId: number | null

  @column()
  declare attentionProgramYear: number

  @column()
  declare attentionProgramPeriod: string | null

  @column()
  declare attentionProgramStatus: AttentionProgramStatus

  @column.dateTime({ autoCreate: true })
  declare attentionProgramCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare attentionProgramUpdatedAt: DateTime

  @column.dateTime({ columnName: 'attention_program_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => Regulation, { foreignKey: 'regulationId' })
  declare regulation: BelongsTo<typeof Regulation>

  @belongsTo(() => QuestionnaireApplication, { foreignKey: 'questionnaireApplicationId' })
  declare questionnaireApplication: BelongsTo<typeof QuestionnaireApplication>
}

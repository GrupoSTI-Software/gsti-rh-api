import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationClauseFeature from '#models/regulation_clause_feature'

/**
 * Numeral jerárquico de una regulación (cláusula, fracción, inciso, etc.).
 * Modelo parcial en esta rama: las relaciones con Regulation y RegulationEvidenceRequirement
 * se completan al integrar la rama base del marco regulatorio (USRH1779073193537).
 */
export default class RegulationClause extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_clauses'

  @column({ isPrimary: true })
  declare regulationClauseId: number

  @column()
  declare regulationId: number

  @column()
  declare parentRegulationClauseId: number | null

  @column()
  declare regulationClauseCode: string

  @column()
  declare regulationClauseOrd: number

  @column()
  declare regulationClauseTitleKey: string | null

  @column()
  declare regulationClauseObligationKey: string

  @column()
  declare regulationClauseExplanationKey: string

  @column()
  declare regulationClauseRationaleKey: string

  @column()
  declare regulationClauseAuditCriteriaKey: string

  @column()
  declare regulationClauseApplicabilityKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Funcionalidades del producto que dan cobertura a este numeral. */
  @hasMany(() => RegulationClauseFeature, {
    foreignKey: 'regulationClauseId',
  })
  declare features: HasMany<typeof RegulationClauseFeature>
}

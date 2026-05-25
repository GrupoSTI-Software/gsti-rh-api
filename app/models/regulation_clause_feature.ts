import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationClause from './regulation_clause.js'
import SystemFeature from './system_feature.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationClauseFeature:
 *       type: object
 *       description: >
 *         Vínculo entre un numeral regulatorio y una funcionalidad del producto (system_feature).
 *         Permite derivar automáticamente la cobertura normativa de cada numeral sin
 *         mantenimiento manual de porcentajes. El campo coverage indica si la funcionalidad
 *         cubre el numeral de forma total o parcial; note_key apunta a un texto i18n
 *         opcional con aclaraciones sobre la cobertura.
 *       properties:
 *         regulationClauseFeatureId:
 *           type: integer
 *           description: Identificador único del registro de cobertura
 *         regulationClauseId:
 *           type: integer
 *           description: FK hacia el numeral regulatorio cubierto
 *         systemFeatureId:
 *           type: integer
 *           description: FK hacia la funcionalidad del producto que da cobertura
 *         regulationClauseFeatureCoverage:
 *           type: string
 *           enum: [total, parcial]
 *           nullable: true
 *           description: Grado de cobertura que la funcionalidad otorga al numeral
 *         regulationClauseFeatureNoteKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para notas aclaratorias sobre la cobertura (máx 150 chars)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class RegulationClauseFeature extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_clause_features'

  /** Identificador único del registro de cobertura. */
  @column({ isPrimary: true })
  declare regulationClauseFeatureId: number

  /** FK hacia el numeral regulatorio que esta funcionalidad cubre. */
  @column()
  declare regulationClauseId: number

  /** FK hacia la funcionalidad del producto que otorga cobertura al numeral. */
  @column()
  declare systemFeatureId: number

  /**
   * Grado de cobertura que la funcionalidad otorga al numeral.
   * - total: la funcionalidad cubre íntegramente la obligación del numeral.
   * - parcial: la funcionalidad cubre solo parte de la obligación.
   * - null: aún no evaluado o no aplica una distinción de grado.
   */
  @column()
  declare regulationClauseFeatureCoverage: 'total' | 'parcial' | null

  /**
   * Clave i18n para notas aclaratorias sobre la cobertura o sus limitaciones.
   * Apunta a resources/lang/{es,en}.json. Máximo 150 caracteres.
   */
  @column()
  declare regulationClauseFeatureNoteKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Numeral regulatorio al que pertenece este vínculo de cobertura. */
  @belongsTo(() => RegulationClause, {
    foreignKey: 'regulationClauseId',
  })
  declare regulationClause: BelongsTo<typeof RegulationClause>

  /** Funcionalidad del producto que otorga cobertura a este numeral. */
  @belongsTo(() => SystemFeature, {
    foreignKey: 'systemFeatureId',
  })
  declare systemFeature: BelongsTo<typeof SystemFeature>
}

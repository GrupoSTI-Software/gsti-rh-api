import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationClause from './regulation_clause.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationClauseFeature:
 *       type: object
 *       description: >
 *         Relación entre un numeral regulatorio y una feature del producto Valanserh.
 *         Permite trazar qué funcionalidades cubren cada obligación normativa
 *         y en qué estado de desarrollo se encuentran.
 *       properties:
 *         regulationClauseFeatureId:
 *           type: integer
 *           description: Identificador único del registro de cobertura
 *         regulationClauseId:
 *           type: integer
 *           description: FK hacia el numeral regulatorio cubierto
 *         regulationClauseFeatureSlug:
 *           type: string
 *           description: Identificador textual de la feature (p. ej. "encuesta-factores-riesgo")
 *         regulationClauseFeatureModule:
 *           type: string
 *           description: Módulo del producto al que pertenece la feature (p. ej. "nom035")
 *         regulationClauseFeatureStatus:
 *           type: string
 *           enum: [planeado, en_desarrollo, disponible, no_aplica]
 *           description: Estado de disponibilidad de la feature en el producto
 *         regulationClauseFeatureNotes:
 *           type: string
 *           nullable: true
 *           description: Notas adicionales sobre la cobertura o limitaciones
 *         regulationClauseFeatureAvailableSince:
 *           type: string
 *           nullable: true
 *           description: Versión del producto desde la que está disponible (p. ej. "2.4.0")
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

  /** Identificador único del registro de cobertura de feature. */
  @column({ isPrimary: true })
  declare regulationClauseFeatureId: number

  /** FK hacia el numeral regulatorio que esta feature cubre. */
  @column()
  declare regulationClauseId: number

  /** Identificador textual de la feature en el producto (p. ej. "encuesta-factores-riesgo"). */
  @column()
  declare regulationClauseFeatureSlug: string

  /** Módulo del producto al que pertenece la feature (p. ej. "nom035"). */
  @column()
  declare regulationClauseFeatureModule: string

  /** Estado de disponibilidad de la feature: planeado, en_desarrollo, disponible o no_aplica. */
  @column()
  declare regulationClauseFeatureStatus: 'planeado' | 'en_desarrollo' | 'disponible' | 'no_aplica'

  /** Notas adicionales sobre la cobertura, limitaciones o pendientes. */
  @column()
  declare regulationClauseFeatureNotes: string | null

  /** Versión del producto desde la que la feature está disponible (p. ej. "2.4.0"). */
  @column()
  declare regulationClauseFeatureAvailableSince: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Numeral regulatorio al que pertenece esta cobertura de feature. */
  @belongsTo(() => RegulationClause, {
    foreignKey: 'regulationClauseId',
  })
  declare regulationClause: BelongsTo<typeof RegulationClause>
}

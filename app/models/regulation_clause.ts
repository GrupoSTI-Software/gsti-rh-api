import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Regulation from './regulation.js'
import RegulationClauseFeature from './regulation_clause_feature.js'
import RegulationEvidenceRequirement from './regulation_evidence_requirement.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationClause:
 *       type: object
 *       description: >
 *         Numeral jerárquico de una regulación (cláusula, fracción, inciso, etc.).
 *         Soporta auto-referencia para modelar la jerarquía completa de la norma.
 *         Los campos _key apuntan a entradas en resources/lang/{es,en}/regulatory.json.
 *       properties:
 *         regulationClauseId:
 *           type: integer
 *           description: Identificador único del numeral
 *         regulationId:
 *           type: integer
 *           description: FK hacia la regulación padre
 *         parentRegulationClauseId:
 *           type: integer
 *           nullable: true
 *           description: FK hacia el numeral padre (self-reference para jerarquía)
 *         regulationClauseCode:
 *           type: string
 *           description: Código corto del numeral (p. ej. "4.1", "Fracción III")
 *         regulationClauseOrd:
 *           type: integer
 *           description: Orden de presentación dentro del mismo nivel jerárquico
 *         regulationClauseTitleKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para el título del numeral
 *         regulationClauseObligationKey:
 *           type: string
 *           description: Clave i18n para el texto de la obligación
 *         regulationClauseExplanationKey:
 *           type: string
 *           description: Clave i18n para la explicación en lenguaje claro
 *         regulationClauseRationaleKey:
 *           type: string
 *           description: Clave i18n para la justificación del por qué de la obligación
 *         regulationClauseAuditCriteriaKey:
 *           type: string
 *           description: Clave i18n para los criterios de auditoría aplicables
 *         regulationClauseApplicabilityKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para las condiciones de aplicabilidad del numeral
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
export default class RegulationClause extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_clauses'

  /** Identificador único del numeral. */
  @column({ isPrimary: true })
  declare regulationClauseId: number

  /** FK hacia la regulación a la que pertenece este numeral. */
  @column()
  declare regulationId: number

  /** FK hacia el numeral padre; null si es de primer nivel. */
  @column()
  declare parentRegulationClauseId: number | null

  /** Código corto del numeral (p. ej. "4.1", "5.2.1"). */
  @column()
  declare regulationClauseCode: string

  /** Orden de presentación dentro del mismo nivel jerárquico. */
  @column()
  declare regulationClauseOrd: number

  /** Clave i18n para el título del numeral (puede ser nulo para numerales sin título propio). */
  @column()
  declare regulationClauseTitleKey: string | null

  /** Clave i18n para el texto literal de la obligación normativa. */
  @column()
  declare regulationClauseObligationKey: string

  /** Clave i18n para la explicación en lenguaje simple del requisito. */
  @column()
  declare regulationClauseExplanationKey: string

  /** Clave i18n para la justificación del propósito de la obligación. */
  @column()
  declare regulationClauseRationaleKey: string

  /** Clave i18n para los criterios usados al auditar el cumplimiento. */
  @column()
  declare regulationClauseAuditCriteriaKey: string

  /** Clave i18n para las condiciones que determinan si el numeral aplica. */
  @column()
  declare regulationClauseApplicabilityKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Regulación a la que pertenece este numeral. */
  @belongsTo(() => Regulation, {
    foreignKey: 'regulationId',
  })
  declare regulation: BelongsTo<typeof Regulation>

  /** Numeral padre en la jerarquía (null si es de primer nivel). */
  @belongsTo(() => RegulationClause, {
    foreignKey: 'parentRegulationClauseId',
  })
  declare parent: BelongsTo<typeof RegulationClause>

  /** Numerales hijos directos en la jerarquía. */
  @hasMany(() => RegulationClause, {
    foreignKey: 'parentRegulationClauseId',
  })
  declare children: HasMany<typeof RegulationClause>

  /** Features de Valanserh que dan cobertura a este numeral. */
  @hasMany(() => RegulationClauseFeature, {
    foreignKey: 'regulationClauseId',
  })
  declare features: HasMany<typeof RegulationClauseFeature>

  /** Evidencias documentales requeridas para acreditar el cumplimiento. */
  @hasMany(() => RegulationEvidenceRequirement, {
    foreignKey: 'regulationClauseId',
  })
  declare evidenceRequirements: HasMany<typeof RegulationEvidenceRequirement>
}

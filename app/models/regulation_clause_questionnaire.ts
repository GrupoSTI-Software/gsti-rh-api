import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationClause from './regulation_clause.js'
import RegulationQuestionnaire from './regulation_questionnaire.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationClauseQuestionnaire:
 *       type: object
 *       description: >
 *         Tabla pivote que establece la relación N:N entre numerales regulatorios
 *         (regulation_clauses) e instrumentos de evaluación (regulation_questionnaires).
 *         Permite rastrear qué cuestionarios o guías de referencia son aplicables
 *         para acreditar el cumplimiento de cada numeral. El campo notes admite
 *         anotaciones contextuales sobre la relación (p. ej. "Aplica solo a centros
 *         con más de 50 trabajadores").
 *       properties:
 *         regulationClauseQuestionnaireId:
 *           type: integer
 *           description: Identificador único del registro pivote
 *         regulationClauseId:
 *           type: integer
 *           description: FK hacia el numeral regulatorio
 *         regulationQuestionnaireId:
 *           type: integer
 *           description: FK hacia el cuestionario o instrumento de evaluación
 *         regulationClauseQuestionnaireNotes:
 *           type: string
 *           nullable: true
 *           description: Notas contextuales sobre la relación entre el numeral y el instrumento
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
export default class RegulationClauseQuestionnaire extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_clause_questionnaires'

  /** Identificador único del registro pivote. */
  @column({ isPrimary: true })
  declare regulationClauseQuestionnaireId: number

  /** FK hacia el numeral regulatorio. */
  @column()
  declare regulationClauseId: number

  /** FK hacia el cuestionario o instrumento de evaluación. */
  @column()
  declare regulationQuestionnaireId: number

  /** Notas contextuales sobre la relación entre el numeral y el instrumento. */
  @column()
  declare regulationClauseQuestionnaireNotes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Numeral regulatorio vinculado. */
  @belongsTo(() => RegulationClause, {
    foreignKey: 'regulationClauseId',
  })
  declare regulationClause: BelongsTo<typeof RegulationClause>

  /** Cuestionario o instrumento vinculado. */
  @belongsTo(() => RegulationQuestionnaire, {
    foreignKey: 'regulationQuestionnaireId',
  })
  declare questionnaire: BelongsTo<typeof RegulationQuestionnaire>
}

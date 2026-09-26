import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulatoryAuthority from './regulatory_authority.js'
import RegulationQuestionnaireSection from './regulation_questionnaire_section.js'
import RegulationClause from './regulation_clause.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationQuestionnaire:
 *       type: object
 *       description: >
 *         Instrumento de evaluación (cuestionario o lista de verificación) asociado
 *         a una autoridad regulatoria. Modela las Guías de Referencia I, II y III de
 *         NOM-035-STPS-2018 y las Listas de Verificación de NOM-037-STPS-2023, entre otros.
 *         Las preguntas se organizan en secciones y se vinculan a numerales
 *         regulatorios mediante la tabla pivote regulation_clause_questionnaires.
 *       properties:
 *         regulationQuestionnaireId:
 *           type: integer
 *           description: Identificador único del cuestionario
 *         regulatoryAuthorityId:
 *           type: integer
 *           description: FK hacia la autoridad que emite el instrumento
 *         regulationQuestionnaireCode:
 *           type: string
 *           description: Código único del instrumento (p. ej. "GUIA-II-NOM035")
 *         regulationQuestionnaireTitleKey:
 *           type: string
 *           description: Clave i18n para el título del cuestionario
 *         regulationQuestionnaireDescriptionKey:
 *           type: string
 *           description: Clave i18n para la descripción del cuestionario
 *         regulationQuestionnaireVersion:
 *           type: string
 *           description: Versión del instrumento (p. ej. "2018")
 *         regulationQuestionnaireStatus:
 *           type: string
 *           enum: [vigente, modificada, derogada]
 *         regulationQuestionnaireAppliesToDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n que describe a qué centros de trabajo aplica el instrumento
 *         regulationQuestionnaireMinResponders:
 *           type: integer
 *           nullable: true
 *           description: Número mínimo de respondentes para que los resultados sean válidos
 *         regulationQuestionnaireCompletionTimeMinutes:
 *           type: integer
 *           nullable: true
 *           description: Tiempo estimado de aplicación en minutos
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
export default class RegulationQuestionnaire extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_questionnaires'

  /** Identificador único del cuestionario. */
  @column({ isPrimary: true })
  declare regulationQuestionnaireId: number

  /** FK hacia la autoridad regulatoria que emite el instrumento. */
  @column()
  declare regulatoryAuthorityId: number

  /** Código único del instrumento (p. ej. "GUIA-II-NOM035"). */
  @column()
  declare regulationQuestionnaireCode: string

  /** Clave i18n para el título del cuestionario. */
  @column()
  declare regulationQuestionnaireTitleKey: string

  /** Clave i18n para la descripción del cuestionario. */
  @column()
  declare regulationQuestionnaireDescriptionKey: string

  /** Versión del instrumento (p. ej. "2018"). */
  @column()
  declare regulationQuestionnaireVersion: string

  /** Estado vigente del instrumento. */
  @column()
  declare regulationQuestionnaireStatus: 'vigente' | 'modificada' | 'derogada'

  /** Clave i18n que describe a qué centros de trabajo aplica el instrumento. */
  @column()
  declare regulationQuestionnaireAppliesToDescriptionKey: string | null

  /** Número mínimo de respondentes para que los resultados sean estadísticamente válidos. */
  @column()
  declare regulationQuestionnaireMinResponders: number | null

  /** Tiempo estimado de aplicación del instrumento en minutos. */
  @column()
  declare regulationQuestionnaireCompletionTimeMinutes: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Autoridad regulatoria que emite este instrumento. */
  @belongsTo(() => RegulatoryAuthority, {
    foreignKey: 'regulatoryAuthorityId',
  })
  declare regulatoryAuthority: BelongsTo<typeof RegulatoryAuthority>

  /** Secciones que componen este cuestionario. */
  @hasMany(() => RegulationQuestionnaireSection, {
    foreignKey: 'regulationQuestionnaireId',
  })
  declare sections: HasMany<typeof RegulationQuestionnaireSection>

  /** Numerales regulatorios que este instrumento permite evaluar (N:N). */
  @manyToMany(() => RegulationClause, {
    pivotTable: 'regulation_clause_questionnaires',
    localKey: 'regulationQuestionnaireId',
    pivotForeignKey: 'regulation_questionnaire_id',
    relatedKey: 'regulationClauseId',
    pivotRelatedForeignKey: 'regulation_clause_id',
    pivotColumns: ['regulation_clause_questionnaire_notes'],
  })
  declare clauses: ManyToMany<typeof RegulationClause>
}

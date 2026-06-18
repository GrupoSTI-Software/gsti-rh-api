import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationQuestionnaireSection from './regulation_questionnaire_section.js'
import RegulationQuestionnaireAnswerScale from './regulation_questionnaire_answer_scale.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationQuestionnaireQuestion:
 *       type: object
 *       description: >
 *         Pregunta individual dentro de una sección de cuestionario regulatorio.
 *         Referencia una escala de respuesta reutilizable y puede estar marcada
 *         como reverse-scored (ítem redactado en sentido positivo cuyo puntaje
 *         debe invertirse para el cálculo de riesgo). El campo weight permite
 *         ponderar ítems en el cálculo de puntaje de la sección.
 *       properties:
 *         regulationQuestionnaireQuestionId:
 *           type: integer
 *           description: Identificador único de la pregunta
 *         regulationQuestionnaireSectionId:
 *           type: integer
 *           description: FK hacia la sección a la que pertenece esta pregunta
 *         regulationQuestionnaireQuestionCode:
 *           type: string
 *           description: Código corto de la pregunta dentro de la sección (p. ej. "P1", "P2")
 *         regulationQuestionnaireQuestionTextKey:
 *           type: string
 *           description: Clave i18n para el texto de la pregunta
 *         regulationQuestionnaireQuestionHelpKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para el texto de ayuda o aclaración de la pregunta
 *         regulationQuestionnaireQuestionAnswerScaleId:
 *           type: integer
 *           description: FK hacia la escala de respuesta aplicable a esta pregunta
 *         regulationQuestionnaireQuestionIsReverseScored:
 *           type: integer
 *           description: 1 si el puntaje debe invertirse en el cálculo, 0 si es directo
 *         regulationQuestionnaireQuestionWeight:
 *           type: number
 *           description: Factor de ponderación del ítem en el puntaje de la sección (default 1.00)
 *         regulationQuestionnaireQuestionOrd:
 *           type: integer
 *           description: Orden de presentación dentro de la sección
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
export default class RegulationQuestionnaireQuestion extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_questionnaire_questions'

  /** Identificador único de la pregunta. */
  @column({ isPrimary: true })
  declare regulationQuestionnaireQuestionId: number

  /** FK hacia la sección a la que pertenece esta pregunta. */
  @column()
  declare regulationQuestionnaireSectionId: number

  /** Código corto de la pregunta dentro de la sección (p. ej. "P1", "P01"). */
  @column()
  declare regulationQuestionnaireQuestionCode: string

  /** Clave i18n para el texto de la pregunta. */
  @column()
  declare regulationQuestionnaireQuestionTextKey: string

  /** Clave i18n para el texto de ayuda o aclaración. Puede ser nula. */
  @column()
  declare regulationQuestionnaireQuestionHelpKey: string | null

  /** FK hacia la escala de respuesta aplicable a esta pregunta. */
  @column()
  declare regulationQuestionnaireQuestionAnswerScaleId: number

  /**
   * Indica si el puntaje del ítem debe invertirse antes de sumarse al total de la sección.
   * 1 = reverse-scored, 0 = puntaje directo.
   */
  @column()
  declare regulationQuestionnaireQuestionIsReverseScored: number

  /**
   * Factor de ponderación del ítem en el cálculo del puntaje de la sección.
   * Default 1.00; valores distintos permiten dar mayor peso a preguntas críticas.
   */
  @column()
  declare regulationQuestionnaireQuestionWeight: number

  /** Orden de presentación dentro de la sección. */
  @column()
  declare regulationQuestionnaireQuestionOrd: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Sección a la que pertenece esta pregunta. */
  @belongsTo(() => RegulationQuestionnaireSection, {
    foreignKey: 'regulationQuestionnaireSectionId',
  })
  declare section: BelongsTo<typeof RegulationQuestionnaireSection>

  /** Escala de respuesta aplicable a esta pregunta. */
  @belongsTo(() => RegulationQuestionnaireAnswerScale, {
    foreignKey: 'regulationQuestionnaireQuestionAnswerScaleId',
  })
  declare answerScale: BelongsTo<typeof RegulationQuestionnaireAnswerScale>
}

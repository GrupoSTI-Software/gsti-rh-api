import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationQuestionnaire from './regulation_questionnaire.js'
import RegulationQuestionnaireQuestion from './regulation_questionnaire_question.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationQuestionnaireSection:
 *       type: object
 *       description: >
 *         Sección o dominio dentro de un cuestionario regulatorio. Agrupa preguntas
 *         temáticamente (p. ej. "Ambiente de Trabajo", "Cargas de Trabajo",
 *         "Liderazgo y Relaciones en el Trabajo"). El orden de presentación
 *         se controla con el campo ord.
 *       properties:
 *         regulationQuestionnaireSectionId:
 *           type: integer
 *           description: Identificador único de la sección
 *         regulationQuestionnaireId:
 *           type: integer
 *           description: FK hacia el cuestionario al que pertenece esta sección
 *         regulationQuestionnaireSectionCode:
 *           type: string
 *           description: Código corto de la sección (p. ej. "AT", "CT", "LIDER")
 *         regulationQuestionnaireSectionTitleKey:
 *           type: string
 *           description: Clave i18n para el título de la sección
 *         regulationQuestionnaireSectionDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para la descripción o instrucciones de la sección
 *         regulationQuestionnaireSectionOrd:
 *           type: integer
 *           description: Orden de presentación dentro del cuestionario
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
export default class RegulationQuestionnaireSection extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_questionnaire_sections'

  /** Identificador único de la sección. */
  @column({ isPrimary: true })
  declare regulationQuestionnaireSectionId: number

  /** FK hacia el cuestionario al que pertenece esta sección. */
  @column()
  declare regulationQuestionnaireId: number

  /** Código corto de la sección (p. ej. "AT", "CT", "LIDER"). */
  @column()
  declare regulationQuestionnaireSectionCode: string

  /** Clave i18n para el título de la sección. */
  @column()
  declare regulationQuestionnaireSectionTitleKey: string

  /** Clave i18n para la descripción o instrucciones de la sección. Puede ser nula. */
  @column()
  declare regulationQuestionnaireSectionDescriptionKey: string | null

  /** Orden de presentación dentro del cuestionario. */
  @column()
  declare regulationQuestionnaireSectionOrd: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Cuestionario al que pertenece esta sección. */
  @belongsTo(() => RegulationQuestionnaire, {
    foreignKey: 'regulationQuestionnaireId',
  })
  declare questionnaire: BelongsTo<typeof RegulationQuestionnaire>

  /** Preguntas que componen esta sección, ordenadas por ord. */
  @hasMany(() => RegulationQuestionnaireQuestion, {
    foreignKey: 'regulationQuestionnaireSectionId',
  })
  declare questions: HasMany<typeof RegulationQuestionnaireQuestion>
}

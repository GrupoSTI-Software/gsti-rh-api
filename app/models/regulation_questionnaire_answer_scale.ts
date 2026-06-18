import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulationQuestionnaireQuestion from './regulation_questionnaire_question.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulationQuestionnaireAnswerScale:
 *       type: object
 *       description: >
 *         Escala de respuesta reutilizable para preguntas de cuestionarios regulatorios.
 *         Cada escala define un conjunto de opciones de respuesta (p. ej. "Siempre /
 *         Casi siempre / Algunas veces / Casi nunca / Nunca") almacenadas como JSON,
 *         donde cada opción expone su clave i18n, valor numérico y, opcionalmente,
 *         su valor invertido para ítems reverse-scored.
 *       properties:
 *         regulationQuestionnaireAnswerScaleId:
 *           type: integer
 *           description: Identificador único de la escala
 *         regulationQuestionnaireAnswerScaleCode:
 *           type: string
 *           description: Código único de la escala (p. ej. "likert_5_frecuencia")
 *         regulationQuestionnaireAnswerScaleTitleKey:
 *           type: string
 *           description: Clave i18n para el nombre legible de la escala
 *         regulationQuestionnaireAnswerScaleDefinition:
 *           type: object
 *           description: >
 *             JSON con la definición de las opciones de respuesta. Estructura:
 *             { options: [{ key: string, value: number, reverseValue?: number }] }
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
export default class RegulationQuestionnaireAnswerScale extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_questionnaire_answer_scales'

  /** Identificador único de la escala de respuesta. */
  @column({ isPrimary: true })
  declare regulationQuestionnaireAnswerScaleId: number

  /** Código único de la escala (p. ej. "likert_5_frecuencia", "si_no"). */
  @column()
  declare regulationQuestionnaireAnswerScaleCode: string

  /** Clave i18n para el nombre legible de la escala. */
  @column()
  declare regulationQuestionnaireAnswerScaleTitleKey: string

  /**
   * Definición JSON de las opciones de respuesta.
   * Estructura esperada: `{ options: [{ key: string, value: number, reverseValue?: number }] }`
   */
  @column()
  declare regulationQuestionnaireAnswerScaleDefinition: {
    options: Array<{ key: string; value: number; reverseValue?: number }>
  }

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Preguntas que usan esta escala de respuesta. */
  @hasMany(() => RegulationQuestionnaireQuestion, {
    foreignKey: 'regulationQuestionnaireQuestionAnswerScaleId',
  })
  declare questions: HasMany<typeof RegulationQuestionnaireQuestion>
}

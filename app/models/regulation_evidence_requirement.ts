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
 *     RegulationEvidenceRequirement:
 *       type: object
 *       description: >
 *         Evidencia documental requerida para acreditar el cumplimiento de un numeral
 *         regulatorio. Define el tipo de evidencia, su descripción (vía clave i18n)
 *         y los años mínimos de retención que exige la norma.
 *       properties:
 *         regulationEvidenceRequirementId:
 *           type: integer
 *           description: Identificador único del requerimiento de evidencia
 *         regulationClauseId:
 *           type: integer
 *           description: FK hacia el numeral regulatorio que exige esta evidencia
 *         regulationEvidenceRequirementType:
 *           type: string
 *           enum: [documento, registro, bitacora, reporte, formulario]
 *           description: Categoría del tipo de evidencia requerida
 *         regulationEvidenceRequirementDescriptionKey:
 *           type: string
 *           description: Clave i18n para la descripción de la evidencia requerida
 *         regulationEvidenceRequirementRetentionYears:
 *           type: integer
 *           description: Años mínimos que el empleador debe conservar la evidencia
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
export default class RegulationEvidenceRequirement extends compose(BaseModel, SoftDeletes) {
  static table = 'regulation_evidence_requirements'

  /** Identificador único del requerimiento de evidencia. */
  @column({ isPrimary: true })
  declare regulationEvidenceRequirementId: number

  /** FK hacia el numeral regulatorio que exige esta evidencia. */
  @column()
  declare regulationClauseId: number

  /** Categoría de la evidencia: documento, registro, bitacora, reporte o formulario. */
  @column()
  declare regulationEvidenceRequirementType:
    | 'documento'
    | 'registro'
    | 'bitacora'
    | 'reporte'
    | 'formulario'

  /** Clave i18n para la descripción de la evidencia requerida (resources/lang/{es,en}/regulatory.json). */
  @column()
  declare regulationEvidenceRequirementDescriptionKey: string

  /** Años mínimos que el empleador debe conservar este tipo de evidencia. */
  @column()
  declare regulationEvidenceRequirementRetentionYears: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Numeral regulatorio al que pertenece este requerimiento de evidencia. */
  @belongsTo(() => RegulationClause, {
    foreignKey: 'regulationClauseId',
  })
  declare regulationClause: BelongsTo<typeof RegulationClause>
}

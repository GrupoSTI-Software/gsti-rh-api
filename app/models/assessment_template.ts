import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import AssessmentTemplateDimension from './assessment_template_dimension.js'
import EmployeeAssessment from './employee_assessment.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     AssessmentTemplate:
 *       type: object
 *       properties:
 *         assessmentTemplateId:
 *           type: number
 *           description: Identificador único de la plantilla de evaluación
 *         assessmentTemplateName:
 *           type: string
 *           description: Nombre de la plantilla de evaluación
 *         assessmentTemplateDescription:
 *           type: string
 *           description: Descripción de la plantilla de evaluación
 *         assessmentTemplateIsActive:
 *           type: boolean
 *           description: |
 *             Estado activo/inactivo. Si es false, la plantilla aparece como
 *             "Inactiva" y queda excluida del listado por defecto, pero
 *             conserva su histórico (CAP-02-08-01).
 *         assessmentTemplateCreatedAt:
 *           type: string
 *         assessmentTemplateUpdatedAt:
 *           type: string
 *         assessmentTemplateDeletedAt:
 *           type: string
 */
export default class AssessmentTemplate extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare assessmentTemplateId: number

  @column()
  declare assessmentTemplateName: string

  @column()
  declare assessmentTemplateDescription: string | null

  @column()
  declare assessmentTemplateIsActive: boolean

  @column.dateTime({ autoCreate: true })
  declare assessmentTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare assessmentTemplateUpdatedAt: DateTime

  @column.dateTime({ columnName: 'assessment_template_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => AssessmentTemplateDimension, {
    foreignKey: 'assessmentTemplateId',
  })
  declare dimensions: HasMany<typeof AssessmentTemplateDimension>

  @hasMany(() => EmployeeAssessment, {
    foreignKey: 'assessmentTemplateId',
  })
  declare employeeAssessments: HasMany<typeof EmployeeAssessment>
}

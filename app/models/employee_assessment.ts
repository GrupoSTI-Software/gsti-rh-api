import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Employee from './employee.js'
import AssessmentTemplate from './assessment_template.js'
import EmployeeAssessmentResult from './employee_assessment_result.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeAssessment:
 *       type: object
 *       properties:
 *         employeeAssessmentId:
 *           type: number
 *           description: Identificador único de la evaluación del empleado
 *         employeeId:
 *           type: number
 *           description: Identificador del empleado
 *         assessmentTemplateId:
 *           type: number
 *           description: Identificador de la plantilla de evaluación
 *         employeeAssessmentDate:
 *           type: string
 *           format: date
 *           description: Fecha de aplicación de la evaluación
 *         employeeAssessmentStatus:
 *           type: string
 *           description: Estado general de la evaluación (pending, approved, failed)
 *         employeeAssessmentCreatedAt:
 *           type: string
 *         employeeAssessmentUpdatedAt:
 *           type: string
 *         employeeAssessmentDeletedAt:
 *           type: string
 */
export default class EmployeeAssessment extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeAssessmentId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare assessmentTemplateId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeAssessment) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.date()
  declare employeeAssessmentDate: DateTime

  @column()
  declare employeeAssessmentStatus: string

  @column.dateTime({ autoCreate: true })
  declare employeeAssessmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeAssessmentUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_assessment_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => AssessmentTemplate, {
    foreignKey: 'assessmentTemplateId',
  })
  declare assessmentTemplate: BelongsTo<typeof AssessmentTemplate>

  @hasMany(() => EmployeeAssessmentResult, {
    foreignKey: 'employeeAssessmentId',
  })
  declare results: HasMany<typeof EmployeeAssessmentResult>
}

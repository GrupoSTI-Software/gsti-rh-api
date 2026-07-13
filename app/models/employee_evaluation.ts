import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column ,belongsTo, hasMany} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Employee from './employee.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import EmployeeCompetencyEvaluation from './employee_competency_evaluation.js'
import EmployeeKpiEvaluation from './employee_kpi_evaluation.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeEvaluation:
 *        type: object
 *        properties:
 *          employeeEvaluationId:
 *            type: number
 *            description: Employee evaluation id
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeEvaluationDate:
 *            type: string
 *            description: Employee evaluation date
 *          employeeEvaluationType:
 *            type: string
 *            description: Employee evaluation type
 *          employeeEvaluationScore:
 *            type: number
 *            description: Employee evaluation score
 *          employeeEvaluationPotential:
 *            type: number
 *            description: Employee evaluation potential
 *          employeeEvaluationCreatedAt:
 *            type: string
 *            description: Employee evaluation created at
 *          employeeEvaluationUpdatedAt:
 *            type: string
 *            description: Employee evaluation updated at
 *          employeeEvaluationDeletedAt:
 *            type: string
 *            description: Employee evaluation deleted at
 */

export default class EmployeeEvaluation extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeEvaluationId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare employeeEvaluationDate: Date | string

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeEvaluation) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare employeeEvaluationType: string

  @column()
  declare employeeEvaluationScore: number | null

  @column()
  declare employeeEvaluationPotential: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeEvaluationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeEvaluationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_evaluation_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  static softDeletes = true

  @hasMany(() => EmployeeCompetencyEvaluation, {
    foreignKey: 'employeeEvaluationId',
  })
  declare employeeCompetencyEvaluations: HasMany<typeof EmployeeCompetencyEvaluation>

  @hasMany(() => EmployeeKpiEvaluation, {
    foreignKey: 'employeeEvaluationId',
  })
  declare employeeKpiEvaluations: HasMany<typeof EmployeeKpiEvaluation>
}

import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import InsuranceCoverageType from './insurance_coverage_type.js'
import WorkDisabilityPeriod from './work_disability_period.js'
import WorkDisabilityNote from './work_disability_note.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
/**
 * @swagger
 * components:
 *   schemas:
 *      WorkDisability:
 *        type: object
 *        properties:
 *          workDisabilityId:
 *            type: number
 *            description: Work disability ID
 *          workDisabilityUuid:
 *            type: string
 *            description: Work disability UUID
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (defensa en profundidad, USRH1784259058487)
 *          insuranceCoverageTypeId:
 *            type: number
 *            description: Insurance Coverage Type Id
 *          workDisabilityCreatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityUpdatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class WorkDisability extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare workDisabilityId: number

  @column()
  declare workDisabilityUuid: string

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1784259058487). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1784259058487). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: WorkDisability) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare insuranceCoverageTypeId: number

  @column.dateTime({ autoCreate: true })
  declare workDisabilityCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare workDisabilityUpdatedAt: DateTime

  @column.dateTime({ columnName: 'work_disability_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => InsuranceCoverageType, {
    foreignKey: 'insuranceCoverageTypeId',
  })
  declare insuranceCoverageType: BelongsTo<typeof InsuranceCoverageType>

  @hasMany(() => WorkDisabilityPeriod, {
    foreignKey: 'workDisabilityId',
    onQuery: (query) => {
      query.preload('workDisabilityType')
      query.preload('workDisability')
    },
  })
  declare workDisabilityPeriods: HasMany<typeof WorkDisabilityPeriod>

  @hasMany(() => WorkDisabilityNote, {
    foreignKey: 'workDisabilityId',
  })
  declare workDisabilityNotes: HasMany<typeof WorkDisabilityNote>
}

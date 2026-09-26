import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import WorkDisability from './work_disability.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import WorkDisabilityType from './work_disability_type.js'
import WorkDisabilityPeriodExpense from './work_disability_period_expense.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
/**
 * @swagger
 * components:
 *   schemas:
 *      WorkDisabilityPeriod:
 *        type: object
 *        properties:
 *          workDisabilityPeriodId:
 *            type: number
 *            description: Work disability period ID
 *          workDisabilityPeriodStartDate:
 *            type: string
 *            format: date
 *            description: Work disability period start date
 *          workDisabilityPeriodEndDate:
 *            type: string
 *            format: date
 *            description: Work disability period end date
 *          workDisabilityPeriodTicketFolio:
 *            type: string
 *            description: Work disability period ticket folio
 *          workDisabilityPeriodFile:
 *            type: string
 *            description: Work disability period file
 *          workDisabilityId:
 *            type: number
 *            description: Work disability Id
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (hereda de la incapacidad, USRH1784259058498)
 *          workDisabilityTypeId:
 *            type: number
 *            description: Work disability type Id
 *          workDisabilityPeriodCreatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityPeriodUpdatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityPeriodDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class WorkDisabilityPeriod extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare workDisabilityPeriodId: number

  @column()
  declare workDisabilityPeriodStartDate: string

  @column()
  declare workDisabilityPeriodEndDate: string

  @column()
  declare workDisabilityPeriodTicketFolio: string

  @column()
  declare workDisabilityPeriodFile: string

  @column()
  declare workDisabilityId: number

  /** Marca de pertenencia propia (hereda de la incapacidad, USRH1784259058498). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la incapacidad padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: WorkDisabilityPeriod) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => WorkDisability.query().where('workDisabilityId', instance.workDisabilityId).first(),
      'la incapacidad'
    )
  }

  @column()
  declare workDisabilityTypeId: number

  @column.dateTime({ autoCreate: true })
  declare workDisabilityPeriodCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare workDisabilityPeriodUpdatedAt: DateTime

  @column.dateTime({ columnName: 'work_disability_period_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => WorkDisability, {
    foreignKey: 'workDisabilityId',
    onQuery: (query) => {
      query.preload('insuranceCoverageType')
    },
  })
  declare workDisability: BelongsTo<typeof WorkDisability>

  @belongsTo(() => WorkDisabilityType, {
    foreignKey: 'workDisabilityTypeId',
  })
  declare workDisabilityType: BelongsTo<typeof WorkDisabilityType>

  @hasMany(() => WorkDisabilityPeriodExpense, {
    foreignKey: 'workDisabilityPeriodId',
  })
  declare workDisabilityPeriodExpenses: HasMany<typeof WorkDisabilityPeriodExpense>
}

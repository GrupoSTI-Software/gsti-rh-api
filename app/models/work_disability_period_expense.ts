import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import WorkDisabilityPeriod from './work_disability_period.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
/**
 * @swagger
 * components:
 *   schemas:
 *      WorkDisabilityPeriodExpense:
 *        type: object
 *        properties:
 *          workDisabilityPeriodExpenseId:
 *            type: number
 *            description: Work disability period expense ID
 *          workDisabilityPeriodExpenseFile:
 *            type: string
 *            description: Work disability period expense file
 *          workDisabilityPeriodExpenseAmount:
 *            type: number
 *            description: Work disability period expense amount
 *          workDisabilityPeriodId:
 *            type: number
 *            description: Work disability period Id
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (hereda del periodo, USRH1784259058498)
 *          workDisabilityPeriodExpenseCreatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityPeriodExpenseUpdatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityPeriodExpenseDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class WorkDisabilityPeriodExpense extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare workDisabilityPeriodExpenseId: number

  @column()
  declare workDisabilityPeriodExpenseFile: string

  @column()
  declare workDisabilityPeriodExpenseAmount: number

  @column()
  declare workDisabilityPeriodId: number

  /** Marca de pertenencia propia (hereda del periodo, USRH1784259058498). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el periodo padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: WorkDisabilityPeriodExpense) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        WorkDisabilityPeriod.query()
          .where('workDisabilityPeriodId', instance.workDisabilityPeriodId)
          .first(),
      'el periodo de incapacidad'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare workDisabilityPeriodExpenseCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare workDisabilityPeriodExpenseUpdatedAt: DateTime

  @column.dateTime({ columnName: 'work_disability_period_expense_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => WorkDisabilityPeriod, {
    foreignKey: 'workDisabilityPeriodId',
  })
  declare workDisabilityPeriod: BelongsTo<typeof WorkDisabilityPeriod>
}

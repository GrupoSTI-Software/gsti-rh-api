import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'

/**
 * @swagger
 * components:
 *   schemas:
 *      LaborLawHour:
 *        type: object
 *        properties:
 *          laborLawHoursId:
 *            type: number
 *            description: Labor law hours id
 *          laborLawHoursHoursPerWeek:
 *            type: number
 *            description: Hours per week according to labor law
 *          laborLawHoursActive:
 *            type: number
 *            description: Labor law hours status
 *          laborLawHoursApplySince:
 *            type: date
 *            description: Date since this configuration applies
 *          laborLawHoursDescription:
 *            type: string
 *            description: Description of the labor law configuration
 *          laborLawHoursCreatedAt:
 *            type: string
 *          laborLawHoursUpdatedAt:
 *            type: string
 *          laborLawHoursDeletedAt:
 *            type: string
 *
 */
export default class LaborLawHour extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare laborLawHoursId: number

  @column()
  declare laborLawHoursHoursPerWeek: number

  @column()
  declare laborLawHoursActive: number

  @column()
  declare laborLawHoursApplySince: string | Date

  @column()
  declare laborLawHoursDescription: string | null

  @column.dateTime({ autoCreate: true })
  declare laborLawHoursCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare laborLawHoursUpdatedAt: DateTime

  @column.dateTime({ columnName: 'labor_law_hours_deleted_at' })
  declare deletedAt: DateTime | null
}

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     Weight:
 *       type: object
 *       properties:
 *         weightId:
 *           type: number
 *           description: Weight id
 *         weightName:
 *           type: string
 *           description: Weight name
 *         weightValue:
 *           type: number
 *           description: Weight value
 *         weightCreatedAt:
 *           type: string
 *         weightUpdatedAt:
 *           type: string
 *         weightDeletedAt:
 *           type: string
 */
export default class Weight extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare weightId: number

  @column()
  declare weightName: string

  @column()
  declare weightValue: number

  @column.dateTime({ autoCreate: true })
  declare weightCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare weightUpdatedAt: DateTime

  @column.dateTime({ columnName: 'weight_deleted_at' })
  declare deletedAt: DateTime | null
}



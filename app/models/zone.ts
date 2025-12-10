import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     Zone:
 *       type: object
 *       properties:
 *         zoneId:
 *           type: number
 *           description: Zone id
 *         zoneName:
 *           type: string
 *           description: Zone name
 *         zoneAddress:
 *           type: string
 *           description: Zone address
 *         zonePolygon:
 *           type: string
 *           description: Zone polygon coordinates stored as JSON string
 *         zoneCreatedAt:
 *           type: string
 *         zoneUpdatedAt:
 *           type: string
 *         zoneDeletedAt:
 *           type: string
 */
export default class Zone extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare zoneId: number

  @column()
  declare zoneName: string

  @column()
  declare zoneThumbnail: string | null

  @column()
  declare zoneAddress: string

  @column()
  declare zonePolygon: string

  @column.dateTime({ autoCreate: true })
  declare zoneCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare zoneUpdatedAt: DateTime

  @column.dateTime({ columnName: 'zone_deleted_at' })
  declare deletedAt: DateTime | null
}



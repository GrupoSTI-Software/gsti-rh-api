import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *     Holiday:
 *       type: object
 *       properties:
 *         holidayId:
 *           type: number
 *           description: Holiday ID
 *         holidayName:
 *           type: string
 *           description: Name of the holiday
 *         holidayDate:
 *           type: string
 *           format: date
 *           description: Date of the holiday
 *         holidayBusinessUnits:
 *           type: string
 *           description: Business units
 *         holidayIcon:
 *           type: string
 *           description: Icon representing the holiday
 *         holidayFrequency:
 *           type: number
 *           description: holidayFrequency representing the holiday
 *         holidayIconId:
 *           type: number
 *           description: holidayIconId representing the icon id
 *         holidayIsOfficialRestDay:
 *           type: boolean
 *           description: Indicates if the holiday is an official mandatory rest day
 *           default: true
 *         holidayCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the holiday was created
 *         holidayUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the holiday was last updated
 *         holidayDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the holiday was soft-deleted
 *       example:
 *         holidayId: 1
 *         holidayName: "Christmas Day"
 *         holidayDate: "2024-12-25"
 *         holidayBusinessUnits: "sae"
 *         holidayIcon: "icon_christmas"
 *         holidayFrequency: 1
 *         holidayIconId: 1
 *         holidayIsOfficialRestDay: true
 *         holidayCreatedAt: '2024-06-20T12:00:00Z'
 *         holidayUpdatedAt: '2024-06-20T13:00:00Z'
 *         deletedAt: null
 */
export default class Holiday extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare holidayId: number

  @column()
  declare holidayName: string

  @column()
  declare holidayDate: string

  @column()
  declare holidayBusinessUnits: string

  @column()
  declare holidayIcon: string | null

  @column()
  declare holidayIconId: number | null

  @column()
  declare holidayFrequency: number

  @column()
  declare holidayIsOfficialRestDay: boolean

  @column.dateTime({ autoCreate: true })
  declare holidayCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare holidayUpdatedAt: DateTime

  @column.dateTime({ columnName: 'holiday_deleted_at' })
  declare deletedAt: DateTime | null
}

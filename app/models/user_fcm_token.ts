import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      UserFcmToken:
 *        type: object
 *        properties:
 *          userFcmTokenId:
 *            type: number
 *            description: User FCM token ID
 *          userId:
 *            type: number
 *            description: User Id
 *          userFcmToken:
 *            type: string
 *            description: User FCM token
 *          userFcmTokenActive:
 *            type: number
 *            description: User FCM token active
 *          userFcmTokenPlatform:
 *            type: string
 *            description: User FCM token platform (android, ios, web, etc.)
 *          userFcmTokenLastSeenAt:
 *            type: string
 *            format: date-time
 *            description: User FCM token last seen at
 *          userFcmTokenCreatedAt:
 *            type: string
 *            format: date-time
 *          userFcmTokenUpdatedAt:
 *            type: string
 *            format: date-time
 *          userFcmTokenDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class UserFcmToken extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare userFcmTokenId: number

  @column()
  declare userId: number

  @column()
  declare userFcmToken: string

  @column()
  declare userFcmTokenActive: number

  @column()
  declare userFcmTokenPlatform: string

  @column()
  declare userFcmTokenLastSeenAt: string | null

  @column.dateTime({ autoCreate: true })
  declare userFcmTokenCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userFcmTokenUpdatedAt: DateTime

  @column.dateTime({ columnName: 'user_fcm_token_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'userId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
        query.preload('role')
      }
    }
  })
  declare user: BelongsTo<typeof User>
}

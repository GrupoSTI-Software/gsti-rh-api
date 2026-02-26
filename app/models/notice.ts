import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import NoticeRecipient from './notice_recipient.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     Notice:
 *       type: object
 *       properties:
 *         noticeId:
 *           type: number
 *           description: Notice id
 *         noticeSubject:
 *           type: string
 *           description: Notice subject/title
 *         noticeDescription:
 *           type: string
 *           description: Notice description/content (HTML rich text)
 *         noticeType:
 *           type: string
 *           description: Notice type (text, image, pdf)
 *         noticeRecipientEmails:
 *           type: string
 *           description: JSON array of recipient emails
 *         noticeSentCount:
 *           type: number
 *           description: Number of emails sent
 *         noticeSentAt:
 *           type: string
 *           format: date-time
 *           description: Date when notice was sent
 *         noticeCreatedAt:
 *           type: string
 *           format: date-time
 *         noticeUpdatedAt:
 *           type: string
 *           format: date-time
 *         noticeDeletedAt:
 *           type: string
 *           format: date-time
 */
export default class Notice extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare noticeId: number

  @column()
  declare noticeSubject: string

  @column()
  declare noticeDescription: string

  @column()
  declare noticeType: string

  @column()
  declare noticeRecipientEmails: string | null

  @column()
  declare noticeSentCount: number

  @column.dateTime()
  declare noticeSentAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare noticeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare noticeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'notice_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => NoticeRecipient, {
    foreignKey: 'noticeId',
  })
  declare recipients: HasMany<typeof NoticeRecipient>
}

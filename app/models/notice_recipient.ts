import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Notice from './notice.js'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     NoticeRecipient:
 *       type: object
 *       properties:
 *         noticeRecipientId:
 *           type: number
 *           description: Notice recipient id
 *         noticeId:
 *           type: number
 *           description: Notice id
 *         employeeId:
 *           type: number
 *           nullable: true
 *           description: Employee id (if employee exists)
 *         employeeEmail:
 *           type: string
 *           description: Employee email address
 *         employeeName:
 *           type: string
 *           nullable: true
 *           description: Employee full name
 *         noticeRecipientSent:
 *           type: boolean
 *           description: Whether email was sent successfully
 *         noticeRecipientSentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date when email was sent
 *         noticeRecipientError:
 *           type: string
 *           nullable: true
 *           description: Error message if email failed
 *         noticeRecipientCreatedAt:
 *           type: string
 *           format: date-time
 *         noticeRecipientUpdatedAt:
 *           type: string
 *           format: date-time
 *         noticeRecipientDeletedAt:
 *           type: string
 *           format: date-time
 */
export default class NoticeRecipient extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true, columnName: 'notice_recipient_id' })
  declare noticeRecipientId: number

  @column({ columnName: 'notice_id' })
  declare noticeId: number

  @column({ columnName: 'employee_id' })
  declare employeeId: number | null

  @column()
  declare employeeEmail: string

  @column()
  declare employeeName: string | null

  @column()
  declare noticeRecipientSent: boolean

  @column.dateTime()
  declare noticeRecipientSentAt: DateTime | null

  @column()
  declare noticeRecipientRead: boolean

  @column.dateTime()
  declare noticeRecipientReadAt: DateTime | null

  @column()
  declare noticeRecipientError: string | null

  @column.dateTime({ autoCreate: true })
  declare noticeRecipientCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare noticeRecipientUpdatedAt: DateTime

  @column.dateTime({ columnName: 'notice_recipient_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Notice, {
    foreignKey: 'noticeId',
  })
  declare notice: BelongsTo<typeof Notice>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}

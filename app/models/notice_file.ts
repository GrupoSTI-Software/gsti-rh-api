import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     NoticeFile:
 *       type: object
 *       properties:
 *         noticeFileId:
 *           type: number
 *           description: Notice file id
 *         noticeId:
 *           type: number
 *           description: Notice id
 *         noticeFilePath:
 *           type: string
 *           description: Notice file path
 *         noticeCreatedAt:
 *           type: string
 *           format: date-time
 *         noticeFileUpdatedAt:
 *           type: string
 *           format: date-time
 *         noticeFileDeletedAt:
 *           type: string
 *           format: date-time
 */
export default class NoticeFile extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare noticeFileId: number

  @column()
  declare noticeId: number

  @column()
  declare noticeFilePath: string


  @column.dateTime({ autoCreate: true })
  declare noticeFileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare noticeFileUpdatedAt: DateTime

  @column.dateTime({ columnName: 'notice_file_deleted_at' })
  declare deletedAt: DateTime | null
}

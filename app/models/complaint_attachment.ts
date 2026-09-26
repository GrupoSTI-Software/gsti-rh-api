import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Complaint from './complaint.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplaintAttachment:
 *       type: object
 *       properties:
 *         complaintAttachmentId:
 *           type: integer
 *           description: Identificador único del adjunto
 *         complaintId:
 *           type: integer
 *           description: Queja a la que pertenece el adjunto (FK)
 *         complaintAttachmentFileName:
 *           type: string
 *           description: Nombre del archivo para visualización
 *         complaintAttachmentMimeType:
 *           type: string
 *           description: Tipo MIME del archivo sanitizado
 *         complaintAttachmentFileSize:
 *           type: integer
 *           description: Tamaño del archivo sanitizado en bytes
 *         complaintAttachmentSanitized:
 *           type: boolean
 *           description: Indica que el archivo fue sanitizado antes de persistir
 *         complaintAttachmentCreatedAt:
 *           type: string
 *           format: date-time
 *         complaintAttachmentUpdatedAt:
 *           type: string
 *           format: date-time
 *         complaintAttachmentDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class ComplaintAttachment extends compose(BaseModel, SoftDeletes) {
  static table = 'complaint_attachments'

  @column({ isPrimary: true })
  declare complaintAttachmentId: number

  @column()
  declare complaintId: number

  @column()
  declare complaintAttachmentFileName: string

  /**
   * Key del objeto en S3 (privado). No debe exponerse al cliente; solo se usa
   * internamente para generar URLs firmadas.
   */
  @column({ serializeAs: null })
  declare complaintAttachmentFilePath: string

  @column()
  declare complaintAttachmentMimeType: string

  @column()
  declare complaintAttachmentFileSize: number

  @column()
  declare complaintAttachmentSanitized: boolean

  @column.dateTime({ autoCreate: true })
  declare complaintAttachmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare complaintAttachmentUpdatedAt: DateTime

  @column.dateTime({ columnName: 'complaint_attachment_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Complaint, { foreignKey: 'complaintId' })
  declare complaint: BelongsTo<typeof Complaint>
}

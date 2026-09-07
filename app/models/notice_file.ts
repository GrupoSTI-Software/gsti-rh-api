import { DateTime } from 'luxon'
import { BaseModel, column, computed } from '@adonisjs/lucid/orm'
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


  /**
   * Nombre legible del adjunto: el último segmento de la key, con la extensión
   * REAL que escribió el intake. Con esto el cliente no tiene que derivarlo de
   * una URL.
   */
  @computed()
  get noticeFileName(): string | null {
    if (!this.noticeFilePath) return null
    const segments = this.noticeFilePath.split('/')
    return segments[segments.length - 1] || null
  }

  /**
   * Ruta autenticada del binario. Aditiva: la versión instalada de la app la
   * ignora, y `noticeFilePath` se mantiene porque el backoffice lo pinta.
   */
  @computed()
  get noticeFileUrl(): string | null {
    if (!this.noticeFilePath) return null
    return `/api/notices/${this.noticeId}/files/${this.noticeFileId}/content`
  }

  @column.dateTime({ autoCreate: true })
  declare noticeFileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare noticeFileUpdatedAt: DateTime

  @column.dateTime({ columnName: 'notice_file_deleted_at' })
  declare deletedAt: DateTime | null
}

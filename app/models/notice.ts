import { DateTime } from 'luxon'
import { BaseModel, column, computed, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import NoticeRecipient from './notice_recipient.js'
import NoticeFile from './notice_file.js'

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
export default class Notice extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare noticeId: number

  /** Marca de pertenencia (defensa en profundidad, USRH1784316436823). Nullable en legacy no derivables. */
  @column()
  declare businessUnitId: number | null

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

  /**
   * Cuántos destinatarios tiene el aviso.
   *
   * Lo alimenta el `withCount('recipients')` del listado. Sustituye al conteo
   * que el backoffice hacía sobre la longitud de `notice_recipient_emails`, un
   * longtext con los correos de toda la plantilla que salió del SELECT.
   *
   * **El backoffice debe pasar a leer este campo ANTES de liberar este cambio.**
   * Su fallback `notice.recipients?.length` devuelve 0 sin preload, así que el
   * contador caería a cero en todas las tarjetas sin un solo error visible.
   */
  @computed()
  get noticeRecipientsCount(): number {
    return Number(this.$extras.recipients_count ?? 0)
  }

  @hasMany(() => NoticeFile, {
    foreignKey: 'noticeId',
  })
  declare files: HasMany<typeof NoticeFile>
}

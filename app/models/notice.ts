import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, computed, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { NOTICE_STATUS, type NoticeAudienceValue, type NoticeStatusValue } from '#constants/notice'
import NoticeRecipient from './notice_recipient.js'
import NoticeFile from './notice_file.js'
import User from './user.js'

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
 *         noticeAudience:
 *           type: string
 *           description: How recipients were chosen (company, department, manual)
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
 *         noticeScheduledAt:
 *           type: string
 *           format: date-time
 *           description: Date when the scheduled notice must be sent
 *         noticeDepartmentId:
 *           type: number
 *           nullable: true
 *           description: Department criterion when the audience is department
 *         noticePositionId:
 *           type: number
 *           nullable: true
 *           description: Optional position criterion when the audience is department
 *         noticeLastResentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Last resend of an already sent notice
 *         noticeScheduleError:
 *           type: string
 *           nullable: true
 *           description: Why the last scheduled send failed (cleared on reschedule or successful send)
 *         noticeStatus:
 *           type: string
 *           description: Derived status (sent, scheduled, draft)
 *         noticeAuthorName:
 *           type: string
 *           description: Name of the user who wrote the notice
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

  /** Cómo se armó la lista de destinatarios. Etiqueta de lectura y filtro. */
  @column()
  declare noticeAudience: NoticeAudienceValue

  /**
   * Criterio del público `department`: departamento y, opcionalmente, puesto.
   * Con él el envío programado vuelve a resolver los destinatarios al momento
   * de enviar. NULL para `company` y `manual`.
   */
  @column()
  declare noticeDepartmentId: number | null

  @column()
  declare noticePositionId: number | null

  @column()
  declare noticeRecipientEmails: string | null

  @column()
  declare noticeSentCount: number

  @column.dateTime()
  declare noticeSentAt: DateTime | null

  /** Hora del envío agendado. NULL en enviados y borradores. */
  @column.dateTime()
  declare noticeScheduledAt: DateTime | null

  /** Último reenvío de un aviso ya enviado. `noticeSentAt` conserva el envío original. */
  @column.dateTime()
  declare noticeLastResentAt: DateTime | null

  /**
   * Por qué falló el último envío programado. Se guarda al degradar el aviso a
   * borrador y se limpia al reprogramarlo o al enviarlo con éxito.
   */
  @column()
  declare noticeScheduleError: string | null

  /** Quién redactó el aviso. No se serializa: el nombre sale en `noticeAuthorName`. */
  @column({ serializeAs: null })
  declare noticeCreatedByUserId: number | null

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
   * Autor del aviso. Va fuera de la serialización a propósito: el cliente
   * solo necesita el nombre, nunca el usuario completo.
   */
  @belongsTo(() => User, {
    foreignKey: 'noticeCreatedByUserId',
    serializeAs: null,
  })
  declare creator: BelongsTo<typeof User>

  /**
   * Estado derivado. No se persiste: `enviado` si ya salió, `programado` si
   * tiene hora agendada y aún no salió, `borrador` en cualquier otro caso.
   */
  @computed()
  get noticeStatus(): NoticeStatusValue {
    if (this.noticeSentAt) return NOTICE_STATUS.SENT
    if (this.noticeScheduledAt) return NOTICE_STATUS.SCHEDULED
    return NOTICE_STATUS.DRAFT
  }

  /**
   * Nombre del autor, disponible cuando la consulta precargó `creator.person`.
   * `null` en los avisos anteriores al registro del autor.
   */
  @computed()
  get noticeAuthorName(): string | null {
    const person = this.creator?.person
    if (!person) return null
    const name = [person.personFirstname, person.personLastname, person.personSecondLastname]
      .map((part) => (part || '').trim())
      .filter((part) => part.length > 0)
      .join(' ')
    return name || null
  }

  /**
   * Ruta autenticada del cuerpo cuando el aviso NO es de texto.
   *
   * Los avisos de imagen o PDF guardan la key del archivo en
   * `notice_description`, sin fila en `notice_files`. Hoy el cliente imprime esa
   * key privada como texto en pantalla.
   *
   * **Necesita `notice_type` en el SELECT.** Sin él sale null en el listado y
   * bien en el detalle, y el aviso se pinta distinto en cada sitio sin un solo
   * error visible.
   */
  @computed()
  get noticeBodyFileUrl(): string | null {
    if (!this.noticeType || this.noticeType === 'text') return null
    if (!this.noticeDescription) return null
    return `/api/notices/${this.noticeId}/body-file`
  }

  /**
   * Cuántos destinatarios tiene el aviso.
   *
   * Lo alimenta el `withCount('recipients')` del listado y del detalle.
   * Sustituye al conteo que el backoffice hacía sobre la longitud de
   * `notice_recipient_emails`, un longtext con los correos de toda la plantilla
   * que salió del SELECT.
   */
  @computed()
  get noticeRecipientsCount(): number {
    return Number(this.$extras.recipients_count ?? 0)
  }

  /** Cuántos destinatarios confirmaron lectura desde la app. Lo alimenta `withCount`. */
  @computed()
  get noticeReadCount(): number {
    return Number(this.$extras.recipients_read_count ?? 0)
  }

  @hasMany(() => NoticeFile, {
    foreignKey: 'noticeId',
  })
  declare files: HasMany<typeof NoticeFile>
}

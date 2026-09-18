import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import * as relations from '@adonisjs/lucid/types/relations'
import ExceptionRequest from './exception_request.js'
import User from './user.js'

/**
 * Comprobante asociado a una solicitud de permiso.
 *
 * Lo sube Recursos Humanos desde el backoffice cuando el empleado entrega el
 * documento en físico. La clave de almacenamiento nunca sale al cliente: quien
 * quiere el archivo lo pide por el id del adjunto y el servidor resuelve la ruta.
 */
export default class ExceptionRequestAttachment extends compose(BaseModel, SoftDeletes) {
  static table = 'exception_request_attachments'

  @column({ isPrimary: true })
  declare exceptionRequestAttachmentId: number

  @column()
  declare exceptionRequestId: number

  /** Empresa dueña del archivo. Permite acotar sin joins al servirlo. */
  @column()
  declare businessUnitId: number

  /** Ruta en el bucket. Only server-side. */
  @column()
  declare attachmentStorageKey: string

  /** Nombre con el que se subió, para mostrarlo en la UI. */
  @column()
  declare attachmentOriginalName: string

  /** MIME real que devolvió el intake tras inspeccionar el contenido. */
  @column()
  declare attachmentMime: string

  /** Tamaño del archivo almacenado. */
  @column()
  declare attachmentSizeBytes: number

  /** Quién lo subió. */
  @column()
  declare uploadedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare exceptionRequestAttachmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare exceptionRequestAttachmentUpdatedAt: DateTime

  @column.dateTime({ columnName: 'exception_request_attachment_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ExceptionRequest, { foreignKey: 'exceptionRequestId' })
  declare exceptionRequest: relations.BelongsTo<typeof ExceptionRequest>

  @belongsTo(() => User, { foreignKey: 'uploadedByUserId' })
  declare uploadedByUser: relations.BelongsTo<typeof User>
}

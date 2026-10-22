import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import type { TeleworkPhotoNoticeStatus } from '#constants/telework_photo_notice'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * Aviso de privacidad de la evidencia fotográfica del puesto de trabajo
 * (VLRH-H1791306079310, §10), una fila por versión y empresa. Espejo de
 * `telework_policy.ts`: mismo `compose(BaseModel, SoftDeletes,
 * withBusinessUnitScope())` y misma regla de «la versión nunca se reutiliza».
 *
 * Nada se borra (C0129 R3, CA-17): las versiones publicadas solo cambian
 * `teleworkPhotoNoticeIsCurrent` dentro del `publish`; el borrador es lo único
 * descartable y por soft delete (`deletedAt`, mapeado a
 * `telework_photo_notice_deleted_at`). El módulo no expone método que borre ni
 * que edite una fila publicada.
 *
 * `teleworkPhotoNoticeContent` conserva el texto CON marcadores (es lo que se
 * edita) y `teleworkPhotoNoticeRenderedContent` guarda el texto ya resuelto y
 * saneado que se publica y se sirve. `teleworkPhotoNoticeContentHash` es la
 * huella SHA-256 del título y el texto resuelto.
 *
 * `createdByUserId` y `publishedByUserId` conservan `serializeAs: null`: los
 * DTO (§11) exponen el nombre resuelto (`publishedByName`, vía la relación
 * `publisher`), nunca el userId crudo.
 */
export default class TeleworkPhotoNotice extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'telework_photo_notices'

  @column({ isPrimary: true })
  declare teleworkPhotoNoticeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare teleworkPhotoNoticeTemplateId: number | null

  @column()
  declare teleworkPhotoNoticeVersion: number

  @column()
  declare teleworkPhotoNoticeTitle: string

  @column()
  declare teleworkPhotoNoticeContent: string

  @column()
  declare teleworkPhotoNoticeRenderedContent: string | null

  @column()
  declare teleworkPhotoNoticeStatus: TeleworkPhotoNoticeStatus

  @column({
    consume: (value: boolean | number) => Boolean(value),
  })
  declare teleworkPhotoNoticeIsCurrent: boolean

  @column()
  declare teleworkPhotoNoticeContentHash: string | null

  @column({ serializeAs: null })
  declare createdByUserId: number

  @column()
  declare updatedByUserId: number

  @column({ serializeAs: null })
  declare publishedByUserId: number | null

  @column.dateTime()
  declare publishedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'telework_photo_notice_created_at' })
  declare teleworkPhotoNoticeCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'telework_photo_notice_updated_at',
  })
  declare teleworkPhotoNoticeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'telework_photo_notice_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  /**
   * Quién publicó esta versión. `publishedByUserId` conserva
   * `serializeAs: null`: los DTO exponen el nombre resuelto
   * (`publishedByName`), nunca el userId crudo.
   */
  @belongsTo(() => User, { foreignKey: 'publishedByUserId' })
  declare publisher: BelongsTo<typeof User>
}

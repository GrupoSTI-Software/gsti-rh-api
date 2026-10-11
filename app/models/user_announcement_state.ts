import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/**
 * Marca de agua del último anuncio de producto que el usuario vio en el Backoffice.
 *
 * Una fila por usuario (`user_id` único). Solo guarda la fecha: el contenido de los
 * anuncios vive en el Backoffice. Es personal del usuario, no de la empresa, por eso
 * no lleva `business_unit_id` ni mixin de tenant.
 */
export default class UserAnnouncementState extends BaseModel {
  static table = 'user_announcement_states'

  @column({ isPrimary: true })
  declare userAnnouncementStateId: number

  @column()
  declare userId: number

  @column.dateTime()
  declare userAnnouncementStateLastSeenAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare userAnnouncementStateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userAnnouncementStateUpdatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}

import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/**
 * Registro inmutable de la aceptación de T&C y aviso de privacidad.
 *
 * Sin soft delete por diseño: el registro es evidencia legal (LFPDPPP).
 * Un usuario puede tener múltiples registros si acepta distintas versiones.
 */
export default class UserConsent extends BaseModel {
  static table = 'user_consents'

  @column({ isPrimary: true })
  declare userConsentId: number

  @column()
  declare userId: number

  @column()
  declare userConsentDocumentVersion: string

  @column.dateTime()
  declare userConsentAcceptedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare userConsentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userConsentUpdatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}

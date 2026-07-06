import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type LegalDocumentType = 'privacy_notice' | 'terms_conditions' | 'biometric_consent'
export type LegalDocumentStatus = 'draft' | 'published'
export type LegalDocumentContent = Record<string, string>

/**
 * Documento legal de plataforma (aviso de privacidad, términos y condiciones o
 * consentimiento biométrico), versionado.
 *
 * Documento global de GSTI: no lleva `business_unit_id` ni usa `withBusinessUnitScope()`.
 * El contenido de una versión publicada es inmutable por convención de servicio
 * (no se edita: se publica una versión nueva). Solo una fila por tipo puede tener
 * `legalDocumentIsCurrent = true` a la vez; ese invariante lo garantiza el service
 * de publicación dentro de una transacción, no un índice único parcial.
 */
export default class LegalDocument extends BaseModel {
  static table = 'legal_documents'

  @column({ isPrimary: true })
  declare legalDocumentId: number

  @column()
  declare legalDocumentType: LegalDocumentType

  @column()
  declare legalDocumentVersion: string

  @column({
    prepare: (value: LegalDocumentContent | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? (JSON.parse(value) as LegalDocumentContent) : null),
  })
  declare legalDocumentContent: LegalDocumentContent | null

  @column()
  declare legalDocumentIsCurrent: boolean

  @column()
  declare legalDocumentStatus: LegalDocumentStatus

  @column.dateTime()
  declare legalDocumentPublishedAt: DateTime | null

  @column()
  declare legalDocumentPublishedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare legalDocumentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare legalDocumentUpdatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'legalDocumentPublishedByUserId' })
  declare publishedByUser: BelongsTo<typeof User>
}

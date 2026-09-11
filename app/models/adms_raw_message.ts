import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { AdmsRawStatus } from '#modules/adms/adms.constants'

/**
 * Cuerpo crudo de un POST del canal ADMS (spec v2, 4.3 y 10).
 *
 * `admsRawMessageBody` va cifrado AES-256-CBC en reposo (puede llevar templates
 * biometricos y nombres) y NUNCA se serializa: ninguna ruta lo devuelve.
 * `businessUnitId` NULL = serie que no resolvio; esas filas no salen por rutas
 * de empresa (el repositorio filtra `whereNotNull`). Sin `includeGlobal`.
 */
export default class AdmsRawMessage extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'adms_raw_messages'

  @column({ isPrimary: true })
  declare admsRawMessageId: number

  @column()
  declare accessPointId: number | null

  @column()
  declare businessUnitId: number | null

  @column()
  declare admsRawMessageSerial: string

  @column()
  declare admsRawMessageRemoteIp: string

  @column()
  declare admsRawMessageMethod: string

  @column()
  declare admsRawMessagePath: string

  @column()
  declare admsRawMessageQuery: string | null

  @column()
  declare admsRawMessageTable: string | null

  @column()
  declare admsRawMessageStamp: string | null

  @column()
  declare admsRawMessageContentType: string | null

  /** Cuerpo integro. Cifrado en reposo, nunca serializado (spec 13, regla 7). */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serializeAs: null,
  })
  declare admsRawMessageBody: string | null

  @column()
  declare admsRawMessageBodyBytes: number

  @column()
  declare admsRawMessageLineCount: number

  @column()
  declare admsRawMessageStatus: AdmsRawStatus

  @column()
  declare admsRawMessageAck: string | null

  @column()
  declare admsRawMessageError: string | null

  @column.dateTime()
  declare admsRawMessageReceivedAt: DateTime

  @column.dateTime()
  declare admsRawMessageProcessedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare admsRawMessageCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsRawMessageUpdatedAt: DateTime
}

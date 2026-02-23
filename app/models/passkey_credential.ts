import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import User from './user.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *      PasskeyCredential:
 *        type: object
 *        properties:
 *          passkeyCredentialId:
 *            type: number
 *            description: Passkey credential id
 *          userId:
 *            type: number
 *            description: User id
 *          passkeyCredentialIdBase64:
 *            type: string
 *            description: Credential ID in base64url format
 *          passkeyCredentialPublicKey:
 *            type: string
 *            description: Public key for signature verification
 *          passkeyCredentialCounter:
 *            type: number
 *            description: Signature counter for replay attack prevention
 *          passkeyCredentialDeviceName:
 *            type: string
 *            description: Device name (e.g., "iPhone de Juan")
 *          passkeyCredentialTransports:
 *            type: array
 *            description: Supported transports (usb, nfc, ble, internal)
 *          passkeyCredentialAaguid:
 *            type: string
 *            description: Authenticator AAGUID
 *          passkeyCredentialBackedUp:
 *            type: boolean
 *            description: Whether the credential is backed up
 *          passkeyCredentialCreatedAt:
 *            type: string
 *            format: date-time
 *          passkeyCredentialLastUsedAt:
 *            type: string
 *            format: date-time
 *          passkeyCredentialUpdatedAt:
 *            type: string
 *            format: date-time
 *          passkeyCredentialDeletedAt:
 *            type: string
 *            format: date-time
 */
export default class PasskeyCredential extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare passkeyCredentialId: number

  @column()
  declare userId: number

  @column({ columnName: 'passkey_credential_id_base64' })
  declare passkeyCredentialIdBase64: string

  @column()
  declare passkeyCredentialPublicKey: string

  @column()
  declare passkeyCredentialCounter: number

  @column()
  declare passkeyCredentialDeviceName: string | null

  @column({
    prepare: (value: string[] | null) => (value && value.length > 0 ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare passkeyCredentialTransports: string[] | null

  @column()
  declare passkeyCredentialAaguid: string | null

  @column()
  declare passkeyCredentialBackedUp: boolean

  @column.dateTime({ autoCreate: true })
  declare passkeyCredentialCreatedAt: DateTime

  @column.dateTime()
  declare passkeyCredentialLastUsedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare passkeyCredentialUpdatedAt: DateTime

  @column.dateTime({ columnName: 'passkey_credential_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>
}

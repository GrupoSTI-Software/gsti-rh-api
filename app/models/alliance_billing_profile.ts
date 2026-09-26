import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'

/**
 * Perfil fiscal de una alianza comercial (USRH1788505941893).
 * Un registro vivo por alianza; el RFC viaja cifrado en reposo con huella
 * buscable. `serializeAs: null` en `rfc` y `rfcHash` es la red de seguridad
 * del doble candado: el DTO plano es la defensa principal.
 */
export default class AllianceBillingProfile extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'alliance_billing_profiles'

  @column({ isPrimary: true, columnName: 'alliance_billing_profile_id' })
  declare allianceBillingProfileId: number

  @column({ columnName: 'alliance_id' })
  declare allianceId: number

  /**
   * RFC de la alianza — cifrado AES en reposo. Fail-closed: si rota la
   * llave el operador ve el campo vacío, nunca el ciphertext.
   */
  @column({
    columnName: 'alliance_billing_profile_rfc',
    serializeAs: null,
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) {
        return null
      }

      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare rfc: string | null

  /** Huella HMAC-SHA256 del RFC normalizado. Nunca se serializa ni se acepta de entrada. */
  @column({ columnName: 'alliance_billing_profile_rfc_hash', serializeAs: null })
  declare rfcHash: string | null

  @column({ columnName: 'alliance_billing_profile_legal_name' })
  declare legalName: string

  @column({ columnName: 'alliance_billing_profile_postal_code' })
  declare postalCode: string | null

  @column({ columnName: 'alliance_billing_profile_tax_regime_code' })
  declare taxRegimeCode: string | null

  @column({ columnName: 'alliance_billing_profile_cfdi_use_code' })
  declare cfdiUseCode: string | null

  @column({ columnName: 'alliance_billing_profile_billing_email' })
  declare billingEmail: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'alliance_billing_profile_deleted_at' })
  declare deletedAt: DateTime | null
}

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * Perfil de facturación fiscal de una empresa (USRH1786737531057).
 * Un registro vivo por tenant; el RFC viaja cifrado en reposo con huella buscable.
 */
export default class TenantBillingProfile extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'tenant_billing_profiles'

  @column({ isPrimary: true, columnName: 'tenant_billing_profile_id' })
  declare tenantBillingProfileId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  /**
   * RFC del tenant — cifrado AES en reposo. Opcional hasta el momento de facturar.
   */
  @column({
    columnName: 'tenant_billing_profile_rfc',
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

  /** Huella HMAC-SHA256 del RFC normalizado. Uso interno; nunca se serializa. */
  @column({ columnName: 'tenant_billing_profile_rfc_hash', serializeAs: null })
  declare rfcHash: string | null

  @column({ columnName: 'tenant_billing_profile_legal_name' })
  declare legalName: string

  @column.dateTime({ columnName: 'tenant_billing_profile_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'tenant_billing_profile_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'tenant_billing_profile_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * Régimen fiscal del SAT (`c_RegimenFiscal`) — catálogo global (USRH1786737531063).
 */
export default class SatTaxRegime extends compose(BaseModel, SoftDeletes) {
  static table = 'sat_tax_regimes'

  @column({ isPrimary: true })
  declare satTaxRegimeId: number

  @column()
  declare satTaxRegimeCode: string

  @column()
  declare satTaxRegimeDescription: string

  @column()
  declare satTaxRegimeAppliesToIndividual: number

  @column()
  declare satTaxRegimeAppliesToLegalEntity: number

  @column()
  declare satTaxRegimeActive: number

  @column.dateTime({ autoCreate: true })
  declare satTaxRegimeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare satTaxRegimeUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'sat_tax_regime_deleted_at' })
  declare deletedAt: DateTime | null
}

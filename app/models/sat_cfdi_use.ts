import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import SatTaxRegime from '#models/sat_tax_regime'

/**
 * Uso de CFDI del SAT (`c_UsoCFDI`) — catálogo global (USRH1786737531063).
 */
export default class SatCfdiUse extends compose(BaseModel, SoftDeletes) {
  static table = 'sat_cfdi_uses'

  @column({ isPrimary: true })
  declare satCfdiUseId: number

  @column()
  declare satCfdiUseCode: string

  @column()
  declare satCfdiUseDescription: string

  @column()
  declare satCfdiUseAppliesToIndividual: number

  @column()
  declare satCfdiUseAppliesToLegalEntity: number

  @column()
  declare satCfdiUseActive: number

  @column.dateTime({ autoCreate: true })
  declare satCfdiUseCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare satCfdiUseUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'sat_cfdi_use_deleted_at' })
  declare deletedAt: DateTime | null

  /** Regímenes fiscales de receptor admitidos por este uso (tabla pivote). */
  @manyToMany(() => SatTaxRegime, {
    pivotTable: 'sat_cfdi_use_tax_regimes',
    localKey: 'satCfdiUseId',
    pivotForeignKey: 'sat_cfdi_use_id',
    relatedKey: 'satTaxRegimeId',
    pivotRelatedForeignKey: 'sat_tax_regime_id',
  })
  declare taxRegimes: ManyToMany<typeof SatTaxRegime>
}

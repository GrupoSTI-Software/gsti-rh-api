import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Alliance from '#models/alliance'
import BusinessUnit from '#models/business_unit'

/**
 * Atribución de una empresa cliente a una alianza comercial
 * (USRH1789099318034).
 *
 * Dato de plataforma: no compone `withBusinessUnitScope`. El aislamiento
 * lo da el guard `platformAdmin`. La columna generada
 * `alliance_attribution_is_live` no se declara: MySQL rechaza escribirla
 * y Lucid la metería en el INSERT.
 *
 * Ningún endpoint escribe `alliance_attribution_deleted_at`. Cerrar es
 * la HU 06b (`closed_at`), no un soft delete.
 */
export default class AllianceAttribution extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'alliance_attributions'

  @column({ isPrimary: true })
  declare allianceAttributionId: number

  @column()
  declare allianceId: number

  @column({ serializeAs: null })
  declare businessUnitId: number

  @column({ consume: (value: number | string) => Number(value) })
  declare allianceAttributionCommissionPercent: number

  @column({
    consume: (value: number | string | null) => (value === null ? null : Number(value)),
  })
  declare allianceAttributionTermPeriods: number | null

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare allianceAttributionStartsAt: DateTime

  @column.dateTime()
  declare allianceAttributionClosedAt: DateTime | null

  @column()
  declare allianceAttributionCloseReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'alliance_attribution_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Alliance, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare alliance: BelongsTo<typeof Alliance>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}

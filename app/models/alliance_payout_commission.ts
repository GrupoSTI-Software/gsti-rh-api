import { DateTime } from 'luxon'
import { BaseModel, beforeDelete, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AllianceCommission from '#models/alliance_commission'
import AlliancePayout from '#models/alliance_payout'

/**
 * Fila del pivote inmutable liquidación↔comisión (USRH1787719056820).
 *
 * `alliance_payout_commission_is_live` es una columna generada VIRTUAL
 * (1 si `annulled_at IS NULL`, si no NULL) que sostiene el UNIQUE
 * `alliance_payout_commissions_commission_live_unique`: una comisión
 * nunca en dos liquidaciones vivas. No se declara aquí a propósito — es
 * responsabilidad exclusiva de MySQL, nunca del modelo.
 *
 * Sin `updatedAt`: nace y, si se anula, la anulación escribe
 * `alliancePayoutCommissionAnnulledAt` por Query Builder directo
 * (USRH1787719056821), sin pasar por `.save()`.
 */
export default class AlliancePayoutCommission extends BaseModel {
  static readonly table = 'alliance_payout_commissions'

  @column({ isPrimary: true })
  declare alliancePayoutCommissionId: number

  @column()
  declare alliancePayoutId: number

  @column()
  declare allianceCommissionId: number

  @column.dateTime()
  declare alliancePayoutCommissionAnnulledAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => AlliancePayout, {
    foreignKey: 'alliancePayoutId',
    localKey: 'alliancePayoutId',
  })
  declare payout: BelongsTo<typeof AlliancePayout>

  @belongsTo(() => AllianceCommission, {
    foreignKey: 'allianceCommissionId',
    localKey: 'allianceCommissionId',
  })
  declare commission: BelongsTo<typeof AllianceCommission>

  /** Fila inmutable: nunca se borra, ni desde el modelo (regla 9). */
  @beforeDelete()
  static rejectDelete() {
    throw new Error('Las filas del pivote de liquidación son inmutables: no se pueden eliminar.')
  }
}

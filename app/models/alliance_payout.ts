import { DateTime } from 'luxon'
import { BaseModel, beforeDelete, beforeUpdate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Alliance from '#models/alliance'
import AlliancePayoutCommission from '#models/alliance_payout_commission'
import User from '#models/user'

/**
 * Liquidación de comisiones de alianza (USRH1787719056820): deja escrito
 * que GSTI ya le pagó a la alianza un conjunto de comisiones concretas.
 *
 * Inmutable desde el modelo: nace por `createPayout` del servicio dentro
 * de una transacción y no se corrige ni se borra por aquí. La anulación
 * (USRH1787719056821) escribe las tres columnas de anulación por Query
 * Builder, sin pasar por `.save()` — no rompe este candado.
 */
export default class AlliancePayout extends BaseModel {
  static readonly table = 'alliance_payouts'

  @column({ isPrimary: true })
  declare alliancePayoutId: number

  @column()
  declare allianceId: number

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare alliancePayoutPaidOn: DateTime

  @column()
  declare alliancePayoutReference: string

  @column()
  declare alliancePayoutAmountCents: number

  @column()
  declare alliancePayoutCreatedByUserId: number

  @column.dateTime()
  declare alliancePayoutAnnulledAt: DateTime | null

  @column()
  declare alliancePayoutAnnulmentReason: string | null

  @column()
  declare alliancePayoutAnnulledByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Alliance, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare alliance: BelongsTo<typeof Alliance>

  @belongsTo(() => User, {
    foreignKey: 'alliancePayoutCreatedByUserId',
    localKey: 'userId',
  })
  declare createdByUser: BelongsTo<typeof User>

  @hasMany(() => AlliancePayoutCommission, {
    foreignKey: 'alliancePayoutId',
    localKey: 'alliancePayoutId',
  })
  declare payoutCommissions: HasMany<typeof AlliancePayoutCommission>

  /**
   * Una liquidación registrada no se modifica desde el modelo (regla 9).
   * La anulación futura escribe por Query Builder, sin `.save()`.
   */
  @beforeUpdate()
  static rejectUpdate() {
    throw new Error('Las liquidaciones son inmutables: no se pueden modificar desde el modelo.')
  }

  @beforeDelete()
  static rejectDelete() {
    throw new Error('Las liquidaciones son inmutables: no se pueden eliminar.')
  }
}

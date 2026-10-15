import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export const ACCESS_POINT_SHARE_REVOKE_REASON = {
  MANUAL: 'manual',
  UNASSIGNMENT: 'unassignment',
} as const

export type AccessPointShareRevokeReason =
  (typeof ACCESS_POINT_SHARE_REVOKE_REASON)[keyof typeof ACCESS_POINT_SHARE_REVOKE_REASON]

/**
 * Invitacion de una empresa a un checador ajeno. Dato de plataforma: sin mixin
 * de scope, se lee por `AccessPointScope` o desde el landlord.
 */
export default class AccessPointShare extends BaseModel {
  static readonly table = 'access_point_shares'

  @column({ isPrimary: true })
  declare accessPointShareId: number

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare platformTenantGroupId: number

  @column.dateTime()
  declare accessPointShareGrantedAt: DateTime

  @column()
  declare accessPointShareGrantedBy: number | null

  @column.dateTime()
  declare accessPointShareRevokedAt: DateTime | null

  @column()
  declare accessPointShareRevokedBy: number | null

  @column()
  declare accessPointShareRevokeReason: AccessPointShareRevokeReason | null

  @column.dateTime({ autoCreate: true })
  declare accessPointShareCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointShareUpdatedAt: DateTime
}

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

export type AdmsUnmappedPinStatus = 'pending' | 'linked' | 'dismissed'

/**
 * PIN que el checador reporta y que no corresponde a ningun colaborador
 * (spec v2, 9.4). El nombre que el equipo declara identifica a una persona:
 * va cifrado, no se serializa y se borra al resolver.
 */
export default class AdmsUnmappedPin extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'adms_unmapped_pins'

  @column({ isPrimary: true })
  declare admsUnmappedPinId: number

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare admsUnmappedPinPin: string

  /** Nombre declarado por el equipo. Cifrado en reposo, nunca serializado. */
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
  declare admsUnmappedPinName: string | null

  @column.dateTime()
  declare admsUnmappedPinFirstSeenAt: DateTime

  @column.dateTime()
  declare admsUnmappedPinLastSeenAt: DateTime

  @column()
  declare admsUnmappedPinPunchCount: number

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | string[] | null) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return JSON.parse(value) as string[]
      return value
    },
  })
  declare admsUnmappedPinBioTypesSeen: string[] | null

  @column()
  declare admsUnmappedPinStatus: AdmsUnmappedPinStatus

  @column()
  declare admsUnmappedPinDismissReason: string | null

  @column()
  declare linkedEmployeeId: number | null

  @column()
  declare admsUnmappedPinResolvedByUserId: number | null

  @column.dateTime()
  declare admsUnmappedPinResolvedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare admsUnmappedPinCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsUnmappedPinUpdatedAt: DateTime
}

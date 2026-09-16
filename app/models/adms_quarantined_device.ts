import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Pistas que el equipo declara al contactar; lista blanca y tope de 100 caracteres. */
export interface AdmsQuarantineHints {
  platform?: string
  fwVersion?: string
  pushVersion?: string
  deviceName?: string
}

export type AdmsQuarantineStatus = 'pending' | 'claimed' | 'dismissed' | 'locked'

/**
 * Serie desconocida que contacto al canal (spec v2, 4.2 y 9.3). Tabla global sin
 * mixin de tenant: una serie que nadie registro no tiene empresa.
 */
export default class AdmsQuarantinedDevice extends BaseModel {
  static readonly table = 'adms_quarantined_devices'

  @column({ isPrimary: true })
  declare admsQuarantinedDeviceId: number

  @column()
  declare admsQuarantinedDeviceSerial: string

  @column.dateTime()
  declare admsQuarantinedDeviceFirstSeenAt: DateTime

  @column.dateTime()
  declare admsQuarantinedDeviceLastSeenAt: DateTime

  @column()
  declare admsQuarantinedDeviceLastIp: string

  @column()
  declare admsQuarantinedDeviceHitCount: number

  @column({
    prepare: (value: AdmsQuarantineHints | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | AdmsQuarantineHints | null) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return JSON.parse(value) as AdmsQuarantineHints
      return value
    },
  })
  declare admsQuarantinedDeviceHints: AdmsQuarantineHints | null

  @column()
  declare admsQuarantinedDeviceStatus: AdmsQuarantineStatus

  @column()
  declare admsQuarantinedDeviceFailedClaims: number

  @column()
  declare claimedBusinessUnitId: number | null

  @column()
  declare claimedAccessPointId: number | null

  @column()
  declare admsQuarantinedDeviceDismissReason: string | null

  @column()
  declare admsQuarantinedDeviceResolvedByUserId: number | null

  @column.dateTime()
  declare admsQuarantinedDeviceResolvedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare admsQuarantinedDeviceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsQuarantinedDeviceUpdatedAt: DateTime
}

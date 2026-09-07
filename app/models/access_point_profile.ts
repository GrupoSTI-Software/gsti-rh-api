import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import AccessPoint from './access_point.js'
import type { AdmsDialect } from '#modules/adms/adms.constants'

/** Procedencia de cada version de algoritmo (spec 9.1). */
export interface AccessPointProfileVersionsSource {
  fp?: 'multibio' | 'flat'
  face?: 'multibio' | 'flat'
  fv?: 'multibio' | 'flat'
  pv?: 'multibio' | 'flat'
}

export type AccessPointClockSyncStatus = 'ok' | 'drift' | 'unverified' | 'failed' | 'manual'

function jsonPrepare<T>(value: T | null): string | null {
  return value ? JSON.stringify(value) : null
}

function jsonConsume<T>(value: string | T | null): T | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return JSON.parse(value) as T
  return value
}

/**
 * Lo que el equipo declara de si mismo (spec v2, 9.1 y 10). Una fila por punto
 * de acceso; toda columna del aparato es NULL si no la declara.
 */
export default class AccessPointProfile extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'access_point_profiles'

  @column({ isPrimary: true })
  declare accessPointProfileId: number

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare accessPointProfilePlatform: string | null

  @column()
  declare accessPointProfileFwVersion: string | null

  @column()
  declare accessPointProfilePushVersion: string | null

  @column()
  declare accessPointProfileOemVendor: string | null

  @column()
  declare accessPointProfileDialect: AdmsDialect

  @column()
  declare accessPointProfileLayoutKnown: number

  @column()
  declare accessPointProfileRegistryCode: string | null

  @column()
  declare accessPointProfileFpVersion: string | null

  @column()
  declare accessPointProfileFaceVersion: string | null

  @column()
  declare accessPointProfileFvVersion: string | null

  @column()
  declare accessPointProfilePvVersion: string | null

  @column({
    prepare: (value: AccessPointProfileVersionsSource | null) => jsonPrepare(value),
    consume: (value: string | AccessPointProfileVersionsSource | null) =>
      jsonConsume<AccessPointProfileVersionsSource>(value),
  })
  declare accessPointProfileVersionsSource: AccessPointProfileVersionsSource | null

  @column()
  declare accessPointProfileMultiBioDataSupport: string | null

  @column()
  declare accessPointProfileMultiBioPhotoSupport: string | null

  @column()
  declare accessPointProfileMultiBioVersion: string | null

  @column()
  declare accessPointProfileMaxMultiBioDataCount: string | null

  @column()
  declare accessPointProfileMaxMultiBioPhotoCount: string | null

  @column()
  declare accessPointProfileMaxFaceCount: number | null

  @column()
  declare accessPointProfileMaxUserPhotoCount: number | null

  @column()
  declare accessPointProfileUserCount: number | null

  @column()
  declare accessPointProfileFpCount: number | null

  @column()
  declare accessPointProfileFaceCount: number | null

  @column()
  declare accessPointProfileTransactionCount: number | null

  @column()
  declare accessPointProfileFingerFunOn: number | null

  @column()
  declare accessPointProfileFaceFunOn: number | null

  @column()
  declare accessPointProfilePhotoFunOn: number | null

  @column()
  declare accessPointProfileUserPicUrlFunOn: number | null

  @column()
  declare accessPointProfileSipEnableUnit: number | null

  @column()
  declare accessPointProfileVisualIntercomFunOn: number | null

  @column()
  declare accessPointProfileSubcontractingUpgradeFunOn: number | null

  @column()
  declare accessPointProfileVideoProtocol: string | null

  @column()
  declare accessPointProfileOptionsRaw: string | null

  @column.dateTime()
  declare accessPointProfileOptionsReadAt: DateTime | null

  @column.dateTime()
  declare accessPointProfileInfoReadAt: DateTime | null

  @column()
  declare accessPointProfileClockOffsetSeconds: number | null

  @column({
    prepare: (value: number[] | null) => jsonPrepare(value),
    consume: (value: string | number[] | null) => jsonConsume<number[]>(value),
  })
  declare accessPointProfileClockSamples: number[] | null

  @column.dateTime()
  declare accessPointProfileClockMeasuredAt: DateTime | null

  @column.dateTime()
  declare accessPointProfileClockSyncedAt: DateTime | null

  @column()
  declare accessPointProfileClockSyncStatus: AccessPointClockSyncStatus | null

  @column()
  declare accessPointProfileLastIpSeen: string | null

  @column.dateTime()
  declare accessPointProfileLastIpSeenAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare accessPointProfileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointProfileUpdatedAt: DateTime

  @belongsTo(() => AccessPoint, { foreignKey: 'accessPointId' })
  declare accessPoint: BelongsTo<typeof AccessPoint>
}

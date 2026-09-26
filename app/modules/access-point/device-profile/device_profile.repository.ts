import type { DateTime } from 'luxon'
import type AccessPointProfile from '#models/access_point_profile'
import type { AccessPointProfileVersionsSource } from '#models/access_point_profile'
import type { AdmsDialect } from '#modules/adms/adms.constants'

/** Ultima IP vista para el equipo, con el instante en que se vio. */
export interface DeviceProfileIpSighting {
  ip: string
  seenAt: DateTime
}

/** Lo que `options` aporta al perfil. Toda ausencia viaja como null. */
export interface DeviceProfilePatch {
  accessPointProfilePlatform: string | null
  accessPointProfileFwVersion: string | null
  accessPointProfilePushVersion: string | null
  accessPointProfileOemVendor: string | null
  accessPointProfileLayoutKnown: number
  accessPointProfileFpVersion: string | null
  accessPointProfileFaceVersion: string | null
  accessPointProfileFvVersion: string | null
  accessPointProfilePvVersion: string | null
  accessPointProfileVersionsSource: AccessPointProfileVersionsSource | null
  accessPointProfileMultiBioDataSupport: string | null
  accessPointProfileMultiBioPhotoSupport: string | null
  accessPointProfileMultiBioVersion: string | null
  accessPointProfileMaxMultiBioDataCount: string | null
  accessPointProfileMaxMultiBioPhotoCount: string | null
  accessPointProfileMaxFaceCount: number | null
  accessPointProfileMaxUserPhotoCount: number | null
  accessPointProfileMaxUserCount: number | null
  accessPointProfileMaxFingerCount: number | null
  accessPointProfileMaxAttLogCount: number | null
  accessPointProfileUserCount: number | null
  accessPointProfileFpCount: number | null
  accessPointProfileFaceCount: number | null
  accessPointProfileTransactionCount: number | null
  accessPointProfileFingerFunOn: number | null
  accessPointProfileFaceFunOn: number | null
  accessPointProfilePhotoFunOn: number | null
  accessPointProfileUserPicUrlFunOn: number | null
  accessPointProfileSipEnableUnit: number | null
  accessPointProfileVisualIntercomFunOn: number | null
  accessPointProfileSubcontractingUpgradeFunOn: number | null
  accessPointProfileVideoProtocol: string | null
  accessPointProfileOptionsRaw: string | null
  accessPointProfileOptionsReadAt: DateTime
}

/** Identidad que se copia a `access_points`: gana el aparato (spec 9.1). */
export interface AccessPointDescriptor {
  deviceName: string | null
  mac: string | null
  ip: string | null
  firmware: string | null
  platform: string | null
}

/**
 * Puerto del perfil del equipo. Ningun consumidor persiste el modelo por su
 * cuenta: el adaptador es el unico que escribe.
 */
export interface DeviceProfileRepository {
  ensure(accessPointId: number, businessUnitId: number): Promise<AccessPointProfile>
  findByAccessPoint(accessPointId: number): Promise<AccessPointProfile | null>
  setDialect(
    accessPointId: number,
    businessUnitId: number,
    dialect: AdmsDialect
  ): Promise<AdmsDialect>
  setRegistryCode(accessPointId: number, businessUnitId: number, code: string): Promise<void>
  recordIpSeen(
    accessPointId: number,
    businessUnitId: number,
    sighting: DeviceProfileIpSighting
  ): Promise<void>
  applyOptions(
    accessPointId: number,
    businessUnitId: number,
    patch: DeviceProfilePatch
  ): Promise<AccessPointProfile>
  copyDescriptor(accessPointId: number, descriptor: AccessPointDescriptor): Promise<void>
}

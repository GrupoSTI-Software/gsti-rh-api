import type { DateTime } from 'luxon'
import type AccessPointProfile from '#models/access_point_profile'
import type { AdmsDialect } from '#modules/adms/adms.constants'

/** Ultima IP vista para el equipo, con el instante en que se vio. */
export interface DeviceProfileIpSighting {
  ip: string
  seenAt: DateTime
}

/**
 * Puerto del perfil del equipo. Esta rebanada usa dialecto, codigo de registro
 * y la ultima IP vista. Ningun consumidor persiste el modelo por su cuenta: el
 * adaptador es el unico que escribe.
 */
export interface DeviceProfileRepository {
  ensure(accessPointId: number, businessUnitId: number): Promise<AccessPointProfile>
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
}

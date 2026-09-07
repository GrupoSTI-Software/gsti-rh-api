import AccessPointProfile from '#models/access_point_profile'
import { ADMS_DIALECT, type AdmsDialect } from '#modules/adms/adms.constants'
import type { DeviceProfileRepository } from './device_profile.repository.js'

/** Adaptador Lucid del perfil. `ensure` es idempotente por punto de acceso. */
export default class DeviceProfileRepositoryMysql implements DeviceProfileRepository {
  async ensure(accessPointId: number, businessUnitId: number): Promise<AccessPointProfile> {
    const existing = await AccessPointProfile.query()
      .where('access_point_id', accessPointId)
      .first()
    if (existing) return existing
    const profile = new AccessPointProfile()
    profile.accessPointId = accessPointId
    profile.businessUnitId = businessUnitId
    profile.accessPointProfileDialect = ADMS_DIALECT.UNKNOWN
    profile.accessPointProfileLayoutKnown = 0
    await profile.save()
    return profile
  }

  /** Devuelve el dialecto que quedo (el anterior si ya estaba fijado igual). */
  async setDialect(
    accessPointId: number,
    businessUnitId: number,
    dialect: AdmsDialect
  ): Promise<AdmsDialect> {
    const profile = await this.ensure(accessPointId, businessUnitId)
    if (profile.accessPointProfileDialect === dialect) return dialect
    profile.accessPointProfileDialect = dialect
    await profile.save()
    return dialect
  }

  async setRegistryCode(
    accessPointId: number,
    businessUnitId: number,
    code: string
  ): Promise<void> {
    const profile = await this.ensure(accessPointId, businessUnitId)
    if (profile.accessPointProfileRegistryCode === code) return
    profile.accessPointProfileRegistryCode = code
    await profile.save()
  }
}

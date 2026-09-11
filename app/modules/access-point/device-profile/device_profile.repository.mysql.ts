import AccessPoint from '#models/access_point'
import AccessPointProfile from '#models/access_point_profile'
import {
  ADMS_DIALECT,
  ADMS_PROFILE_UNSCOPED_REASON,
  type AdmsDialect,
} from '#modules/adms/adms.constants'
import { TenantContext } from '#utils/tenant_context'
import type {
  AccessPointDescriptor,
  DeviceProfileIpSighting,
  DeviceProfilePatch,
  DeviceProfileRepository,
} from './device_profile.repository.js'

/** Adaptador Lucid del perfil. `ensure` es idempotente por punto de acceso. */
export default class DeviceProfileRepositoryMysql implements DeviceProfileRepository {
  /**
   * La fila se busca FUERA del corte por empresa a proposito: la tabla tiene
   * UNIQUE por `access_point_id`, y si el punto de acceso cambio de empresa la
   * lectura scoped no veria el perfil viejo, intentaria insertar y chocaria
   * con la UNIQUE dejando el canal en 500 permanente para ese equipo. El
   * acotamiento real ya lo hizo el resolutor al mapear la serie a su empresa;
   * si la fila trae otra, se realinea.
   */
  async ensure(accessPointId: number, businessUnitId: number): Promise<AccessPointProfile> {
    const existing = await TenantContext.runUnscoped(
      () => AccessPointProfile.query().where('access_point_id', accessPointId).first(),
      ADMS_PROFILE_UNSCOPED_REASON
    )
    if (existing) {
      if (existing.businessUnitId !== businessUnitId) {
        existing.businessUnitId = businessUnitId
        await existing.save()
      }
      return existing
    }
    const profile = new AccessPointProfile()
    profile.accessPointId = accessPointId
    profile.businessUnitId = businessUnitId
    profile.accessPointProfileDialect = ADMS_DIALECT.UNKNOWN
    profile.accessPointProfileLayoutKnown = 0
    await profile.save()
    return profile
  }

  async recordIpSeen(
    accessPointId: number,
    businessUnitId: number,
    sighting: DeviceProfileIpSighting
  ): Promise<void> {
    const profile = await this.ensure(accessPointId, businessUnitId)
    profile.accessPointProfileLastIpSeen = sighting.ip
    profile.accessPointProfileLastIpSeenAt = sighting.seenAt
    await profile.save()
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

  /** Lectura para las rutas privadas: aqui SI aplica el corte por empresa. */
  async findByAccessPoint(accessPointId: number): Promise<AccessPointProfile | null> {
    return AccessPointProfile.query().where('access_point_id', accessPointId).first()
  }

  async applyOptions(
    accessPointId: number,
    businessUnitId: number,
    patch: DeviceProfilePatch
  ): Promise<AccessPointProfile> {
    const profile = await this.ensure(accessPointId, businessUnitId)
    profile.merge(patch)
    await profile.save()
    return profile
  }

  /** Solo pisa lo que el aparato declara; un null deja la columna como estaba. */
  async copyDescriptor(accessPointId: number, descriptor: AccessPointDescriptor): Promise<void> {
    const update: Record<string, string> = {}
    if (descriptor.deviceName !== null) update.access_point_device_name = descriptor.deviceName
    if (descriptor.mac !== null) update.access_point_mac = descriptor.mac
    if (descriptor.ip !== null) update.access_point_ip = descriptor.ip
    if (descriptor.firmware !== null) update.access_point_firmware = descriptor.firmware
    if (descriptor.platform !== null) update.access_point_platform = descriptor.platform
    if (Object.keys(update).length === 0) return
    await AccessPoint.query().where('access_point_id', accessPointId).update(update)
  }
}

import type { DateTime } from 'luxon'
import type { AccessPointClockSyncStatus } from '#models/access_point_profile'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type {
  ClockState,
  ClockStatePatch,
  DeviceClockRepository,
} from './device_clock.repository.js'

/**
 * Adaptador del estado del reloj. Vive en el perfil del equipo, que ya es la
 * fila unica por punto de acceso: no hace falta otra tabla.
 */
export default class DeviceClockRepositoryMysql implements DeviceClockRepository {
  constructor(
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql()
  ) {}

  async read(accessPointId: number, businessUnitId: number): Promise<ClockState> {
    const profile = await this.profiles.ensure(accessPointId, businessUnitId)
    return {
      samples: profile.accessPointProfileClockSamples ?? [],
      offsetSeconds: profile.accessPointProfileClockOffsetSeconds ?? null,
      measuredAt: profile.accessPointProfileClockMeasuredAt ?? null,
      syncedAt: profile.accessPointProfileClockSyncedAt ?? null,
      status: profile.accessPointProfileClockSyncStatus ?? null,
    }
  }

  async write(
    accessPointId: number,
    businessUnitId: number,
    patch: ClockStatePatch
  ): Promise<void> {
    const profile = await this.profiles.ensure(accessPointId, businessUnitId)
    profile.accessPointProfileClockSamples = patch.samples
    profile.accessPointProfileClockOffsetSeconds = patch.offsetSeconds
    profile.accessPointProfileClockMeasuredAt = patch.measuredAt
    if (patch.status !== undefined) profile.accessPointProfileClockSyncStatus = patch.status
    if (patch.syncedAt !== undefined) profile.accessPointProfileClockSyncedAt = patch.syncedAt
    await profile.save()
  }

  async setStatus(
    accessPointId: number,
    businessUnitId: number,
    status: AccessPointClockSyncStatus,
    syncedAt?: DateTime | null
  ): Promise<void> {
    const profile = await this.profiles.ensure(accessPointId, businessUnitId)
    profile.accessPointProfileClockSyncStatus = status
    if (syncedAt !== undefined) profile.accessPointProfileClockSyncedAt = syncedAt
    await profile.save()
  }
}

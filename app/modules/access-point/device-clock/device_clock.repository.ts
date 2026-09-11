import type { DateTime } from 'luxon'
import type { AccessPointClockSyncStatus } from '#models/access_point_profile'

/** Estado del reloj tal como esta guardado en el perfil del equipo. */
export interface ClockState {
  samples: number[]
  offsetSeconds: number | null
  measuredAt: DateTime | null
  syncedAt: DateTime | null
  status: AccessPointClockSyncStatus | null
}

export interface ClockStatePatch {
  samples: number[]
  offsetSeconds: number
  measuredAt: DateTime
  status?: AccessPointClockSyncStatus | null
  syncedAt?: DateTime | null
}

/** Puerto del estado del reloj (spec ADMS 6.7 y 9.1). */
export interface DeviceClockRepository {
  read(accessPointId: number, businessUnitId: number): Promise<ClockState>
  write(accessPointId: number, businessUnitId: number, patch: ClockStatePatch): Promise<void>
  setStatus(
    accessPointId: number,
    businessUnitId: number,
    status: AccessPointClockSyncStatus,
    syncedAt?: DateTime | null
  ): Promise<void>
}

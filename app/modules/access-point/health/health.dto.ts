import type { AdmsCapacitySource, AdmsHealthStatus } from './health.constants.js'
import type { AdmsDialect } from '#modules/adms/adms.constants'
import type { AccessPointClockSyncStatus } from '#models/access_point_profile'

/** Ocupacion de una modalidad en el equipo. */
export interface OccupancySlot {
  modality: 'users' | 'fingerprints' | 'faces' | 'transactions'
  count: number | null
  capacity: number | null
  /** `unknown` significa que el equipo no la declaro; no se inventa por modelo. */
  capacitySource: AdmsCapacitySource
  /** Fraccion ocupada, o `null` si falta cualquiera de los dos numeros. */
  ratio: number | null
}

export interface QueueHealth {
  pending: number
  inFlight: number
  failed: number
  /** Pendientes de un equipo que lleva rato sin latido. */
  stale: number
  /** Antiguedad del pendiente mas viejo, en segundos. */
  oldestPendingSeconds: number | null
}

export interface ClockHealth {
  offsetSeconds: number | null
  measuredAt: string | null
  syncedAt: string | null
  status: AccessPointClockSyncStatus | null
}

export interface HardeningHealth {
  /** Hay CIDRs configurados: sin ellos el canal acepta desde cualquier IP. */
  cidrRestricted: boolean
  lastIpSeen: string | null
  lastIpSeenAt: string | null
  ipAnomalyOpen: boolean
}

/** Modelo del catalogo de plataforma, si la unidad vino del inventario. */
export interface DeviceModelDto {
  platformDeviceModelId: number
  brand: string
  name: string
  /** El BO resuelve la imagen con este slug; sin modelo usa una generica. */
  slug: string
}

export interface AccessPointHealthDto {
  accessPointId: number
  name: string
  serialNumber: string | null
  /** Nombre que el propio aparato declara. Puede diferir del alias. */
  deviceName: string | null
  mac: string | null
  ip: string | null
  model: DeviceModelDto | null
  active: boolean
  status: AdmsHealthStatus
  lastSeenAt: string | null
  /** Ultima subida por tabla, tal como la reporto el avance de stamps. */
  lastUploadAt: Record<string, string | null>
  firmware: string | null
  platform: string | null
  pushVersion: string | null
  dialect: AdmsDialect | null
  layoutKnown: boolean
  versions: {
    fingerprint: string | null
    face: string | null
    fingerVein: string | null
    palm: string | null
  }
  clock: ClockHealth
  occupancy: OccupancySlot[]
  queue: QueueHealth
  openIncidents: number
  hardening: HardeningHealth
}

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

/**
 * Lo que Valanserh tiene registrado para este equipo.
 *
 * No es lo que el aparato dice tener: el firmware responde a INFO solo con sus
 * maximos y nunca declara conteos actuales, y el servidor no puede consultarlo.
 * Estos numeros salen del padron propio, que es el que el operador puede
 * accionar: vincular un PIN suelto o reintentar un alta que no se aplico.
 */
export interface EnrollmentHealth {
  /** Colaboradores cuya alta el equipo ya confirmo. */
  confirmedEmployees: number
  /** Altas o bajas que el equipo todavia no confirma. */
  pendingEmployees: number
  /** PIN que el equipo reporto y que nadie ha vinculado a una persona. */
  unmappedPins: number
  /** Biometricos resguardados que llegaron desde este equipo. */
  fingerprints: number
  faces: number
  palms: number
}

/**
 * Avisos abiertos del equipo, separados por lo que piden.
 *
 * Un `info` no pide nada -- la bitacora que subio el aparato, por ejemplo --
 * y contarlo junto a un `warning` convierte el indicador en ruido: si siempre
 * marca algo, deja de significar algo.
 */
export interface IncidentsHealth {
  /** Piden atencion: `warning` y `error`. */
  actionable: number
  /** Solo dejan constancia. */
  informational: number
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
  enrollment: EnrollmentHealth
  queue: QueueHealth
  openIncidents: IncidentsHealth
  hardening: HardeningHealth
}

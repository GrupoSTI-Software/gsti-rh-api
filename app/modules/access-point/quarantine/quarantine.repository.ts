import type { DateTime } from 'luxon'
import type { AdmsQuarantineHints, AdmsQuarantineStatus } from '#models/adms_quarantined_device'

export interface QuarantineRow {
  id: number
  serial: string
  status: AdmsQuarantineStatus
  hitCount: number
  lastIp: string
  firstSeenAt: DateTime
  lastSeenAt: DateTime
  hints: AdmsQuarantineHints | null
}

export interface QuarantineCreate {
  serial: string
  ip: string
  hints: AdmsQuarantineHints | null
  now: DateTime
}

export interface QuarantineTouch {
  ip: string
  hints: AdmsQuarantineHints | null
  now: DateTime
}

export interface QuarantineClaimOnContact {
  accessPointId: number
  businessUnitId: number
  now: DateTime
}

/** Puerto de la cuarentena de series (spec v2, 4.2 y 9.3). */
export interface QuarantineRepository {
  findBySerial(serial: string): Promise<QuarantineRow | null>
  create(input: QuarantineCreate): Promise<QuarantineRow>
  touch(id: number, input: QuarantineTouch): Promise<void>
  countCreatedByIpSince(ip: string, since: DateTime): Promise<number>
  markClaimed(id: number, input: QuarantineClaimOnContact): Promise<void>
}

import type { DateTime } from 'luxon'

export interface StampAdvance {
  accessPointId: number
  businessUnitId: number
  table: string
  value: string
  lines: number
  now: DateTime
}

export interface StampReset {
  accessPointId: number
  businessUnitId: number
  userId: number
  now: DateTime
}

export interface UploadProgressRow {
  table: string
  value: string
  lastUploadAt: DateTime | null
  lastUploadLines: number | null
  resetAt: DateTime | null
  resetByUserId: number | null
}

/** Puerto del avance por tabla (spec v2, 4.4). */
export interface UploadProgressRepository {
  stampsFor(accessPointId: number): Promise<Record<string, string>>
  advance(input: StampAdvance): Promise<void>
  listFor(accessPointId: number): Promise<UploadProgressRow[]>
  resetAll(input: StampReset): Promise<void>
}

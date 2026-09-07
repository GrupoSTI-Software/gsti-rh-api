import type { DateTime } from 'luxon'

export interface StampAdvance {
  accessPointId: number
  businessUnitId: number
  table: string
  value: string
  lines: number
  now: DateTime
}

/** Puerto del avance por tabla (spec v2, 4.4). */
export interface UploadProgressRepository {
  stampsFor(accessPointId: number): Promise<Record<string, string>>
  advance(input: StampAdvance): Promise<void>
}

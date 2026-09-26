import type { DateTime } from 'luxon'
import type { AdmsRawStatus } from '#modules/adms/adms.constants'

export interface RawMessageInsert {
  accessPointId: number | null
  businessUnitId: number | null
  serial: string
  remoteIp: string
  method: string
  path: string
  query: string | null
  table: string | null
  stamp: string | null
  contentType: string | null
  body: string
  bytes: number
  lineCount: number
  receivedAt: DateTime
}

export interface RawMessageFinish {
  status: AdmsRawStatus
  ack: string | null
  error: string | null
  processedAt: DateTime
}

/**
 * Puerto del respaldo crudo (spec v2, 4.3). Append-only: `insertReceived` ocurre
 * ANTES de parsear y es la condicion para acusar; `finish` solo actualiza estado.
 */
export interface RawMessageRepository {
  insertReceived(input: RawMessageInsert): Promise<number>
  finish(rawMessageId: number, patch: RawMessageFinish): Promise<void>
}

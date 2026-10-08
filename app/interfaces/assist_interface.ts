import { DateTime } from 'luxon'
import type { AssistLocationFlag } from '#constants/assist_location_flag'

interface AssistInterface {
  assistId: number | null
  assistEmpCode: string
  assistPunchTime: DateTime
  assistPunchTimeUtc: DateTime
  assistPunchTimeOrigin: DateTime
  assistTerminalSn: string
  assistTerminalAlias: string
  assistAreaAlias: string
  assistLongitude: string
  assistLatitude: string
  assistUploadTime: string | Date | null
  assistEmpId: number
  assistTerminalId: number
  assistAssistSyncId: string
  assistUsed: boolean
  assistCreatedAt: string | Date | null
  assistUpdatedAt: string | Date | null
  /**
   * Marca de ubicación (VLRH-H1791056345261). Solo existe cuando quien consulta
   * puede verla; sin permiso la clave no viaja.
   */
  assistLocationFlag?: AssistLocationFlag | null
}

export type { AssistInterface }

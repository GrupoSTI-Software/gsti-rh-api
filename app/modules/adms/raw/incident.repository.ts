import type { DateTime } from 'luxon'
import type { AdmsIncidentContext } from '#models/adms_incident'
import type { AdmsIncidentKind, AdmsIncidentSeverity } from '#modules/adms/adms.constants'

export interface IncidentScope {
  serial: string | null
  accessPointId: number | null
}

export interface IncidentRecord {
  kind: AdmsIncidentKind
  severity: AdmsIncidentSeverity
  code: string
  title: string
  detail: string
  key: string
  serial: string | null
  accessPointId: number | null
  businessUnitId: number | null
  rawMessageId: number | null
  deviceCommandId: number | null
  context: AdmsIncidentContext | null
  createdAt: DateTime
}

/** Puerto de incidentes. `findOpenSince` sostiene la deduplicacion por ventana. */
export interface IncidentRepository {
  findOpenSince(
    kind: AdmsIncidentKind,
    scope: IncidentScope,
    since: DateTime
  ): Promise<IncidentRecord | null>
  insert(record: IncidentRecord): Promise<number>
  /** Hay un incidente abierto de ese tipo para el dispositivo. */
  hasOpen(kind: AdmsIncidentKind, accessPointId: number): Promise<boolean>
  /**
   * Cierra los abiertos de ese tipo para el dispositivo y devuelve cuantos.
   *
   * Es para la causa que ya no existe, no para taparla: quien lo llama acaba
   * de comprobar que la condicion se resolvio.
   */
  resolveOpen(kind: AdmsIncidentKind, accessPointId: number, now: DateTime): Promise<number>
}

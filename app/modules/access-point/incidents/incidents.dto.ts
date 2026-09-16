import type AdmsIncident from '#models/adms_incident'
import type { AdmsIncidentContext } from '#models/adms_incident'

export interface IncidentDto {
  incidentId: number
  accessPointId: number | null
  kind: string
  severity: string
  code: string
  title: string
  detail: string
  key: string
  status: 'open' | 'resolved'
  context: AdmsIncidentContext | null
  resolvedAt: string | null
  resolvedByUserId: number | null
  createdAt: string
}

/**
 * El contexto sale tal como se guardo, y se guardo por lista blanca: nunca
 * lleva templates, fotos ni nombres (regla 13.11). El identificador del crudo
 * NO se expone: quien tenga que ver el cuerpo entra por su propia ruta, que
 * asienta el acceso.
 */
export function toIncidentDto(incident: AdmsIncident): IncidentDto {
  return {
    incidentId: incident.admsIncidentId,
    accessPointId: incident.accessPointId,
    kind: incident.admsIncidentKind,
    severity: incident.admsIncidentSeverity,
    code: incident.admsIncidentCode,
    title: incident.admsIncidentTitle,
    detail: incident.admsIncidentDetail,
    key: incident.admsIncidentKey,
    status: incident.admsIncidentStatus,
    context: incident.admsIncidentContext,
    resolvedAt: incident.admsIncidentResolvedAt?.toISO() ?? null,
    resolvedByUserId: incident.admsIncidentResolvedByUserId,
    createdAt: incident.admsIncidentCreatedAt.toISO() ?? '',
  }
}

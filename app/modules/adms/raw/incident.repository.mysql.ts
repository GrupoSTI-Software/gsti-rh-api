import type { DateTime } from 'luxon'
import AdmsIncident from '#models/adms_incident'
import type { AdmsIncidentKind } from '#modules/adms/adms.constants'
// El tipo se usa tambien en `hasOpen`, que no filtra por ventana.
import type { IncidentRecord, IncidentRepository, IncidentScope } from './incident.repository.js'

function toRecord(row: AdmsIncident): IncidentRecord {
  return {
    kind: row.admsIncidentKind,
    severity: row.admsIncidentSeverity,
    code: row.admsIncidentCode,
    title: row.admsIncidentTitle,
    detail: row.admsIncidentDetail,
    key: row.admsIncidentKey,
    serial: row.admsIncidentContext?.serial ?? null,
    accessPointId: row.accessPointId,
    businessUnitId: row.businessUnitId,
    rawMessageId: row.admsRawMessageId,
    deviceCommandId: row.deviceCommandId,
    context: row.admsIncidentContext,
    createdAt: row.admsIncidentCreatedAt,
  }
}

/**
 * Adaptador Lucid de incidentes. Los globales (sin punto de acceso) se
 * deduplican por la serie guardada en `context.serial`.
 */
export default class IncidentRepositoryMysql implements IncidentRepository {
  async findOpenSince(
    kind: AdmsIncidentKind,
    scope: IncidentScope,
    since: DateTime
  ): Promise<IncidentRecord | null> {
    const query = AdmsIncident.query()
      .where('adms_incident_kind', kind)
      .where('adms_incident_status', 'open')
      .where('adms_incident_created_at', '>=', since.toFormat('yyyy-MM-dd HH:mm:ss'))
    if (scope.accessPointId !== null) {
      query.where('access_point_id', scope.accessPointId)
    } else if (scope.serial !== null) {
      query
        .whereNull('access_point_id')
        .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(adms_incident_context, '$.serial')) = ?", [
          scope.serial,
        ])
    }
    const row = await query.orderBy('adms_incident_id', 'desc').first()
    return row ? toRecord(row) : null
  }

  async hasOpen(kind: AdmsIncidentKind, accessPointId: number): Promise<boolean> {
    const row = await AdmsIncident.query()
      .where('adms_incident_kind', kind)
      .where('adms_incident_status', 'open')
      .where('access_point_id', accessPointId)
      .first()
    return row !== null
  }

  async insert(record: IncidentRecord): Promise<number> {
    const incident = new AdmsIncident()
    incident.accessPointId = record.accessPointId
    incident.businessUnitId = record.businessUnitId
    incident.admsRawMessageId = record.rawMessageId
    incident.deviceCommandId = record.deviceCommandId
    incident.admsIncidentKind = record.kind
    incident.admsIncidentSeverity = record.severity
    incident.admsIncidentCode = record.code
    incident.admsIncidentTitle = record.title
    incident.admsIncidentDetail = record.detail
    incident.admsIncidentKey = record.key
    incident.admsIncidentContext = record.context
    incident.admsIncidentStatus = 'open'
    await incident.save()
    return incident.admsIncidentId
  }
}

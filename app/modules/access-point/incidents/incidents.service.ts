import { DateTime } from 'luxon'
import AdmsIncident from '#models/adms_incident'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import type { AdmsIncidentKind } from '#modules/adms/adms.constants'

export interface IncidentFilter {
  businessUnitIds: number[]
  status?: 'open' | 'resolved'
  kind?: AdmsIncidentKind
  accessPointId?: number
  limit: number
}

/**
 * Incidentes del canal para la pantalla de operacion (spec ADMS 9.2 y 11).
 *
 * Solo se ven los que tienen empresa. Los globales -- una serie desconocida
 * sondeando, una IP enumerando -- no cuelgan de ningun tenant y solo los ve
 * plataforma: mostrarlos aqui le contaria a una empresa que otra existe.
 */
export default class IncidentsService {
  async list(filter: IncidentFilter): Promise<AdmsIncident[]> {
    if (filter.businessUnitIds.length === 0) return []

    const query = AdmsIncident.query().whereIn('business_unit_id', filter.businessUnitIds)
    if (filter.status) query.where('adms_incident_status', filter.status)
    if (filter.kind) query.where('adms_incident_kind', filter.kind)
    if (filter.accessPointId !== undefined) {
      query.where('access_point_id', filter.accessPointId)
    }
    return query.orderBy('adms_incident_id', 'desc').limit(filter.limit)
  }

  /**
   * Marca resuelto un incidente del alcance.
   *
   * La lectura va con el corte por empresa explicito antes de escribir: un
   * incidente de otra empresa se comporta como inexistente (regla 13.3).
   *
   * Resolver es una anotacion, no un arreglo: si la causa sigue, el canal
   * levantara otro. Por eso no se toca nada del equipo aqui.
   */
  async resolve(input: {
    incidentId: number
    businessUnitIds: number[]
    userId: number | null
    now?: DateTime
  }): Promise<AdmsIncident> {
    const incident =
      input.businessUnitIds.length === 0
        ? null
        : await AdmsIncident.query()
            .where('adms_incident_id', input.incidentId)
            .whereIn('business_unit_id', input.businessUnitIds)
            .first()

    if (!incident) {
      throw new AdmsError(
        'El incidente no existe o no esta en tu alcance',
        ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'incidente-no-encontrado',
        'No se encontro el incidente.'
      )
    }

    if (incident.admsIncidentStatus === 'resolved') return incident

    incident.admsIncidentStatus = 'resolved'
    incident.admsIncidentResolvedAt = input.now ?? DateTime.utc()
    incident.admsIncidentResolvedByUserId = input.userId
    await incident.save()
    return incident
  }
}

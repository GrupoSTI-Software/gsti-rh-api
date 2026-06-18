import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Contrato del repositorio del catálogo federal de jornada (solo lectura).
 *
 * Aísla la consulta de las reglas federales (business_unit_id null) del país,
 * ordenadas cronológicamente para representar la gradualidad de la reforma.
 */
export interface FederalRepository {
  /** Reglas federales (business_unit_id null) del país, ordenadas por valid_from ASC. */
  listFederalRules(countryCode: string): Promise<WorkingTimeRule[]>
}

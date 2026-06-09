import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Contrato del repositorio de resolución de jornada efectiva (solo lectura).
 *
 * Aísla las consultas que necesita `getRulesForDate`: el override vigente de una
 * empresa a una fecha y las reglas federales candidatas del país.
 */
export interface EffectiveRepository {
  /** Override (business_unit_id no nulo) vigente de una empresa a la fecha dada. */
  findOverrideForDate(
    businessUnitId: number,
    countryCode: string,
    date: string
  ): Promise<WorkingTimeRule | null>

  /**
   * Reglas federales (business_unit_id null) del país, para resolver la vigente por
   * fecha en el service (incluye el fallback de ventana por effective_year).
   */
  findFederalCandidates(countryCode: string): Promise<WorkingTimeRule[]>
}

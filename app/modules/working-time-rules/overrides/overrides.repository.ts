import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Contrato del repositorio de overrides de jornada.
 *
 * Aísla el acceso a datos de la lógica de negocio del service. La validación de
 * coherencia (valores, no-traslape) la dispara el modelo en su hook beforeSave.
 */
export interface OverridesRepository {
  /** Lista los overrides (business_unit_id no nulo) de una empresa. */
  listByBusinessUnit(businessUnitId: number): Promise<WorkingTimeRule[]>

  /** Obtiene un override por id (solo filas con business_unit_id no nulo). */
  findOverrideById(id: number): Promise<WorkingTimeRule | null>

  /** Resuelve la regla federal (business_unit_id null) vigente a una fecha dada. */
  findFederalForDate(countryCode: string, date: string): Promise<WorkingTimeRule | null>

  /** Persiste un nuevo registro a partir de los atributos del modelo. */
  create(attributes: Partial<WorkingTimeRule>): Promise<WorkingTimeRule>

  /** Aplica cambios a un registro existente y lo persiste. */
  update(rule: WorkingTimeRule, attributes: Partial<WorkingTimeRule>): Promise<WorkingTimeRule>

  /** Borrado lógico del override. */
  softDelete(rule: WorkingTimeRule): Promise<void>
}

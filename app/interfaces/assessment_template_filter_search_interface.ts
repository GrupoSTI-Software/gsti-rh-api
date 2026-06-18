/**
 * Filtro `status` para el listado de plantillas (CAP-02-08-01):
 *  - 'active'   (default): sólo plantillas con `is_active = true`.
 *  - 'inactive':           sólo plantillas con `is_active = false`.
 *  - 'all':                ambas.
 */
export type AssessmentTemplateStatusFilter = 'active' | 'inactive' | 'all'

export interface AssessmentTemplateFilterSearchInterface {
  search?: string
  status?: AssessmentTemplateStatusFilter
  page: number
  limit: number
}

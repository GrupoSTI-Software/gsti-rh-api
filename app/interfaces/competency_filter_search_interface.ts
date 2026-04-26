export interface CompetencyFilterSearchInterface {
  search?: string
  competencyType?: 'technical' | 'transversal'
  page: number
  limit: number
}

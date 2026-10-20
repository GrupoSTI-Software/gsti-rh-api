export interface CompetencyFilterSearchInterface {
  search?: string
  competencyType?: 'technical' | 'functional'
  page: number
  limit: number
}

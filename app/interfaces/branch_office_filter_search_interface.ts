export interface BranchOfficeFilterSearchInterface {
  page?: number
  limit?: number
  businessUnitId?: number
  branchOfficeName?: string
  /** Orden alfabético por nombre: asc (predeterminado) o desc */
  sortOrder?: 'asc' | 'desc'
  includeDeleted?: boolean
}

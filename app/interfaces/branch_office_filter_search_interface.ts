export interface BranchOfficeFilterSearchInterface {
  page?: number
  limit?: number
  businessUnitId?: number
  branchOfficeName?: string
  /** Filtra sucursales ligadas a la empresa contratante indicada (sitios de servicio). */
  empresaContratanteId?: number
  /** Orden alfabético por nombre: asc (predeterminado) o desc */
  sortOrder?: 'asc' | 'desc'
  includeDeleted?: boolean
}

export type ProveedorRepseReviewStatus =
  | 'pending_first_validation'
  | 'on_track'
  | 'due_soon'
  | 'overdue'

export interface ProveedorRepseDto {
  proveedorRepseId: number
  businessUnitId: number
  razonSocial: string
  rfc: string
  folio: string
  objetoRegistrado: string
  folioVencimiento: string
  periodicidadMeses: number
  nextReviewAt: string | null
  reviewStatus: ProveedorRepseReviewStatus
  proveedorRepseCreatedAt: string | null
  proveedorRepseUpdatedAt: string | null
}

export interface ProveedorRepseListDto {
  meta: Record<string, unknown>
  data: ProveedorRepseDto[]
}

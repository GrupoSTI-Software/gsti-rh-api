export type ProveedorRepseReviewStatus =
  | 'pending_first_validation'
  | 'on_track'
  | 'due_soon'
  | 'overdue'

export type ProveedorRepseLastValidationEstatus = 'vigente' | 'no_vigente'

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
  /** Fecha `YYYY-MM-DD` de la validación más reciente de la bitácora; `null` si no tiene. */
  lastValidationAt: string | null
  /** Estatus de esa validación más reciente; `null` si no tiene. */
  lastValidationEstatus: ProveedorRepseLastValidationEstatus | null
  proveedorRepseCreatedAt: string | null
  proveedorRepseUpdatedAt: string | null
}

export interface ProveedorRepseListDto {
  meta: Record<string, unknown>
  data: ProveedorRepseDto[]
}

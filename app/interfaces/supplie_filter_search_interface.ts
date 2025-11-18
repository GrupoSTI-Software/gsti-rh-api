export interface SupplieFilterSearchInterface {
  page?: number
  limit?: number
  search?: string
  supplyTypeId?: number
  supplyName?: string
  supplyStatus?: 'active' | 'inactive' | 'lost' | 'damaged'
  supplyFileNumber?: number
  includeDeleted?: boolean
}

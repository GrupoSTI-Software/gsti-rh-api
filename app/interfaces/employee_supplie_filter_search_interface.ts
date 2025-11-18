export interface EmployeeSupplieFilterSearchInterface {
  page?: number
  limit?: number
  search?: string
  employeeId?: number
  supplyId?: number
  employeeSupplyStatus?: 'active' | 'retired' | 'shipping'
  supplyTypeId?: number
}

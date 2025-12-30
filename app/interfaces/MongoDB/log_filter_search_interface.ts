interface LogFilterSearchInterface {
  entity: string
  userId?: number
  startDate?: string
  endDate?: string
  otherFilters?: object
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export type { LogFilterSearchInterface }

interface PiiAccessLogsFiltersInterface {
  page?: number
  limit?: number
  model?: string
  column?: string
  recordId?: number
  accessorUserId?: number
  dateFrom?: Date
  dateTo?: Date
}

export type { PiiAccessLogsFiltersInterface }

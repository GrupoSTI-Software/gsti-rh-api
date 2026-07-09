interface PiiAccessInputInterface {
  businessUnitId: number
  accessorUserId: number
  model: string
  modelColumn: string
  recordId: number
  accessorIp: string
  accessorUserAgent?: string | null
  requestId?: string | null
}

export type { PiiAccessInputInterface }

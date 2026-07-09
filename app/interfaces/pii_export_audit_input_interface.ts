import type { PiiAccessLogColumnRefInterface } from './pii_access_log_column_ref_interface.js'

interface PiiExportAuditInputInterface {
  businessUnitId: number
  accessorUserId: number
  accessorIp: string
  accessorUserAgent?: string | null
  requestId?: string | null
  originModule?: string | null
  exportKey: string
  sensitiveColumns: PiiAccessLogColumnRefInterface[]
  employeeIds: number[]
  filters: Record<string, unknown>
  motive: string
  note?: string | null
}

export type { PiiExportAuditInputInterface }

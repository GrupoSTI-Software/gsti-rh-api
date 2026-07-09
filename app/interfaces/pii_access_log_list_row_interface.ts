import type { LegalCategory } from '#constants/sensitive_fields'

export type PiiAccessLogEntryType = 'reveal' | 'export'

export interface PiiAccessLogFieldRefInterface {
  model: string
  column: string
  legalCategory: LegalCategory | null
}

export interface PiiAccessLogSubjectRefInterface {
  employeeId: number
  displayName: string
}

export interface PiiAccessLogExportDetailInterface {
  exportKey: string
  motive: string
  note: string | null
  subjectCount: number
  columns: PiiAccessLogFieldRefInterface[]
  filters: Record<string, unknown> | null
  subjects: PiiAccessLogSubjectRefInterface[]
}

export interface PiiAccessLogListRowInterface {
  piiAccessLogId: number
  entryType: PiiAccessLogEntryType
  accessedAt: string
  accessorUserId: number
  accessorDisplayName: string
  originModule: string | null
  accessorIp: string
  businessUnitId: number
  field?: PiiAccessLogFieldRefInterface
  subject?: PiiAccessLogSubjectRefInterface
  export?: PiiAccessLogExportDetailInterface
}

export interface PiiAccessLogListResultInterface {
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
    page: number
    dateFrom: string
    dateTo: string
  }
  data: PiiAccessLogListRowInterface[]
}

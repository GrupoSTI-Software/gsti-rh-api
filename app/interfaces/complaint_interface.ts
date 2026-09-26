import type { ComplaintCategory, ComplaintStatus } from '../constants/complaint.js'
import type { ComplaintAttachmentRow } from './complaint_attachment_interface.js'

export interface CreateComplaintInput {
  category: string
  description: string
}

export interface ComplaintCreateResult {
  folio: string
  passphrase: string
  status: ComplaintStatus
  category: ComplaintCategory
  createdAt: string
}

export interface ComplaintStatusResult {
  folio: string
  status: ComplaintStatus
  category: ComplaintCategory
  categoryLabel: string
  createdAt: string
  updatedAt: string
}

export interface ConsultComplaintStatusInput {
  folio: string
  passphrase: string
}

/** Fila del tablero admin: sin identidad del denunciante. */
export interface ComplaintBoardListItem {
  complaintId: number
  folio: string
  category: ComplaintCategory
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
}

export interface ComplaintAdminResult {
  complaintId: number
  folio: string
  category: ComplaintCategory
  description: string
  status: ComplaintStatus
  businessUnitId: number
  createdAt: string
  updatedAt: string
}

export interface ComplaintListFilters {
  page?: number
  limit?: number
  status?: ComplaintStatus
  category?: string
}

export interface ComplaintListResult {
  meta: Record<string, unknown>
  data: ComplaintBoardListItem[]
}

export interface ComplaintStatusHistoryRow {
  complaintStatusHistoryId: number
  fromStatus: ComplaintStatus | null
  toStatus: ComplaintStatus
  note: string
  actorUserId: number
  actorDisplayName: string | null
  createdAt: string
}

export interface ComplaintDetailResult {
  complaintId: number
  folio: string
  category: ComplaintCategory
  description: string
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
  history: ComplaintStatusHistoryRow[]
  attachments: ComplaintAttachmentRow[]
}

export interface PatchComplaintStatusInput {
  toStatus: ComplaintStatus
  note: string
}

/** @deprecated Usar PatchComplaintStatusInput */
export interface UpdateComplaintStatusInput {
  status: ComplaintStatus
}

export interface RevealComplaintIdentityInput {
  justification: string
}

/** Identidad del denunciante; solo se expone vía POST reveal-identity. */
export interface ComplaintReporterIdentity {
  employeeId: number
  employeeCode: string | null
  fullName: string
  departmentName: string | null
  positionName: string | null
}

export interface ComplaintRevealIdentityResult {
  complaintId: number
  folio: string
  identity: ComplaintReporterIdentity
  audit: {
    complaintIdentityRevealAuditId: number
    justification: string
    revealedByUserId: number
    createdAt: string
  }
}

export interface ComplaintIdentityRevealAuditRow {
  complaintIdentityRevealAuditId: number
  complaintId: number
  revealedByUserId: number
  actorDisplayName: string | null
  justification: string
  createdAt: string
}

export interface ComplaintReportPeriod {
  from: string
  to: string
}

export interface ComplaintReportCategoryRow {
  category: ComplaintCategory
  count: number
}

/** Reporte agregado STPS; sin identidades ni detalle por caso. */
export interface ComplaintReportResult {
  period: ComplaintReportPeriod
  totalVolume: number
  byCategory: ComplaintReportCategoryRow[]
  /** Promedio en horas entre captura y primer estatus resuelto/cerrado; null si no hay casos resueltos. */
  averageResolutionTimeHours: number | null
  resolvedCasesCount: number
}

export type ComplaintReportExportFormat = 'xlsx' | 'pdf'

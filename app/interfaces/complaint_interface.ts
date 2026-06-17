import type { ComplaintCategory, ComplaintStatus } from '../constants/complaint.js'

export interface CreateComplaintInput {
  category: ComplaintCategory
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
  createdAt: string
  updatedAt: string
}

export interface ConsultComplaintStatusInput {
  folio: string
  passphrase: string
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
}

export interface ComplaintListResult {
  meta: Record<string, unknown>
  data: ComplaintAdminResult[]
}

export interface UpdateComplaintStatusInput {
  status: ComplaintStatus
}

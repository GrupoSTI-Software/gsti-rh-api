export interface ComplaintAttachmentRow {
  complaintAttachmentId: number
  complaintId: number
  fileName: string
  mimeType: string
  fileSize: number
  sanitized: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface ComplaintAttachmentDownloadResult {
  downloadUrl: string
  expiresInSeconds: number
}

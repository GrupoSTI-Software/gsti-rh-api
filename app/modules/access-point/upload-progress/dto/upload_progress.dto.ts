import type { UploadProgressRow } from '../upload_progress.repository.js'

export interface UploadProgressDto {
  table: string
  value: string
  lastUploadAt: string | null
  lastUploadLines: number | null
  resetAt: string | null
  resetByUserId: number | null
}

export function toUploadProgressDto(row: UploadProgressRow): UploadProgressDto {
  return {
    table: row.table,
    value: row.value,
    lastUploadAt: row.lastUploadAt?.toISO() ?? null,
    lastUploadLines: row.lastUploadLines,
    resetAt: row.resetAt?.toISO() ?? null,
    resetByUserId: row.resetByUserId,
  }
}

import vine from '@vinejs/vine'
import { LEGAL_DOCUMENT_TYPES } from './legal_document_query.validator.js'

export const LEGAL_DOCUMENT_STATUSES = ['draft', 'published'] as const

export const legalDocumentHistoryQueryValidator = vine.compile(
  vine.object({
    type: vine.enum(LEGAL_DOCUMENT_TYPES),
    status: vine.enum(LEGAL_DOCUMENT_STATUSES).optional(),
  })
)

export type LegalDocumentHistoryQueryInput = Awaited<
  ReturnType<typeof legalDocumentHistoryQueryValidator.validate>
>

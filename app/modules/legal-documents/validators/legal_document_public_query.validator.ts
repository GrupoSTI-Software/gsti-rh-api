import vine from '@vinejs/vine'

export const LEGAL_DOCUMENT_PUBLIC_TYPES = ['terms_conditions', 'privacy_notice'] as const
export const LEGAL_DOCUMENT_PUBLIC_LOCALES = ['es', 'en'] as const

export const legalDocumentPublicQueryValidator = vine.compile(
  vine.object({
    type: vine.enum(LEGAL_DOCUMENT_PUBLIC_TYPES),
    locale: vine.enum(LEGAL_DOCUMENT_PUBLIC_LOCALES).optional(),
  })
)

export type LegalDocumentPublicQueryInput = Awaited<
  ReturnType<typeof legalDocumentPublicQueryValidator.validate>
>

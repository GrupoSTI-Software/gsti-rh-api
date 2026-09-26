import vine from '@vinejs/vine'

export const LEGAL_DOCUMENT_TYPES = [
  'privacy_notice',
  'terms_conditions',
  'biometric_consent',
] as const

export const legalDocumentQueryValidator = vine.compile(
  vine.object({
    type: vine.enum(LEGAL_DOCUMENT_TYPES),
  })
)

export type LegalDocumentQueryInput = Awaited<
  ReturnType<typeof legalDocumentQueryValidator.validate>
>

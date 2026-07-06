export type LegalDocumentErrorKey = 'documento-legal-sin-version-vigente'

export default class LegalDocumentError extends Error {
  readonly key: LegalDocumentErrorKey

  constructor(key: LegalDocumentErrorKey, message?: string) {
    super(message ?? key)
    this.name = 'LegalDocumentError'
    this.key = key
  }
}

import type { EmployeeOffboardingDocumentType } from '../documents/documents.constants.js'

/**
 * Resultado de la revisión de una versión de plantilla (K-1, 2026-09-05).
 * Esta rebanada (USRH1788553841100) solo TIPA la columna y siempre escribe
 * `null`. La semántica la puebla ESB-05-07-08 (las tres listas y `passed`)
 * y ESB-05-07-14 (`structural`, con listas vacías y `passed: false`).
 * Ninguna hermana redeclara el tipo: lo importan de aquí.
 */
export type DocumentTemplateValidationResult = {
  checkedAt: string
  documentType: EmployeeOffboardingDocumentType
  passed: boolean
  recognized: string[]
  unrecognized: { fieldName: string; suggestedFieldKey: string | null }[]
  missingRequired: string[]
  structural?: { stage: string; reason: string; detail: string }
}

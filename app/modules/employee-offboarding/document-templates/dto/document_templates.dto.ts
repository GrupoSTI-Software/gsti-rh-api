import type EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import type { DocumentTemplateValidationResult } from '../document_template_validation_result.type.js'

/**
 * Versión de plantilla tal como viaja al cliente (USRH1788553841100).
 * Enumerado campo por campo: NUNCA `storageKey` ni `businessUnitId` — un
 * spread del modelo arrastraría la Key pese a `serializeAs: null`.
 */
export interface EmployeeOffboardingDocumentTemplateDto {
  employeeOffboardingDocumentTemplateId: number
  documentType: string
  versionNumber: number
  status: string
  originalFileName: string
  fileSizeBytes: number
  contentSha256: string
  /** `null` en esta rebanada; lo puebla ESB-05-07-08. */
  validationResult: DocumentTemplateValidationResult | null
  uploadedByUserId: number | null
  uploadedByUserName: string | null
  createdAt: string | null
}

/**
 * Entrada del catálogo: una por tipo declarado en
 * `EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE`; `usesSystemTemplate === (currentVersion === null)`.
 */
export interface EmployeeOffboardingDocumentTemplateCatalogEntryDto {
  documentType: string
  usesSystemTemplate: boolean
  currentVersion: EmployeeOffboardingDocumentTemplateDto | null
}

/** Serializa la versión sin exponer jamás la Key de S3 ni la empresa. */
export function toDocumentTemplateDto(
  record: EmployeeOffboardingDocumentTemplate,
  userNamesById: Map<number, string>
): EmployeeOffboardingDocumentTemplateDto {
  const uploadedByUserId = record.employeeOffboardingDocumentTemplateUploadedByUserId ?? null
  return {
    employeeOffboardingDocumentTemplateId: record.employeeOffboardingDocumentTemplateId,
    documentType: record.employeeOffboardingDocumentTemplateDocumentType,
    versionNumber: Number(record.employeeOffboardingDocumentTemplateVersionNumber),
    status: record.employeeOffboardingDocumentTemplateStatus,
    originalFileName: record.employeeOffboardingDocumentTemplateOriginalFileName,
    fileSizeBytes: Number(record.employeeOffboardingDocumentTemplateFileSizeBytes),
    contentSha256: record.employeeOffboardingDocumentTemplateContentSha256,
    validationResult: record.employeeOffboardingDocumentTemplateValidationResult ?? null,
    uploadedByUserId,
    uploadedByUserName:
      uploadedByUserId !== null ? userNamesById.get(uploadedByUserId) ?? null : null,
    createdAt: record.employeeOffboardingDocumentTemplateCreatedAt?.toISO() ?? null,
  }
}

import type EmployeeOffboardingDocument from '#models/employee_offboarding_document'

/**
 * Documento emitido tal como viaja al cliente (USRH1787433503686). NUNCA
 * incluye la Key de S3 ni el tipo de archivo (el PDF es invariante del slice).
 * Enumerado campo por campo: un spread del modelo arrastraría la Key pese
 * a `serializeAs: null`.
 */
export interface EmployeeOffboardingDocumentDto {
  employeeOffboardingDocumentId: number
  employeeOffboardingId: number
  documentType: string
  folio: string
  fileName: string
  employeeName: string
  positionName: string | null
  departmentName: string | null
  legalName: string
  hireDate: string | null
  referenceDate: string | null
  referenceDateSource: string
  seniorityDays: number
  contentHash: string
  sizeBytes: number
  isCurrent: boolean
  issuedAt: string | null
  issuedByUserId: number | null
  issuedByUserName: string | null
  supersededDocumentId: number | null
}

/** Serializa la emisión sin exponer jamás la Key de S3. */
export function toDocumentDto(
  record: EmployeeOffboardingDocument,
  userNamesById: Map<number, string>
): EmployeeOffboardingDocumentDto {
  const issuedByUserId = record.employeeOffboardingDocumentGeneratedByUserId ?? null
  return {
    employeeOffboardingDocumentId: record.employeeOffboardingDocumentId,
    employeeOffboardingId: record.employeeOffboardingId,
    documentType: record.employeeOffboardingDocumentType,
    folio: record.employeeOffboardingDocumentFolio,
    fileName: record.employeeOffboardingDocumentFileName,
    employeeName: record.employeeOffboardingDocumentEmployeeName,
    positionName: record.employeeOffboardingDocumentPositionName ?? null,
    departmentName: record.employeeOffboardingDocumentDepartmentName ?? null,
    legalName: record.employeeOffboardingDocumentLegalName,
    hireDate: record.employeeOffboardingDocumentHireDate?.toISODate() ?? null,
    referenceDate: record.employeeOffboardingDocumentReferenceDate?.toISODate() ?? null,
    referenceDateSource: record.employeeOffboardingDocumentReferenceDateSource,
    seniorityDays: Number(record.employeeOffboardingDocumentSeniorityDays),
    contentHash: record.employeeOffboardingDocumentContentHash,
    sizeBytes: Number(record.employeeOffboardingDocumentSizeBytes),
    isCurrent: Boolean(record.employeeOffboardingDocumentIsCurrent),
    issuedAt: record.employeeOffboardingDocumentCreatedAt?.toISO() ?? null,
    issuedByUserId,
    issuedByUserName:
      issuedByUserId !== null ? (userNamesById.get(issuedByUserId) ?? null) : null,
    supersededDocumentId: record.employeeOffboardingDocumentSupersededDocumentId ?? null,
  }
}

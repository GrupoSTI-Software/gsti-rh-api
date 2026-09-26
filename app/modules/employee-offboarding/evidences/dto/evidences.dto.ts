import type EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'

/**
 * Evidencia tal como viaja al cliente (spec §9.1 de USRH1786568279593).
 * NUNCA incluye la Key de S3: el modelo la marca `serializeAs: null` y este
 * DTO ni la nombra.
 */
export interface EmployeeOffboardingItemEvidenceDto {
  employeeOffboardingItemEvidenceId: number
  employeeOffboardingItemId: number
  employeeOffboardingItemEvidenceOriginalName: string | null
  employeeOffboardingItemEvidenceCreatedAt: string | null
}

/** Serializa la evidencia sin exponer jamás la Key de S3. */
export function toEvidenceDto(
  evidence: EmployeeOffboardingItemEvidence
): EmployeeOffboardingItemEvidenceDto {
  return {
    employeeOffboardingItemEvidenceId: evidence.employeeOffboardingItemEvidenceId,
    employeeOffboardingItemId: evidence.employeeOffboardingItemId,
    employeeOffboardingItemEvidenceOriginalName:
      evidence.employeeOffboardingItemEvidenceOriginalName ?? null,
    employeeOffboardingItemEvidenceCreatedAt:
      evidence.employeeOffboardingItemEvidenceCreatedAt?.toISO() ?? null,
  }
}

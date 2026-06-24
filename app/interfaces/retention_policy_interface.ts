import type { RetentionPolicyEvidenceType } from '#constants/retention_policy'

/** Resultado de lectura/escritura expuesto al cliente. */
export interface RetentionPolicyResult {
  retentionPolicyId: number | null
  businessUnitId: number
  retentionPolicyIsActive: boolean
  retentionPolicyRetentionYears: number
  retentionPolicyCoveredEvidenceTypes: RetentionPolicyEvidenceType[]
  retentionPolicyUpdatedByUserId: number | null
  retentionPolicyUpdatedAt: string | null
}

/** Payload validado del PUT upsert. */
export interface UpsertRetentionPolicyInput {
  retentionPolicyIsActive: boolean
  retentionPolicyRetentionYears: number
  retentionPolicyCoveredEvidenceTypes: RetentionPolicyEvidenceType[]
}

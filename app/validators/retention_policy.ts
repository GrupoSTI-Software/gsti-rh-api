import vine from '@vinejs/vine'
import {
  RETENTION_POLICY_EVIDENCE_TYPES,
  RETENTION_POLICY_MIN_YEARS,
  RETENTION_POLICY_MAX_YEARS,
} from '#constants/retention_policy'

export const upsertRetentionPolicyValidator = vine.compile(
  vine.object({
    retentionPolicyIsActive: vine.boolean(),
    retentionPolicyRetentionYears: vine
      .number()
      .min(RETENTION_POLICY_MIN_YEARS)
      .max(RETENTION_POLICY_MAX_YEARS)
      .withoutDecimals(),
    retentionPolicyCoveredEvidenceTypes: vine
      .array(vine.enum(RETENTION_POLICY_EVIDENCE_TYPES))
      .minLength(1),
  })
)

export type UpsertRetentionPolicyPayload = Awaited<
  ReturnType<typeof upsertRetentionPolicyValidator.validate>
>

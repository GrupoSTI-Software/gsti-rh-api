import RetentionPolicy from '#models/retention_policy'
import { RETENTION_POLICY_ERROR_CODES } from '#constants/retention_policy_error_codes'
import {
  RETENTION_POLICY_DEFAULT_YEARS,
  RETENTION_POLICY_EVIDENCE_TYPES,
  type RetentionPolicyEvidenceType,
} from '#constants/retention_policy'
import { RetentionPolicyServiceError } from '#exceptions/retention_policy_service_error'
import type {
  RetentionPolicyResult,
  UpsertRetentionPolicyInput,
} from '../interfaces/retention_policy_interface.js'

export default class RetentionPolicyService {
  /**
   * Devuelve la política de retención de la business unit indicada.
   * Si no existe registro en BD responde el default virtual sin crear nada (regla 2).
   * Nunca lanza error por ausencia de política.
   */
  async getByBusinessUnit(businessUnitId: number): Promise<RetentionPolicyResult> {
    const policy = await RetentionPolicy.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('retention_policy_deleted_at')
      .first()

    if (!policy) {
      return this.buildDefaultResult(businessUnitId)
    }

    return this.toResult(policy)
  }

  /**
   * Upsert idempotente de la política de retención.
   * El businessUnitId viene siempre del contexto autenticado (anti-IDOR).
   * Registra updatedBy en cada escritura y createdBy en el alta inicial.
   */
  async upsert(
    input: UpsertRetentionPolicyInput,
    businessUnitId: number,
    actorUserId: number
  ): Promise<RetentionPolicyResult> {
    this.assertScopeResolved(businessUnitId)

    const updatePayload = {
      retentionPolicyIsActive: input.retentionPolicyIsActive,
      retentionPolicyRetentionYears: input.retentionPolicyRetentionYears,
      retentionPolicyCoveredEvidenceTypes: input.retentionPolicyCoveredEvidenceTypes,
      retentionPolicyUpdatedByUserId: actorUserId,
    }

    const existing = await RetentionPolicy.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('retention_policy_deleted_at')
      .first()

    let policy: RetentionPolicy

    if (existing) {
      existing.merge(updatePayload)
      await existing.save()
      policy = existing
    } else {
      policy = await RetentionPolicy.create({
        businessUnitId,
        retentionPolicyCreatedByUserId: actorUserId,
        ...updatePayload,
      })
    }

    return this.toResult(policy)
  }

  /** Falla cerrado si el scope no está resuelto (cross-tenant / scope vacío). */
  private assertScopeResolved(businessUnitId: number): void {
    if (!businessUnitId || businessUnitId <= 0) {
      throw RetentionPolicyServiceError.withMessageKey(
        'nom035.retention_policy.forbidden_scope',
        RETENTION_POLICY_ERROR_CODES.FORBIDDEN_SCOPE,
        403,
        'forbidden-scope'
      )
    }
  }

  /** Proyecta un modelo a la interfaz de resultado. */
  private toResult(policy: RetentionPolicy): RetentionPolicyResult {
    return {
      retentionPolicyId: policy.retentionPolicyId,
      businessUnitId: policy.businessUnitId,
      retentionPolicyIsActive: policy.retentionPolicyIsActive,
      retentionPolicyRetentionYears: policy.retentionPolicyRetentionYears,
      retentionPolicyCoveredEvidenceTypes: policy.retentionPolicyCoveredEvidenceTypes,
      retentionPolicyUpdatedByUserId: policy.retentionPolicyUpdatedByUserId,
      retentionPolicyUpdatedAt: policy.retentionPolicyUpdatedAt?.toISO() ?? null,
    }
  }

  /** Default virtual: inactiva, 4 años, todos los tipos de evidencia. */
  private buildDefaultResult(businessUnitId: number): RetentionPolicyResult {
    return {
      retentionPolicyId: null,
      businessUnitId,
      retentionPolicyIsActive: false,
      retentionPolicyRetentionYears: RETENTION_POLICY_DEFAULT_YEARS,
      retentionPolicyCoveredEvidenceTypes: [...RETENTION_POLICY_EVIDENCE_TYPES] as RetentionPolicyEvidenceType[],
      retentionPolicyUpdatedByUserId: null,
      retentionPolicyUpdatedAt: null,
    }
  }
}

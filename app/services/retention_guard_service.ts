import { DateTime } from 'luxon'
import RetentionPolicyService from '#services/retention_policy_service'
import { RETENTION_GUARD_ERROR_CODES } from '#constants/retention_guard_error_codes'
import type { RetentionPolicyEvidenceType } from '#constants/retention_policy'
import { RetentionGuardError } from '#exceptions/retention_guard_error'

/** Registro mínimo para evaluar protección en borrado en lote. */
export interface GuardRecord {
  id: number
  elaboratedAt: DateTime
}

/**
 * Servicio de guarda de retención NOM-035 (ESB-08-06-03-02).
 *
 * Punto único de evaluación: consulta la política de -01 y decide si un borrado
 * puede proceder. Nunca elimina; solo bloquea o deja pasar.
 *
 * Reglas embebidas:
 *  1. Bloqueo solo si `policy.isActive = true`.
 *  2. Protegido ⟺ `ahora - elaboratedAt < retentionYears`.
 *  3. Solo bloquea si el tipo de evidencia está en `coveredEvidenceTypes`.
 *  4. Borrado en lote: si ≥1 protegido → abortar sobre los protegidos e identificar ofensores.
 *  5. Política ausente → default virtual inactivo → no bloquea.
 */
export default class RetentionGuardService {
  private readonly policyService = new RetentionPolicyService()

  /**
   * Verifica que un registro individual puede eliminarse.
   * Lanza `RetentionGuardError` (409) si está protegido; de lo contrario retorna sin hacer nada.
   *
   * @param businessUnitId  Empresa dueña del registro (nunca del payload).
   * @param evidenceType    Tipo de evidencia según el enum de política.
   * @param elaboratedAt    Fecha de elaboración del registro.
   */
  async assertCanDelete(
    businessUnitId: number,
    evidenceType: RetentionPolicyEvidenceType,
    elaboratedAt: DateTime
  ): Promise<void> {
    const policy = await this.policyService.getByBusinessUnit(businessUnitId)

    if (!policy.retentionPolicyIsActive) return
    if (!policy.retentionPolicyCoveredEvidenceTypes.includes(evidenceType)) return

    const protectedUntil = elaboratedAt.plus({ years: policy.retentionPolicyRetentionYears })

    if (DateTime.now() < protectedUntil) {
      throw new RetentionGuardError(
        'nom035.retention_guard.delete_blocked',
        RETENTION_GUARD_ERROR_CODES.DELETE_BLOCKED,
        409,
        'delete-blocked',
        protectedUntil.toISODate()!
      )
    }
  }

  /**
   * Verifica que todos los registros de un lote pueden eliminarse (semántica todo-o-nada).
   * Si ≥1 está protegido, lanza `RetentionGuardError` (409) con los IDs ofensores.
   * Los registros ya vencidos dentro del mismo lote se dejan pasar; no se mezclan.
   *
   * @param businessUnitId  Empresa dueña de todos los registros del lote.
   * @param evidenceType    Tipo de evidencia del lote.
   * @param records         Lista de registros con su fecha de elaboración.
   */
  async assertCanDeleteBulk(
    businessUnitId: number,
    evidenceType: RetentionPolicyEvidenceType,
    records: GuardRecord[]
  ): Promise<void> {
    const policy = await this.policyService.getByBusinessUnit(businessUnitId)

    if (!policy.retentionPolicyIsActive) return
    if (!policy.retentionPolicyCoveredEvidenceTypes.includes(evidenceType)) return

    const now = DateTime.now()
    const blocked = records.filter((r) => {
      const protectedUntil = r.elaboratedAt.plus({ years: policy.retentionPolicyRetentionYears })
      return now < protectedUntil
    })

    if (blocked.length > 0) {
      const offenderIds = blocked.map((r) => r.id).join(', ')
      throw new RetentionGuardError(
        'nom035.retention_guard.bulk_delete_blocked',
        RETENTION_GUARD_ERROR_CODES.BULK_DELETE_BLOCKED,
        409,
        'bulk-delete-blocked',
        offenderIds
      )
    }
  }
}

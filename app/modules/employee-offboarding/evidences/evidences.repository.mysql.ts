import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'
import type { EvidenceCreateData, EvidencesRepository } from './evidences.repository.js'

/**
 * Adaptador MySQL de las evidencias de salida (USRH1786568279593). Único
 * punto del slice que toca Lucid. El filtro de empresa va EXPLÍCITO sobre el
 * expediente (D-8); los modelos del expediente no componen el mixin de
 * tenant, así que no hace falta `runUnscoped` en este slice.
 */
export default class EvidencesRepositoryMysql implements EvidencesRepository {
  async findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeOffboarding.query()
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_offboarding_deleted_at')
      .first()
  }

  async findItemInCase(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number
  ): Promise<EmployeeOffboardingItem | null> {
    return await EmployeeOffboardingItem.query()
      .where('employee_offboarding_item_id', employeeOffboardingItemId)
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereNull('employee_offboarding_item_deleted_at')
      .first()
  }

  async listByItem(
    employeeOffboardingItemId: number
  ): Promise<EmployeeOffboardingItemEvidence[]> {
    return await EmployeeOffboardingItemEvidence.query()
      .where('employee_offboarding_item_id', employeeOffboardingItemId)
      .whereNull('employee_offboarding_item_evidence_deleted_at')
      .orderBy('employee_offboarding_item_evidence_created_at', 'desc')
      .orderBy('employee_offboarding_item_evidence_id', 'desc')
  }

  async findEvidenceInItem(
    employeeOffboardingItemId: number,
    employeeOffboardingItemEvidenceId: number
  ): Promise<EmployeeOffboardingItemEvidence | null> {
    return await EmployeeOffboardingItemEvidence.query()
      .where('employee_offboarding_item_evidence_id', employeeOffboardingItemEvidenceId)
      .where('employee_offboarding_item_id', employeeOffboardingItemId)
      .whereNull('employee_offboarding_item_evidence_deleted_at')
      .first()
  }

  async createEvidences(
    rows: EvidenceCreateData[],
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingItemEvidence[]> {
    return await EmployeeOffboardingItemEvidence.createMany(rows, { client: trx })
  }

  async softDeleteEvidence(evidence: EmployeeOffboardingItemEvidence): Promise<void> {
    await evidence.delete()
  }
}
